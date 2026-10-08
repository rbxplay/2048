export type Haptics = {
  setEnabled(on: boolean): void
  /** Nước đi không hợp lệ: một nhịp ngắn, khác hẳn merge. */
  invalid(): void
  /** Merge: nhịp dài hơn theo giá trị, có trần. */
  merge(value: number): void
}

/** Trần tổng thời gian rung mỗi lần, ms. Rung lâu hơn thế là gây khó chịu. */
const MAX_TOTAL_MS = 60

export function createHaptics(): Haptics {
  let enabled = false

  function buzz(pattern: number | number[]): void {
    if (!enabled) return
    try {
      const v = (navigator as { vibrate?: (p: number | number[]) => boolean }).vibrate
      if (typeof v !== 'function') return
      v.call(navigator, pattern)
    } catch {
      // Rung là tiện ích, không bao giờ được làm hỏng ván đấu.
    }
  }

  return {
    setEnabled(on: boolean): void {
      enabled = on
    },
    invalid(): void {
      buzz(12)
    },
    merge(value: number): void {
      // Mỗi lần gấp đôi giá trị thì dài thêm 8 ms, chặn ở MAX_TOTAL_MS.
      const step = Number.isFinite(value) && value > 0 ? Math.log2(value) : 1
      buzz(Math.min(MAX_TOTAL_MS, 16 + step * 4))
    },
  }
}
