import { describe, expect, it, vi } from 'vitest'
import { createSaveGate, PLAY_SAVE_MS, SAVE_MIN_INTERVAL_MS } from './save-gate'

/**
 * Đồng hồ giả có điều khiển.
 *
 * Cố ý tự viết thay vì dùng `vi.useFakeTimers()`: ở đây cần CHỨNG MINH khoảng
 * cách giữa các lần ghi, nên thời điểm của từng timer phải đọc được, không chỉ
 * "đã chạy hay chưa".
 */
function fakeClock() {
  let t = 0
  let nextId = 1
  const timers: { at: number; fn: () => void; id: number }[] = []

  return {
    now: (): number => t,
    setTimer: (fn: () => void, ms: number): number => {
      const id = nextId++
      timers.push({ at: t + ms, fn, id })
      return id
    },
    clearTimer: (h: number): void => {
      const i = timers.findIndex((x) => x.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
    /** Chạy mọi timer đến hạn trong `ms` tới, theo đúng thứ tự thời gian. */
    advance: (ms: number): void => {
      const target = t + ms
      for (;;) {
        const due = timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0]
        if (due === undefined) break
        timers.splice(timers.indexOf(due), 1)
        t = due.at
        due.fn()
      }
      t = target
    },
    pending: (): number => timers.length,
  }
}

function setup(save: () => void = () => {}) {
  const clock = fakeClock()
  const writes: number[] = []
  const gate = createSaveGate({
    save: () => {
      writes.push(clock.now())
      save()
    },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  return { clock, writes, gate }
}

describe('hằng số §9.4', () => {
  it('nhịp lưu định kỳ là 30 s ("mỗi 30 s chơi")', () => {
    expect(PLAY_SAVE_MS).toBe(30_000)
  })

  it('khoảng cách tối thiểu giữa hai lần ghi ≥ 1 s ("Debounce ≥ 1 s")', () => {
    expect(SAVE_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000)
  })
})

describe('R39 — thay đổi liên tục không được tạo bão save', () => {
  it('kéo thanh trượt 100 bước trong 2 s chỉ ghi 2 lần', () => {
    const { clock, writes, gate } = setup()
    // 100 sự kiện `input` của slider, mỗi bước 20 ms — đúng đường `bridge.ts`
    // nối vào `onSettingsChange`.
    for (let i = 0; i < 100; i++) {
      gate.saveSoon()
      clock.advance(20)
    }
    expect(writes.length, '100 sự kiện không được thành 100 lời gọi SDK').toBe(2)
  })

  it('mọi cặp lần ghi liên tiếp cách nhau ≥ 1 s', () => {
    const { clock, writes, gate } = setup()
    for (let i = 0; i < 60; i++) {
      gate.saveSoon()
      clock.advance(37)
    }
    expect(writes.length).toBeGreaterThan(1)
    for (let i = 1; i < writes.length; i++) {
      expect(writes[i]! - writes[i - 1]!, 'hai lần ghi quá sát nhau').toBeGreaterThanOrEqual(
        SAVE_MIN_INTERVAL_MS,
      )
    }
  })

  it('một thay đổi rồi im lặng thì ghi đúng một lần, không ghi lặp', () => {
    const { clock, writes, gate } = setup()
    gate.saveSoon()
    clock.advance(10_000)
    expect(writes).toEqual([SAVE_MIN_INTERVAL_MS])
  })

  it('hai đợt thay đổi cách xa nhau thì mỗi đợt một lần ghi', () => {
    const { clock, writes, gate } = setup()
    gate.saveSoon()
    clock.advance(1500)
    gate.saveSoon()
    clock.advance(1500)
    expect(writes.length).toBe(2)
  })

  it('lỗi trong save không được ném ra ngoài (save hỏng không cắt game)', () => {
    const { clock, gate } = setup(() => {
      throw new Error('SDK từ chối')
    })
    expect(() => {
      gate.saveSoon()
      clock.advance(5000)
    }).not.toThrow()
  })
})

describe('R38/R39 — mốc rời rạc KHÔNG bị cửa sổ debounce nuốt', () => {
  it('saveNow ghi NGAY, không xếp hàng chờ cửa sổ', () => {
    const { clock, writes, gate } = setup()
    gate.saveNow()
    expect(writes, 'mốc phải ghi ngay tại t=0').toEqual([0])
    expect(clock.pending(), 'không được để lại timer nào').toBe(0)
  })

  it('saveNow huỷ lần ghi đang chờ, nên không sinh lần ghi thứ ba', () => {
    const { clock, writes, gate } = setup()
    gate.saveSoon() // hẹn ghi ở t=1000
    clock.advance(100)
    gate.saveNow() // mốc ở t=100: thay đổi đang chờ đã nằm trong lần ghi này
    clock.advance(5000)
    expect(writes, 'mốc ghi ngay rồi cửa sổ cũ phải bị huỷ').toEqual([100])
  })

  it('sau một mốc, thay đổi kế tiếp vẫn tôn trọng khoảng cách ≥ 1 s', () => {
    const { clock, writes, gate } = setup()
    gate.saveNow() // t=0
    clock.advance(100)
    gate.saveSoon() // t=100 — chưa được 1 s kể từ mốc
    clock.advance(200)
    expect(writes, 'chưa đủ 1 s mà đã ghi là vi phạm').toEqual([0])
    clock.advance(2000)
    expect(writes.length, 'rồi cũng phải ghi, không được hoãn vô hạn').toBe(2)
    expect(writes[1]! - writes[0]!).toBeGreaterThanOrEqual(SAVE_MIN_INTERVAL_MS)
  })

  it('mốc liên tiếp nhau vẫn ghi đủ (pause ngay sau milestone)', () => {
    const { clock, writes, gate } = setup()
    gate.saveNow() // bắt đầu ván
    gate.saveNow() // pause ngay sau đó
    clock.advance(10_000)
    expect(writes).toEqual([0, 0])
  })
})

describe('gate không tự tạo đồng hồ riêng', () => {
  it('mọi lần ghi đều đi qua `now()` được tiêm vào', () => {
    const save = vi.fn()
    const clock = fakeClock()
    const gate = createSaveGate({
      save,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    })
    gate.saveNow()
    gate.saveSoon()
    clock.advance(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })
})
