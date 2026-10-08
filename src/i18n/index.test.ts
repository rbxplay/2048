import { describe, expect, it } from 'vitest'
import { en, formatNumber, normalizeLocale, stringsFor, vi, type Strings } from './index'

const KEYS = Object.keys(en) as (keyof Strings)[]

describe('normalizeLocale', () => {
  it("'vi' và mọi tag bắt đầu bằng vi ⇒ vi", () => {
    expect(normalizeLocale('vi')).toBe('vi')
    expect(normalizeLocale('vi-VN')).toBe('vi')
    expect(normalizeLocale('VI-vn')).toBe('vi')
  })

  it('mọi thứ khác ⇒ en', () => {
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('ja')).toBe('en')
  })

  it("chuỗi rỗng hoặc rác ⇒ en", () => {
    expect(normalizeLocale('')).toBe('en')
    expect(normalizeLocale('   ')).toBe('en')
  })
})

describe('stringsFor', () => {
  it('trả đúng bộ chuỗi', () => {
    expect(stringsFor('vi')).toBe(vi)
    expect(stringsFor('en')).toBe(en)
  })
})

describe('đồng bộ khoá giữa hai ngôn ngữ', () => {
  it('vi có đúng bộ khoá như en', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort())
  })

  it('không chuỗi nào rỗng', () => {
    for (const key of KEYS) {
      expect(en[key].length).toBeGreaterThan(0)
      expect(vi[key].length).toBeGreaterThan(0)
    }
  })

  it('mọi chuỗi ≤ 28 ký tự (LM-04: HUD không được reflow)', () => {
    for (const key of KEYS) {
      expect(en[key].length, `en.${key}`).toBeLessThanOrEqual(28)
      expect(vi[key].length, `vi.${key}`).toBeLessThanOrEqual(28)
    }
  })
})

describe('formatNumber', () => {
  it('thêm dấu phân cách hàng nghìn', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567')
  })

  it('0 vẫn là "0"', () => {
    expect(formatNumber(0, 'en')).toBe('0')
  })

  it('số rất lớn không crash', () => {
    expect(() => formatNumber(Number.MAX_SAFE_INTEGER, 'vi')).not.toThrow()
  })
})
