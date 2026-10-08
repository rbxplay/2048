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
 * Thời gian tắt khi CẮT TIẾNG giữa chừng, giây.
 *
 * 20 ms là đủ để không nghe tiếng "tạch" do gain nhảy bậc, mà vẫn là im tiếng
 * ngay ở thang thời gian tai người.
 */
const CUT_FADE_SECONDS = 0.02

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

/**
 * Một nốt của một âm.
 *
 * §10.1 không mô tả mỗi âm bằng một oscillator: `merge` là "sine + hài bậc 2"
 * (2 nốt), `win` là "hợp âm 3 nốt đi lên" (3 nốt), `over` là "hai nốt đi xuống"
 * (2 nốt). Sáu âm vì thế dựng 10 oscillator, không phải 6.
 */
type Note = {
  wave: OscillatorType
  /** Tần số nốt nền, Hz. Với `sfx.merge` đây là tần số CHƯA nhân tỉ lệ tile. */
  hz: number
  /** Bội của nốt nền trong cùng một âm — hài bậc 2 là `2`. */
  partial?: number
  /** Quét tần số tới đây, kết thúc ở cuối nốt (move/invalid quét xuống). */
  hzTo?: number
  /** Thời lượng của chính nốt này. */
  seconds: number
  /** Trễ bắt đầu, cho nốt NỐI TIẾP (over) — nốt rời, không phải glissando. */
  delay?: number
  /**
   * Phần của gain token (§B7) mà nốt này mang. Tổng `weight` trong một âm bằng
   * 1, để gain token vẫn là ĐỈNH CỦA CẢ ÂM: ba nốt hợp âm cùng mang .8 sẽ to
   * gấp ba và méo tiếng.
   */
  weight: number
}

/**
 * Hình dạng từng âm — bảng §10.1, mỗi dòng là danh sách nốt.
 *
 * Thời lượng của cả âm là `max(delay + seconds)` trên các nốt, và phải bằng cột
 * "Thời lượng" của §10.1; test giữ bản sao của bảng đó và đối chiếu.
 */
const NOTES: Record<SfxName, readonly Note[]> = {
  // triangle, quét nhẹ xuống — 70 ms.
  move: [{ wave: 'triangle', hz: 330, hzTo: 260, seconds: 0.07, weight: 1 }],
  // sine + hài bậc 2 — 120 ms. Hài nhỏ hơn nốt nền để không phình đỉnh.
  merge: [
    { wave: 'sine', hz: MERGE_BASE_HZ, seconds: 0.12, weight: 0.65 },
    { wave: 'sine', hz: MERGE_BASE_HZ, partial: 2, seconds: 0.12, weight: 0.35 },
  ],
  // triangle, gain thấp — 60 ms.
  spawn: [{ wave: 'triangle', hz: 440, seconds: 0.06, weight: 1 }],
  // square, giảm nhanh — 80 ms.
  invalid: [{ wave: 'square', hz: 150, hzTo: 110, seconds: 0.08, weight: 1 }],
  // Hợp âm 3 nốt đi lên (C5–E5–G5), vang CÙNG LÚC — 1.2 s.
  win: [
    { wave: 'sine', hz: 523.25, seconds: 1.2, weight: 0.5 },
    { wave: 'sine', hz: 659.25, seconds: 1.2, weight: 0.3 },
    { wave: 'sine', hz: 783.99, seconds: 1.2, weight: 0.2 },
  ],
  // Hai nốt đi xuống (G4 rồi G3), NỐI TIẾP — 0,5 s + 0,5 s = 1.0 s.
  over: [
    { wave: 'sine', hz: 392, seconds: 0.5, weight: 0.6 },
    { wave: 'sine', hz: 196, seconds: 0.5, delay: 0.5, weight: 0.4 },
  ],
}

