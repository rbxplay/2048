import { describe, expect, it, vi } from 'vitest'
import { createSfx, MERGE_BASE_HZ, mergeFrequency, SFX_GAINS, type SfxName } from './sfx'

const NAMES: SfxName[] = ['move', 'merge', 'spawn', 'invalid', 'win', 'over']

/**
 * Bảng §10.1 — bản sao ĐỘC LẬP của spec.
 *
 * Cố ý chép tay thay vì nhập từ implementation: nhập vào thì test chỉ lặp lại
 * code và không kiểm được gì. Đây là thứ duy nhất biết "đúng" là gì.
 */
const SPEC: Record<SfxName, { nodes: number; wave: OscillatorType; ms: number }> = {
  move: { nodes: 1, wave: 'triangle', ms: 70 },
  merge: { nodes: 2, wave: 'sine', ms: 120 },
  spawn: { nodes: 1, wave: 'triangle', ms: 60 },
  invalid: { nodes: 1, wave: 'square', ms: 80 },
  win: { nodes: 3, wave: 'sine', ms: 1200 },
  over: { nodes: 2, wave: 'sine', ms: 1000 },
}

/** Một nốt đã dựng — đủ để đối chiếu từng cột của bảng §10.1. */
type NoteLog = {
  type: OscillatorType
  hz: number | null
  hzAt: number | null
  hzTo: number | null
  hzToAt: number | null
  peak: number | null
  peakAt: number | null
  peakTo: number | null
  peakToAt: number | null
  start: number | null
  stop: number | null
  /** Lúc bị `cancelScheduledValues` — dấu vết của một lần CẮT TIẾNG giữa chừng. */
  cancelledAt: number | null
  /** Giá trị gain bị ép tới khi cắt (kỳ vọng 0) và thời điểm cắt. */
  cutTo: number | null
  cutAt: number | null
}

function blank(): NoteLog {
  return {
    type: 'sine',
    hz: null,
    hzAt: null,
    hzTo: null,
    hzToAt: null,
    peak: null,
    peakAt: null,
    peakTo: null,
    peakToAt: null,
    start: null,
    stop: null,
    cancelledAt: null,
    cutTo: null,
    cutAt: null,
  }
}

/**
 * AudioContext giả — chỉ ghi lại lời gọi, không phát gì.
 *
 * Mỗi lần `createOscillator()` trả một object MỚI và một bản ghi riêng, nên mọi
 * lời gọi quy được về đúng âm và đúng nốt đã phát. Fixture cũ trả CÙNG một object
 * cho mọi lần gọi, khiến 6 âm dồn vào một recorder và không kiểm được cột nào
 * của §10.1 theo từng âm (kể cả `type` — nó chỉ bị ghi đè 6 lần).
 */
function fakeContext() {
  const log: NoteLog[] = []
  const ctx = {
    currentTime: 0,
    state: 'running' as AudioContextState,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createOscillator: vi.fn(() => {
      const rec = blank()
      log.push(rec)
      return {
        get type(): OscillatorType {
          return rec.type
        },
        set type(v: OscillatorType) {
          rec.type = v
        },
        frequency: {
          value: 0,
          setValueAtTime: vi.fn((v: number, t: number) => {
            rec.hz = v
            rec.hzAt = t
          }),
          exponentialRampToValueAtTime: vi.fn((v: number, t: number) => {
            rec.hzTo = v
            rec.hzToAt = t
          }),
        },
        connect: vi.fn(),
        start: vi.fn((t?: number) => {
          rec.start = t ?? 0
        }),
        stop: vi.fn((t?: number) => {
          rec.stop = t ?? 0
        }),
      }
    }),
    // `voice()` luôn dựng oscillator TRƯỚC gain, nên gain gắn vào bản ghi vừa
    // tạo — đúng cặp osc/gain của cùng một nốt.
    // `voice()` luôn dựng oscillator TRƯỚC gain, nên gain thuộc về bản ghi vừa
    // tạo. Chốt bản ghi đó vào closure ngay lúc dựng: các lời gọi CẮT TIẾNG xảy
    // ra sau khi mọi nốt đã dựng xong, nên tra `log[log.length - 1]` lúc đó sẽ
    // ghi nhầm vào nốt cuối cùng.
    createGain: vi.fn(() => {
      const rec = log[log.length - 1]!
      return {
        gain: {
          value: 0,
          setValueAtTime: vi.fn((v: number, t: number) => {
            rec.peak = v
            rec.peakAt = t
          }),
          exponentialRampToValueAtTime: vi.fn((v: number, t: number) => {
            rec.peakTo = v
            rec.peakToAt = t
          }),
          // Hai method này chỉ được gọi khi CẮT TIẾNG giữa chừng. Ghi lại để test
          // phân biệt được "im tiếng thật" với "chỉ đặt cờ chặn âm về sau".
          cancelScheduledValues: vi.fn((t: number) => {
            rec.cancelledAt = t
          }),
          linearRampToValueAtTime: vi.fn((v: number, t: number) => {
            rec.cutTo = v
            rec.cutAt = t
          }),
        },
        connect: vi.fn(),
      }
    }),
  }
  return { ctx, log }
}

