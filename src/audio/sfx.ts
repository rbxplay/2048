export type SfxName = 'move' | 'merge' | 'spawn' | 'invalid' | 'win' | 'over'

/** Gain đỉnh mỗi âm — bảng gain của B7. */
export const SFX_GAINS: Record<SfxName, number> = {
  move: 0.35,
  merge: 0.55,
  spawn: 0.2,
  invalid: 0.45,
  win: 0.8,
  over: 0.7,
}

/** Tần số gốc của sfx.merge (nốt La 3). */
export const MERGE_BASE_HZ = 220

/** B7: cap ở +12 semitone. */
const MAX_SEMITONES = 12

/**
 * Tần số cho `sfx.merge` theo giá trị tile.
 *
 * Mỗi lần gấp đôi giá trị tile thì lên 1 semitone (B7), cap ở +12 để tile
 * 8192 trở lên không chói tai.
 */
export function mergeFrequency(value: number, base: number = MERGE_BASE_HZ): number {
  if (!Number.isFinite(value) || value <= 0) return base
  const semitones = Math.min(MAX_SEMITONES, Math.max(0, Math.log2(value) - 1))
  return base * 2 ** (semitones / 12)
}

type Envelope = { wave: OscillatorType; hz: number; seconds: number; hzTo?: number }

/** Hình dạng từng âm: sóng, tần số, thời lượng. Gain lấy từ SFX_GAINS. */
const SHAPES: Record<SfxName, Envelope> = {
  move: { wave: 'triangle', hz: 330, hzTo: 260, seconds: 0.07 },
  merge: { wave: 'sine', hz: MERGE_BASE_HZ, seconds: 0.12 },
  spawn: { wave: 'triangle', hz: 440, seconds: 0.06 },
  invalid: { wave: 'square', hz: 150, hzTo: 110, seconds: 0.08 },
  win: { wave: 'sine', hz: 523.25, hzTo: 783.99, seconds: 1.2 },
  over: { wave: 'sine', hz: 392, hzTo: 196, seconds: 1.0 },
}

export type Sfx = {
  /** Gọi ở lần input đầu tiên và ở mỗi onResume — rủi ro R1. */
  unlock(): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  play(name: SfxName): void
  playMerge(value: number): void
  destroy(): void
}

export function createSfx(opts: {
  contextFactory?: () => AudioContext | null
} = {}): Sfx {
  const factory =
    opts.contextFactory ??
    (() => {
      const Ctor =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      return Ctor === undefined ? null : new Ctor()
    })

  let ctx: AudioContext | null = null
  let ctxFailed = false
  let volume = 0.7
  let muted = false

  function context(): AudioContext | null {
    if (ctxFailed) return null
    if (ctx !== null) return ctx
    try {
      ctx = factory()
      if (ctx === null) {
        ctxFailed = true
        return null
      }
      return ctx
    } catch {
      ctxFailed = true
      return null
    }
  }

  /** true khi không được phép phát ra tiếng nào. */
  function silenced(): boolean {
    return muted || volume <= 0
  }

  function tone(env: Envelope, peak: number): void {
    // Khi YouTube mute thì im lặng TUYỆT ĐỐI: không tạo node nào cả, chứ không
    // phải tạo rồi đặt gain 0 (A9 MUST).
    if (silenced()) return
    const audio = context()
    if (audio === null) return
    try {
      const now = audio.currentTime
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = env.wave
      osc.frequency.setValueAtTime(env.hz, now)
      if (env.hzTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, env.hzTo), now + env.seconds)
      }
      gain.gain.setValueAtTime(peak, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + env.seconds)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start(now)
      osc.stop(now + env.seconds + 0.02)
    } catch {
      // Audio lỗi KHÔNG BAO GIỜ được chặn gameplay (§10.3).
    }
  }

  function play(name: SfxName): void {
    tone(SHAPES[name], SFX_GAINS[name] * volume)
  }

  function playMerge(value: number): void {
    tone({ ...SHAPES.merge, hz: mergeFrequency(value) }, SFX_GAINS.merge * volume)
  }

  function unlock(): void {
    const audio = context()
    if (audio === null) return
    try {
      if (audio.state === 'suspended') void audio.resume().catch(() => {})
    } catch {
      // bỏ qua
    }
  }

  function setVolume(v: number): void {
    volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
  }

  function setMuted(m: boolean): void {
    muted = m
  }

  function destroy(): void {
    try {
      // `.catch` giống đường resume ở `unlock`: `close()` trả Promise, mà một
      // rejection không ai bắt sẽ thành lỗi console — audio không được gây ồn.
      void ctx?.close().catch(() => {})
    } catch {
      // bỏ qua
    }
    ctx = null
  }

  return { unlock, setVolume, setMuted, play, playMerge, destroy }
}