export type Sfx = {
  /**
   * Khởi động audio: tạo `AudioContext` nếu chưa có, và resume nếu đang
   * `suspended`.
   *
   * Gọi ở **lúc boot** — §10.3: "Tạo `AudioContext` lúc boot, không chờ user
   * gesture" — *và* ở lần input đầu tiên, *và* ở mỗi `onResume` (rủi ro R1).
   * Bỏ lần gọi lúc boot thì âm `spawn` của ván đầu câm vì context chưa tồn tại.
   */
  unlock(): void
  setVolume(volume: number): void
  /**
   * Tắt/bật tiếng. Tắt thì **im ngay**: chặn âm về sau *và* cắt những nốt đang
   * kêu (hợp âm `win` dài 1,2 s). `onPause` dựa vào vế thứ hai để thoả §6.
   */
  setMuted(muted: boolean): void
  play(name: SfxName): void
  playMerge(value: number): void
  destroy(): void
  /**
   * Số lỗi WebAudio đã bị nuốt im lặng (§10.3 cấm để audio chặn gameplay).
   *
   * §10.3 KHÔNG cho phép nuốt mà không để lại dấu vết: một fixture/thiết bị
   * thiếu method sẽ làm âm câm trong production mà test "không throw" vẫn xanh.
   * Chỉ để chẩn đoán và test đọc — không phải bề mặt cho người chơi.
   */
  readonly audioFailures: number
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
  let failures = 0
  let warned = false

  /**
   * Gain của những nốt ĐANG kêu.
   *
   * Phải giữ tham chiếu thì `setMuted(true)` mới cắt được tiếng đang vang: mỗi
   * nốt tự nối thẳng vào `destination` rồi không ai nhớ tới nó nữa. Nốt kết thúc
   * thì tự rút khỏi tập, nên tập này không phình theo độ dài ván đấu.
   */
  const live = new Set<GainNode>

  /**
   * Ghi nhận một lỗi audio đã bị nuốt, rồi cảnh báo MỘT lần cho mỗi instance.
   *
   * Không được ném: hàm này chạy trong chính đường `catch`.
   */
  function swallow(): void {
    failures++
    if (warned) return
    warned = true
    try {
      console.warn('[audio] WebAudio lỗi — ván đấu tiếp tục, âm thanh có thể câm')
    } catch {
      // console cũng có thể bị chặn; chẩn đoán không được phép ném.
    }
  }

  function context(): AudioContext | null {
    if (ctxFailed) return null
    if (ctx !== null) return ctx
    try {
      ctx = factory()
      if (ctx === null) {
        // Thiếu AudioContext (jsdom, môi trường lạ) là bình thường, KHÔNG phải
        // lỗi — không tính vào `audioFailures`.
        ctxFailed = true
        return null
      }
      return ctx
    } catch {
      ctxFailed = true
      swallow()
      return null
    }
  }

  /** true khi không được phép phát ra tiếng nào. */
  function silenced(): boolean {
    return muted || volume <= 0
  }

  /** Dựng một nốt thành OscillatorNode + GainNode. */
  function voice(note: Note, soundGain: number): void {
    // Khi YouTube mute thì im lặng TUYỆT ĐỐI: không tạo node nào cả, chứ không
    // phải tạo rồi đặt gain 0 (A9 MUST).
    if (silenced()) return
    const audio = context()
    if (audio === null) return
    try {
      const from = audio.currentTime + (note.delay ?? 0)
      const to = from + note.seconds
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = note.wave
      osc.frequency.setValueAtTime(note.hz, from)
      if (note.hzTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, note.hzTo), to)
      }
      const peak = soundGain * note.weight
      gain.gain.setValueAtTime(peak, from)
      gain.gain.exponentialRampToValueAtTime(0.0001, to)
      osc.connect(gain)
      gain.connect(audio.destination)
      live.add(gain)
      // Nốt kết thúc là hết "đang kêu" — không cần ai gọi dọn.
      osc.onended = () => {
        live.delete(gain)
      }
      osc.start(from)
      osc.stop(to + 0.02)
    } catch {
      // Audio lỗi KHÔNG BAO GIỜ được chặn gameplay (§10.3) — nhưng phải đếm.
      swallow()
    }
  }

  /**
   * Phát toàn bộ nốt của một âm.
   *
   * `pitch` là tỉ lệ nhân tần số, chỉ khác 1 với `sfx.merge` (pitch theo giá
   * trị tile). Nốt nền và hài bậc 2 cùng nhân tỉ lệ đó nên âm vẫn "lên theo
   * tile" đúng §B7.
   */
  function emit(notes: readonly Note[], soundGain: number, pitch: number): void {
    for (const note of notes) {
      voice({ ...note, hz: note.hz * (note.partial ?? 1) * pitch }, soundGain)
    }
  }

  function play(name: SfxName): void {
    emit(NOTES[name], SFX_GAINS[name] * volume, 1)
  }

  function playMerge(value: number): void {
    emit(NOTES.merge, SFX_GAINS.merge * volume, mergeFrequency(value) / MERGE_BASE_HZ)
  }

  function unlock(): void {
    const audio = context()
    if (audio === null) return
    try {
      if (audio.state === 'suspended') void audio.resume().catch(() => swallow())
    } catch {
      swallow()
    }
  }

  function setVolume(v: number): void {
    volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
  }

  /**
   * Bật/tắt tiếng. Tắt nghĩa là **im ngay**, không chỉ "chặn âm về sau".
   *
   * Vì sao phải cắt cả nốt đang kêu: `onPause` gọi hàm này để thoả §6 (pause chỉ
   * qua SDK onPause), mà hợp âm `win` dài 1,2 s còn `over` dài 1,0 s — chỉ đặt cờ
   * thì tiếng vẫn vang tiếp sau khi đã pause. Cùng lý do, đây cũng là cách tôn
   * trọng A9 khi YouTube mute giữa chừng.
   */
  function setMuted(m: boolean): void {
    muted = m
    if (!m) return
    const audio = ctx
    if (audio === null) return
    for (const gain of live) {
      try {
        const now = audio.currentTime
        // Huỷ envelope đã hẹn giờ trước, nếu không nó sẽ kéo gain trở lại.
        gain.gain.cancelScheduledValues(now)
        gain.gain.linearRampToValueAtTime(0, now + CUT_FADE_SECONDS)
      } catch {
        swallow()
      }
    }
  }

  function destroy(): void {
    live.clear()
    try {
      // `.catch` giống đường resume ở `unlock`: `close()` trả Promise, mà một
      // rejection không ai bắt sẽ thành lỗi console — audio không được gây ồn.
      void ctx?.close().catch(() => swallow())
    } catch {
      swallow()
    }
    ctx = null
  }

  return {
    unlock,
    setVolume,
    setMuted,
    play,
    playMerge,
    destroy,
    get audioFailures(): number {
      return failures
    },
  }
}