const asContext = (ctx: unknown): (() => AudioContext) => () => ctx as AudioContext

/** Phát một âm trên context giả rồi trả về bản ghi từng nốt. */
function playOne(name: SfxName): NoteLog[] {
  const { ctx, log } = fakeContext()
  const sfx = createSfx({ contextFactory: asContext(ctx) })
  sfx.play(name)
  return log
}

const totalGain = (log: NoteLog[]): number =>
  log.reduce((sum, note) => sum + (note.peak ?? 0), 0)

describe('§10.1 — số nốt mỗi âm', () => {
  it('mỗi âm dựng đúng số oscillator của bảng', () => {
    for (const name of NAMES) {
      expect(playOne(name).length, `${name} sai số nốt`).toBe(SPEC[name].nodes)
    }
  })

  it('tổng 10 oscillator cho 6 âm', () => {
    const all = NAMES.flatMap((name) => playOne(name))
    expect(all).toHaveLength(10)
  })
})

describe('§10.1 — dạng sóng', () => {
  it('mọi nốt của mỗi âm đúng dạng sóng của bảng', () => {
    for (const name of NAMES) {
      for (const note of playOne(name)) {
        expect(note.type, `${name} sai dạng sóng`).toBe(SPEC[name].wave)
      }
    }
  })
})

describe('§10.1 — thời lượng', () => {
  it('âm dài đúng bảng, kể cả đuôi tắt 20 ms', () => {
    for (const name of NAMES) {
      const log = playOne(name)
      const from = Math.min(...log.map((n) => n.start!))
      const to = Math.max(...log.map((n) => n.stop!))
      expect(to - from, `${name} sai thời lượng`).toBeCloseTo(SPEC[name].ms / 1000 + 0.02, 6)
    }
  })

  it('envelope tắt dần kết thúc đúng cuối nốt, không cắt cụt', () => {
    for (const name of NAMES) {
      for (const note of playOne(name)) {
        expect(note.peakTo).toBeCloseTo(0.0001, 6)
        expect(note.peakToAt).toBeCloseTo(note.stop! - 0.02, 6)
      }
    }
  })
})

describe('§10.1 — hướng quét tần số', () => {
  it('move quét NHẸ XUỐNG, kết thúc ở cuối nốt', () => {
    const [note] = playOne('move')
    expect(note!.hz).toBe(330)
    expect(note!.hzTo).toBe(260)
    expect(note!.hzTo! < note!.hz!).toBe(true)
    expect(note!.hzToAt).toBeCloseTo(note!.stop! - 0.02, 6)
  })

  it('invalid giảm nhanh: square quét xuống', () => {
    const [note] = playOne('invalid')
    expect(note!.hz).toBe(150)
    expect(note!.hzTo).toBe(110)
    expect(note!.hzTo! < note!.hz!).toBe(true)
  })

  it('bốn âm còn lại không quét tần số', () => {
    for (const name of ['merge', 'spawn', 'win', 'over'] as SfxName[]) {
      for (const note of playOne(name)) {
        expect(note.hzTo, `${name} không được quét`).toBeNull()
      }
    }
  })
})

describe('§10.1 — merge: sine + hài bậc 2', () => {
  it('nốt thứ hai đúng gấp đôi nốt nền, và nốt nền theo giá trị tile', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.playMerge(4)
    expect(log).toHaveLength(2)
    expect(log[0]!.hz).toBeCloseTo(220 * 2 ** (1 / 12), 5)
    expect(log[1]!.hz).toBeCloseTo(log[0]!.hz! * 2, 5)
  })

  it('hai nốt vang cùng lúc và cùng thời lượng', () => {
    const [root, harmonic] = playOne('merge')
    expect(harmonic!.start).toBe(root!.start)
    expect(harmonic!.stop).toBe(root!.stop)
  })

  it('play("merge") dùng đúng tần số gốc 220 và hài 440', () => {
    const [root, harmonic] = playOne('merge')
    expect(root!.hz).toBe(MERGE_BASE_HZ)
    expect(harmonic!.hz).toBe(MERGE_BASE_HZ * 2)
  })
})

