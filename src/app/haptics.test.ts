import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHaptics } from './haptics'

afterEach(() => {
  delete (navigator as { vibrate?: unknown }).vibrate
})

describe('createHaptics', () => {
  it('gọi navigator.vibrate khi bật', () => {
    const vibrate = vi.fn(() => true)
    Object.assign(navigator, { vibrate })
    const h = createHaptics()
    h.setEnabled(true)
    h.merge(8)
    expect(vibrate).toHaveBeenCalled()
  })

  it('KHÔNG rung khi tắt (A11Y-09: phải có công tắc)', () => {
    const vibrate = vi.fn(() => true)
    Object.assign(navigator, { vibrate })
    const h = createHaptics()
    h.setEnabled(false)
    h.merge(8)
    h.invalid()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('không throw khi nền tảng không hỗ trợ rung', () => {
    delete (navigator as { vibrate?: unknown }).vibrate
    const h = createHaptics()
    h.setEnabled(true)
    expect(() => h.merge(64)).not.toThrow()
    expect(() => h.invalid()).not.toThrow()
  })

  it('vibrate ném lỗi thì không lan ra ngoài', () => {
    Object.assign(navigator, {
      vibrate: () => {
        throw new Error('bị chặn')
      },
    })
    const h = createHaptics()
    h.setEnabled(true)
    expect(() => h.merge(8)).not.toThrow()
  })

  it('merge giá trị lớn không rung lâu hơn mức trần', () => {
    const calls: number[][] = []
    Object.assign(navigator, {
      vibrate: (p: number | number[]) => {
        calls.push(Array.isArray(p) ? p : [p])
        return true
      },
    })
    const h = createHaptics()
    h.setEnabled(true)
    h.merge(8192)
    const total = (calls[0] ?? []).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(60)
  })
})
