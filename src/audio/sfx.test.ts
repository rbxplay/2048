import { describe, expect, it, vi } from 'vitest'
import { createSfx, MERGE_BASE_HZ, mergeFrequency, SFX_GAINS, type SfxName } from './sfx'

const NAMES: SfxName[] = ['move', 'merge', 'spawn', 'invalid', 'win', 'over']

/** AudioContext giả — chỉ ghi lại lời gọi, không phát gì. */
function fakeContext() {
  const started: number[] = []
  // `frequency` PHẢI có ramp method: 4 trong 6 âm có `hzTo` (move quét xuống
  // theo §10.1), và implementation gọi `exponentialRampToValueAtTime` cho chúng.
  // Thiếu nó thì lời gọi ném TypeError, bị nuốt bởi catch "audio lỗi không chặn
  // gameplay" — nên `start` không bao giờ chạy và test đếm node sai.
  const osc = {
    type: 'sine',
    frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn((t?: number) => started.push(t ?? 0)),
    stop: vi.fn(),
  }
  const gain = {
    gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }
  const ctx = {
    currentTime: 0,
    state: 'running' as AudioContextState,
    destination: {},
    resume: vi.fn(async () => {}),
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
  }
  return { ctx, osc, gain, started }
}

describe('mergeFrequency — pitch theo giá trị tile (B7)', () => {
  it('tile 2 phát đúng tần số gốc (0 semitone)', () => {
    expect(mergeFrequency(2, 220)).toBeCloseTo(220, 5)
  })

  it('mỗi lần gấp đôi giá trị thì lên 1 semitone', () => {
    expect(mergeFrequency(4, 220)).toBeCloseTo(220 * 2 ** (1 / 12), 5)
    expect(mergeFrequency(8, 220)).toBeCloseTo(220 * 2 ** (2 / 12), 5)
  })

  it('tần số tăng đơn điệu theo giá trị', () => {
    let prev = 0
    for (const v of [2, 4, 8, 16, 32, 64, 128]) {
      const f = mergeFrequency(v, 220)
      expect(f).toBeGreaterThan(prev)
      prev = f
    }
  })

  it('cap ở +12 semitone (B7)', () => {
    const cap = 220 * 2 ** (12 / 12)
    expect(mergeFrequency(8192, 220)).toBeCloseTo(cap, 5)
    expect(mergeFrequency(16384, 220)).toBeCloseTo(cap, 5)
    expect(mergeFrequency(1_000_000, 220)).toBeCloseTo(cap, 5)
  })

  it('giá trị ≤ 0 hoặc không hữu hạn không làm crash', () => {
    expect(Number.isFinite(mergeFrequency(0, 220))).toBe(true)
    expect(Number.isFinite(mergeFrequency(Number.NaN, 220))).toBe(true)
  })

  it('hằng số gốc là 220 Hz', () => {
    expect(MERGE_BASE_HZ).toBe(220)
  })
})

describe('SFX_GAINS — khớp bảng gain của B7', () => {
  it('đủ 6 âm và đúng giá trị', () => {
    expect(SFX_GAINS).toEqual({ move: 0.35, merge: 0.55, spawn: 0.2, invalid: 0.45, win: 0.8, over: 0.7 })
  })
})

describe('createSfx — tắt tiếng thì im lặng tuyệt đối', () => {
  it('muted ⇒ không tạo node nào (A9 MUST: im lặng TUYỆT ĐỐI)', () => {
    const { ctx, osc } = fakeContext()
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    sfx.setMuted(true)
    for (const n of NAMES) sfx.play(n)
    sfx.playMerge(8)
    expect(osc.start).not.toHaveBeenCalled()
  })

  it('volume 0 ⇒ cũng không tạo node', () => {
    const { ctx, osc } = fakeContext()
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    sfx.setVolume(0)
    sfx.play('merge')
    expect(osc.start).not.toHaveBeenCalled()
  })

  it('bỏ muted rồi thì phát lại được', () => {
    const { ctx, osc } = fakeContext()
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    sfx.setMuted(true)
    sfx.play('move')
    sfx.setMuted(false)
    sfx.play('move')
    expect(osc.start).toHaveBeenCalledOnce()
  })

  it('mọi âm phát được khi không muted', () => {
    const { ctx, osc } = fakeContext()
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    for (const n of NAMES) sfx.play(n)
    expect(osc.start).toHaveBeenCalledTimes(6)
  })
})

describe('createSfx — không bao giờ chặn gameplay', () => {
  it('không có AudioContext thì mọi thứ no-op, không throw', () => {
    const sfx = createSfx({ contextFactory: () => null })
    expect(() => {
      sfx.unlock()
      for (const n of NAMES) sfx.play(n)
      sfx.playMerge(16)
      sfx.destroy()
    }).not.toThrow()
  })

  it('AudioContext ném lỗi thì không lan ra ngoài', () => {
    const sfx = createSfx({
      contextFactory: () => {
        throw new Error('bị chặn')
      },
    })
    expect(() => sfx.play('move')).not.toThrow()
    expect(() => sfx.unlock()).not.toThrow()
  })

  it('createOscillator ném lỗi thì play không throw', () => {
    const { ctx } = fakeContext()
    ctx.createOscillator = vi.fn(() => {
      throw new Error('hết tài nguyên')
    })
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    expect(() => sfx.play('merge')).not.toThrow()
  })
})

describe('createSfx — unlock (rủi ro R1)', () => {
  it('context đang suspended thì resume', () => {
    const { ctx } = fakeContext()
    ctx.state = 'suspended'
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    sfx.unlock()
    expect(ctx.resume).toHaveBeenCalledOnce()
  })

  it('context đang chạy thì không gọi resume', () => {
    const { ctx } = fakeContext()
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    sfx.unlock()
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('resume reject thì không throw', async () => {
    const { ctx } = fakeContext()
    ctx.state = 'suspended'
    ctx.resume = vi.fn(async () => {
      throw new Error('không cho phép')
    })
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    expect(() => sfx.unlock()).not.toThrow()
  })
})

describe('merge gain áp theo volume người dùng', () => {
  it('volume 0.5 thì gain của merge là 0.55 × 0.5', () => {
    const { ctx, gain } = fakeContext()
    const sfx = createSfx({ contextFactory: () => ctx as unknown as AudioContext })
    sfx.setVolume(0.5)
    sfx.play('merge')
    const peak = gain.gain.setValueAtTime.mock.calls[0]![0] as number
    expect(peak).toBeCloseTo(0.55 * 0.5, 5)
  })
})