describe('§10.1 — win: hợp âm 3 nốt đi lên', () => {
  const log = (): NoteLog[] => playOne('win')

  it('ba nốt vang CÙNG LÚC (hợp âm, không phải glissando)', () => {
    const notes = log()
    expect(notes).toHaveLength(3)
    expect(notes[1]!.start).toBe(notes[0]!.start)
    expect(notes[2]!.start).toBe(notes[0]!.start)
    for (const note of notes) expect(note.hzTo).toBeNull()
  })

  it('cao độ đi LÊN qua cả ba nốt', () => {
    const notes = log()
    const hz = notes.map((n) => n.hz!)
    expect(hz[1]! > hz[0]!).toBe(true)
    expect(hz[2]! > hz[1]!).toBe(true)
  })
})

describe('§10.1 — over: hai nốt đi xuống', () => {
  it('hai nốt RỜI NHAU (nốt thứ hai bắt đầu sau nốt thứ nhất), không phải một glissando', () => {
    const notes = playOne('over')
    expect(notes).toHaveLength(2)
    expect(notes[1]!.start! > notes[0]!.start!).toBe(true)
    expect(notes[0]!.hzTo).toBeNull()
    expect(notes[1]!.hzTo).toBeNull()
  })

  it('cao độ đi XUỐNG và phủ trọn 1.0 s', () => {
    const notes = playOne('over')
    expect(notes[1]!.hz! < notes[0]!.hz!).toBe(true)
    expect(notes[0]!.stop! - notes[0]!.start!).toBeCloseTo(0.52, 6)
    expect(notes[1]!.stop! - notes[1]!.start!).toBeCloseTo(0.52, 6)
  })
})

describe('§B7 — gain là ĐỈNH CỦA CẢ ÂM, chia cho các nốt', () => {
  it('tổng gain mỗi âm bằng gain token × volume (nếu không, hợp âm sẽ méo)', () => {
    for (const name of NAMES) {
      expect(totalGain(playOne(name)), `${name} sai tổng gain`).toBeCloseTo(
        SFX_GAINS[name] * 0.7,
        6,
      )
    }
  })

  it('mọi nốt đều có gain dương, và nốt nền mang phần lớn nhất', () => {
    for (const name of NAMES) {
      const notes = playOne(name)
      for (const note of notes) expect(note.peak!, `${name} có nốt gain 0`).toBeGreaterThan(0)
      const peaks = notes.map((n) => n.peak!)
      expect(peaks[0], `${name}: nốt nền phải to nhất`).toBe(Math.max(...peaks))
    }
  })

  it('volume 0.5 thì tổng gain của merge là 0.55 × 0.5', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.setVolume(0.5)
    sfx.playMerge(4)
    expect(totalGain(log)).toBeCloseTo(0.55 * 0.5, 5)
  })
})

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
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.setMuted(true)
    for (const n of NAMES) sfx.play(n)
    sfx.playMerge(8)
    expect(log).toHaveLength(0)
  })

  it('volume 0 ⇒ cũng không tạo node', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.setVolume(0)
    sfx.play('merge')
    expect(log).toHaveLength(0)
  })

  it('bỏ muted rồi thì phát lại được', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.setMuted(true)
    sfx.play('move')
    sfx.setMuted(false)
    sfx.play('move')
    expect(log).toHaveLength(1)
  })

  it('mọi âm phát được khi không muted', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    for (const n of NAMES) sfx.play(n)
    expect(log).toHaveLength(10)
  })
})

