import { describe, expect, it } from 'vitest'
import {
  CONTRAST_HEX, CONTRAST_TILE_FG_HEX, CONTRAST_TILE_HEX, DARK_HEX,
  HAIRLINE_DARK_HEX, HAIRLINE_LIGHT_HEX, TILE_FG_HEX, TILE_HEX, TILE_VALUES,
  UI_HEX, contrastRatio, hexToInt, luminance,
} from './palette'

describe('hexToInt', () => {
  it('đổi hex sang số nguyên cho Phaser', () => {
    expect(hexToInt('#F1E8E0')).toBe(0xf1e8e0)
    expect(hexToInt('#000000')).toBe(0x000000)
    expect(hexToInt('#FFF8EE')).toBe(0xfff8ee)
  })

  it('chịu được thiếu dấu # và chữ thường', () => {
    expect(hexToInt('f1e8e0')).toBe(0xf1e8e0)
  })

  it('ném lỗi với chuỗi không hợp lệ, không trả về số rác', () => {
    expect(() => hexToInt('#GGG')).toThrow()
    expect(() => hexToInt('#12345')).toThrow()
  })
})

describe('luminance — công thức WCAG', () => {
  it('trắng là 1, đen là 0', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 4)
    expect(luminance('#000000')).toBeCloseTo(0, 4)
  })

  it('khớp giá trị §B1.2 đã đo cho tile 2 và tile 8192', () => {
    expect(luminance(TILE_HEX[2]!)).toBeCloseTo(0.818, 2)
    expect(luminance(TILE_HEX[8192]!)).toBeCloseTo(0.017, 2)
  })
})

describe('bảng màu khớp §B11 nguyên văn', () => {
  // Chép sai một ký tự ở đây là làm hỏng tương phản đã đo, mà mắt thường
  // không thấy. Nên chốt bằng test.
  it('13 tile đúng giá trị §B11', () => {
    expect(TILE_HEX).toEqual({
      2: '#F1E8E0', 4: '#E8DBC4', 8: '#F4C19C', 16: '#F6A581', 32: '#F6836A',
      64: '#C54A2D', 128: '#B34120', 256: '#A43519', 512: '#912A1D',
      1024: '#7A2531', 2048: '#60223F', 4096: '#442142', 8192: '#271D44',
    })
  })

  it('TILE_VALUES đúng 13 giá trị, tăng dần', () => {
    expect(TILE_VALUES).toHaveLength(13)
    expect([...TILE_VALUES].sort((a, b) => a - b)).toEqual([...TILE_VALUES])
  })

  it('màu UI đúng §B11', () => {
    expect(UI_HEX.page).toBe('#FBF6EC')
    expect(UI_HEX.surfaceBoard).toBe('#B9A894')
    expect(UI_HEX.slot).toBe('#D2C6B5')
    expect(UI_HEX.text).toBe('#2A1C0C')
    expect(UI_HEX.textMuted).toBe('#5B4A38')
    expect(UI_HEX.textOnDark).toBe('#FFF8EE')
    expect(UI_HEX.btn).toBe('#8F4A22')
    expect(UI_HEX.focus).toBe('#1B6EF3')
  })

  it('numeral trên mỗi tile đạt >= 4.5:1 (§B1.2)', () => {
    for (const v of TILE_VALUES) {
      expect(contrastRatio(TILE_FG_HEX[v], TILE_HEX[v]), `tile ${v}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('TILE_FG_HEX chỉ dùng hai màu chữ của §B11, đúng bậc (§B1.2)', () => {
    for (const v of TILE_VALUES) {
      expect(TILE_FG_HEX[v], `tile ${v}`).toBe(v >= 64 ? UI_HEX.textOnDark : UI_HEX.text)
    }
  })

  it('thang luminance giảm đơn điệu theo giá trị (§B1.2)', () => {
    let prev = Infinity
    for (const v of TILE_VALUES) {
      const l = luminance(TILE_HEX[v]!)
      expect(l, `tile ${v}`).toBeLessThan(prev)
      prev = l
    }
  })
})

describe('theme tương phản cao — bảng màu một nguồn (§B11:303-304)', () => {
  it('chữ phụ đạt >= 4.5:1 trên nền đen', () => {
    // Từng lệch thật: tầng DOM thừa hưởng #5B4A38 của theme sáng ⇒ 2.48:1.
    expect(contrastRatio(CONTRAST_HEX.textMuted, CONTRAST_HEX.page)).toBeGreaterThanOrEqual(4.5)
  })

  it('mọi cặp chữ trên nền đều đạt >= 4.5:1', () => {
    for (const fg of [CONTRAST_HEX.text, CONTRAST_HEX.textMuted]) {
      expect(contrastRatio(fg, CONTRAST_HEX.page), fg).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(CONTRAST_TILE_FG_HEX, CONTRAST_TILE_HEX)).toBeGreaterThanOrEqual(4.5)
  })

  it('viền và nền board của theme tương phản cao là màu đặc, không alpha', () => {
    expect(CONTRAST_TILE_HEX).toBe('#FFFFFF')
    expect(CONTRAST_TILE_FG_HEX).toBe('#000000')
    expect(CONTRAST_HEX.surfaceBoard).toBe('#000000')
  })
})

describe('viền tile theo bậc (§B4:162-163)', () => {
  it('đạt >= 3:1 với nền tile ở CẢ HAI bậc (§B1.3)', () => {
    // Một màu duy nhất không đủ: #2A1C0C trên tile 8192 chỉ 1.06:1.
    for (const v of TILE_VALUES) {
      const hairline = v >= 64 ? HAIRLINE_DARK_HEX : HAIRLINE_LIGHT_HEX
      expect(contrastRatio(hairline, TILE_HEX[v]), `tile ${v}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('trùng màu chữ tương ứng của §B11', () => {
    expect(HAIRLINE_LIGHT_HEX).toBe(UI_HEX.text)
    expect(HAIRLINE_DARK_HEX).toBe(UI_HEX.textOnDark)
  })
})

describe('bảng theme tối (§B11:302)', () => {
  it('ghi đè đủ 6 token và không đụng thang màu tile', () => {
    expect(Object.keys(DARK_HEX)).toEqual([
      'page', 'text', 'textMuted', 'focus', 'surfaceBoard', 'slot',
    ])
  })

  it('chữ trên nền tối đạt >= 4.5:1', () => {
    for (const fg of [DARK_HEX.text, DARK_HEX.textMuted]) {
      expect(contrastRatio(fg, DARK_HEX.page), fg).toBeGreaterThanOrEqual(4.5)
    }
  })
})
