import { describe, expect, it } from 'vitest'
import { computeLayout } from './layout'

describe('computeLayout — công thức §B3', () => {
  it('gap là 3% cạnh board', () => {
    const l = computeLayout(400, 800)
    expect(l.gap).toBe(Math.round(l.boardSide * 0.03))
  })

  it('cell = (boardSide − 5×gap) / 4', () => {
    const l = computeLayout(400, 800)
    expect(l.cell).toBeCloseTo((l.boardSide - 5 * l.gap) / 4, 6)
  })

  it('board luôn vuông', () => {
    for (const [w, h] of [[320, 568], [768, 1024], [1920, 1080], [500, 900]]) {
      const l = computeLayout(w!, h!)
      expect(l.boardSide).toBeGreaterThan(0)
      // 4 ô + 5 khe phải vừa đúng cạnh board
      expect(4 * l.cell + 5 * l.gap).toBeCloseTo(l.boardSide, 4)
    }
  })
})

describe('computeLayout — ràng buộc kích thước §B3', () => {
  it('không nhỏ hơn 280 px dù viewport bé', () => {
    expect(computeLayout(320, 568).boardSide).toBeGreaterThanOrEqual(280)
  })

  it('không lớn hơn 560 px dù viewport rất lớn', () => {
    expect(computeLayout(1920, 1080).boardSide).toBeLessThanOrEqual(560)
  })

  it('board vừa trong bề ngang khả dụng', () => {
    for (const w of [320, 375, 768, 1024]) {
      const l = computeLayout(w, 900)
      expect(l.boardX).toBeGreaterThanOrEqual(0)
      expect(l.boardX + l.boardSide).toBeLessThanOrEqual(w + 0.001)
    }
  })

  it('board căn giữa theo bề ngang', () => {
    const l = computeLayout(800, 900)
    expect(l.boardX + l.boardSide / 2).toBeCloseTo(400, 1)
  })
})

describe('computeLayout — cực đoan không làm vỡ', () => {
  it('viewport 0 vẫn trả số hữu hạn', () => {
    const l = computeLayout(0, 0)
    for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true)
  })

  it('viewport cực lớn vẫn hữu hạn', () => {
    const l = computeLayout(100_000, 100_000)
    for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true)
    expect(l.boardSide).toBeLessThanOrEqual(560)
  })

  it('viewport thấp và rộng (landscape) vẫn giữ board vừa chiều cao', () => {
    const l = computeLayout(1920, 400)
    expect(l.boardSide).toBeLessThanOrEqual(400)
  })
})