describe('createSfx — không bao giờ chặn gameplay', () => {
  it('không có AudioContext thì mọi thứ no-op, không throw, và KHÔNG tính là lỗi', () => {
    const sfx = createSfx({ contextFactory: () => null })
    expect(() => {
      sfx.unlock()
      for (const n of NAMES) sfx.play(n)
      sfx.playMerge(16)
      sfx.destroy()
    }).not.toThrow()
    expect(sfx.audioFailures).toBe(0)
  })

  it('AudioContext ném lỗi thì không lan ra ngoài, nhưng lỗi ĐƯỢC ĐẾM', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sfx = createSfx({
      contextFactory: () => {
        throw new Error('bị chặn')
      },
    })
    expect(() => sfx.play('move')).not.toThrow()
    expect(() => sfx.unlock()).not.toThrow()
    expect(sfx.audioFailures).toBe(1)
    warn.mockRestore()
  })

  it('createOscillator ném lỗi thì play không throw, nhưng lỗi ĐƯỢC ĐẾM', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ctx } = fakeContext()
    ctx.createOscillator = vi.fn(() => {
      throw new Error('hết tài nguyên')
    })
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    expect(() => sfx.play('merge')).not.toThrow()
    // merge có 2 nốt, cả hai đều hỏng: đếm theo nốt, không phải theo âm.
    expect(sfx.audioFailures).toBe(2)
    warn.mockRestore()
  })

  it('chơi bình thường KHÔNG sinh lỗi audio nào (lưới bắt lỗi fixture)', () => {
    // Đây là bài kiểm sẽ đỏ nếu fixture thiếu một method mà `voice()` gọi: lỗi
    // bị nuốt, âm câm, `start` không chạy — nhưng nếu không đếm thì mọi bài
    // kiểm "not.toThrow" vẫn xanh và lỗi đi thẳng ra production.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ctx } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    for (const n of NAMES) sfx.play(n)
    expect(sfx.audioFailures).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('cảnh báo console chỉ một lần cho mỗi instance', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ctx } = fakeContext()
    ctx.createOscillator = vi.fn(() => {
      throw new Error('hết tài nguyên')
    })
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.play('win')
    sfx.play('win')
    expect(sfx.audioFailures).toBe(6)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('createSfx — unlock (rủi ro R1)', () => {
  it('context đang suspended thì resume', () => {
    const { ctx } = fakeContext()
    ctx.state = 'suspended'
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.unlock()
    expect(ctx.resume).toHaveBeenCalledOnce()
  })

  it('context đang chạy thì không gọi resume', () => {
    const { ctx } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.unlock()
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('resume reject thì không throw, và lỗi được đếm', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ctx } = fakeContext()
    ctx.state = 'suspended'
    ctx.resume = vi.fn(async () => {
      throw new Error('không cho phép')
    })
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    expect(() => sfx.unlock()).not.toThrow()
    await vi.waitFor(() => expect(sfx.audioFailures).toBe(1))
    warn.mockRestore()
  })
})

/**
 * R37(iii) — §6: pause/resume CHỈ qua SDK, và khi pause thì phải IM TIẾNG THẬT.
 *
 * `setMuted(true)` chỉ đặt một cờ mà `voice()` đọc TRƯỚC khi dựng node: nó chặn
 * được âm về sau nhưng không đụng tới những nốt đã dựng và đang kêu. Hợp âm
 * `win` dài 1,2 s và `over` dài 1,0 s, nên một lần `onPause` rơi vào giữa hợp âm
 * sẽ để tiếng vang tiếp sau khi đã pause — đúng thứ §6 cấm.
 */
describe('R37 — mute phải cắt cả nốt ĐANG kêu', () => {
  it('setMuted(true) đưa mọi gain đang kêu về 0 ngay lập tức', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.play('win')
    expect(log).toHaveLength(3)

    sfx.setMuted(true)

    for (const note of log) {
      expect(note.cancelledAt, 'phải huỷ envelope đã hẹn giờ').toBe(0)
      expect(note.cutTo, 'gain phải về 0').toBe(0)
      // Cắt NGAY, không phải hẹn tắt dần ở cuối nốt: trễ tối đa 20 ms để không
      // tạo tiếng "tạch" khi cắt.
      expect(note.cutAt).toBeGreaterThanOrEqual(0)
      expect(note.cutAt!).toBeLessThanOrEqual(0.02)
    }
  })

  it('cắt ở đúng thời điểm hiện tại của context, không phải mốc 0 cứng', () => {
    const { ctx, log } = fakeContext()
    ctx.currentTime = 12.5
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.play('over')
    sfx.setMuted(true)
    for (const note of log) {
      expect(note.cancelledAt).toBe(12.5)
      expect(note.cutAt! >= 12.5 && note.cutAt! <= 12.52).toBe(true)
    }
  })

  it('onResume: setMuted(false) không hồi sinh nốt đã cắt, và âm MỚI kêu lại bình thường', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.play('win')
    sfx.setMuted(true)
    const before = log.length

    sfx.setMuted(false)
    // Không dựng thêm node nào cho nốt cũ.
    expect(log).toHaveLength(before)

    sfx.play('move')
    const fresh = log[log.length - 1]!
    expect(fresh.peak, 'âm mới phải có gain thật, không bị kẹt ở 0').toBeGreaterThan(0)
    expect(fresh.cutTo, 'âm mới không được cắt').toBeNull()
  })

  it('A9 MUST giữ nguyên: đang mute thì KHÔNG dựng node nào', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.setMuted(true)
    sfx.play('move')
    sfx.playMerge(4)
    expect(log).toHaveLength(0)
  })

  it('volume 0 cũng là im tiếng: không dựng node (đường cũ không được vỡ)', () => {
    const { ctx, log } = fakeContext()
    const sfx = createSfx({ contextFactory: asContext(ctx) })
    sfx.setVolume(0)
    sfx.play('move')
    expect(log).toHaveLength(0)
  })
})
