import { describe, expect, it } from 'vitest'
import { TILE_HEX, TILE_VALUES, UI_HEX, hexToInt, luminance } from './palette'

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
    expect(UI_HEX.board).toBe('#B9A894')
    expect(UI_HEX.slot).toBe('#D2C6B5')
    expect(UI_HEX.text).toBe('#2A1C0C')
    expect(UI_HEX.textMuted).toBe('#5B4A38')
    expect(UI_HEX.textOnDark).toBe('#FFF8EE')
    expect(UI_HEX.btn).toBe('#8F4A22')
    expect(UI_HEX.focus).toBe('#1B6EF3')
  })

  it('numeral trên mỗi tile đạt >= 4.5:1 (§B1.2)', () => {
    const fgDark = UI_HEX.text
    const fgLight = UI_HEX.textOnDark
    for (const v of TILE_VALUES) {
      const fg = v >= 64 ? fgLight : fgDark
      const a = luminance(TILE_HEX[v]!)
      const b = luminance(fg)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      expect(ratio, `tile ${v}`).toBeGreaterThanOrEqual(4.5)
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
