import { describe, expect, it } from 'vitest'
import { digitCount, tileFontSize, tileLabel } from './tileSpec'

describe('tileLabel', () => {
  it('giá trị thường in thẳng', () => {
    expect(tileLabel(2)).toBe('2')
    expect(tileLabel(2048)).toBe('2048')
  })

  it('8192 không có hậu tố', () => {
    expect(tileLabel(8192)).toBe('8192')
  })

  it('16384 có hậu tố + (§B11)', () => {
    expect(tileLabel(16384)).toBe('16384+')
    expect(tileLabel(131072)).toBe('131072+')
  })

  it('giá trị rất lớn không crash', () => {
    expect(() => tileLabel(1_000_000)).not.toThrow()
  })
})

describe('digitCount', () => {
  it('đếm số chữ số, bỏ qua hậu tố +', () => {
    expect(digitCount('2')).toBe(1)
    expect(digitCount('64')).toBe(2)
    expect(digitCount('128')).toBe(3)
    expect(digitCount('2048')).toBe(4)
    expect(digitCount('16384+')).toBe(5)
  })
})

describe('tileFontSize — k của §B2', () => {
  it('1–2 chữ số dùng k = 0.51', () => {
    expect(tileFontSize(2, 100)).toBeCloseTo(51, 5)
    expect(tileFontSize(64, 100)).toBeCloseTo(51, 5)
  })

  it('3 chữ số dùng k = 0.42', () => {
    expect(tileFontSize(128, 100)).toBeCloseTo(42, 5)
  })

  it('4 chữ số dùng k = 0.33', () => {
    expect(tileFontSize(2048, 100)).toBeCloseTo(33, 5)
  })

  it('5 chữ số trở lên dùng k = 0.28', () => {
    expect(tileFontSize(16384, 100)).toBeCloseTo(28, 5)
    expect(tileFontSize(131072, 100)).toBeCloseTo(28, 5)
  })

  it('luôn dương với mọi cell hợp lệ — không có cỡ chữ 0 hay âm', () => {
    for (const v of [2, 64, 128, 2048, 16384]) {
      expect(tileFontSize(v, 20)).toBeGreaterThan(0)
    }
  })

  it('cell 0 không tạo NaN', () => {
    expect(Number.isFinite(tileFontSize(2048, 0))).toBe(true)
  })
})
