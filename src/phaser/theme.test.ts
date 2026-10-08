import { describe, expect, it } from 'vitest'
import { UI_HEX } from '../theme/palette'
import { applyThemeToDom, buildTheme } from './theme'

describe('buildTheme — theme sáng', () => {
  it('nền và chữ lấy từ §B11', () => {
    const t = buildTheme('light')
    expect(t.page).toBe(0xfbf6ec)
    expect(t.text).toBe(0x2a1c0c)
    expect(t.board).toBe(0xb9a894)
  })

  it('tile 2 dùng token t2', () => {
    expect(buildTheme('light').tileFill(2)).toBe(0xf1e8e0)
  })

  it('tile >= 64 dùng numeral sáng, tile < 64 dùng numeral tối (§B1.2)', () => {
    const t = buildTheme('light')
    expect(t.tileText(32)).toBe(0x2a1c0c)
    expect(t.tileText(64)).toBe(0xfff8ee)
  })
})

describe('buildTheme — vượt 8192 (Review Focus mục 5)', () => {
  it('16384 dùng lại token 8192, không trả undefined', () => {
    const t = buildTheme('light')
    expect(t.tileFill(16384)).toBe(t.tileFill(8192))
  })

  it('giá trị rất lớn cũng an toàn', () => {
    expect(() => buildTheme('light').tileFill(1_000_000)).not.toThrow()
    expect(buildTheme('light').tileFill(1_000_000)).toBe(buildTheme('light').tileFill(8192))
  })

  it('giá trị lạ nhỏ hơn 2 rơi về token đầu tiên, không crash', () => {
    expect(() => buildTheme('light').tileFill(0)).not.toThrow()
  })
})

describe('buildTheme — theme tối và tương phản cao', () => {
  it('theme tối đổi nền nhưng giữ nguyên màu tile', () => {
    const light = buildTheme('light')
    const dark = buildTheme('dark')
    expect(dark.page).not.toBe(light.page)
    expect(dark.tileFill(2)).toBe(light.tileFill(2))
  })

  it('theme tương phản cao: nền đen, tile trắng, numeral đen', () => {
    const c = buildTheme('contrast')
    expect(c.page).toBe(0x000000)
    expect(c.tileFill(2048)).toBe(0xffffff)
    expect(c.tileText(2048)).toBe(0x000000)
  })

  it('focus ring tương phản cao là vàng', () => {
    expect(buildTheme('contrast').focus).toBe(0xffff00)
  })
})

describe('applyThemeToDom', () => {
  it('ghi data-theme lên html', () => {
    applyThemeToDom('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    applyThemeToDom('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

describe('không có hex nào lọt vào code ngoài palette', () => {
  it('mọi màu UI đều là chuỗi 6 chữ số', () => {
    for (const hex of Object.values(UI_HEX)) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })
})
