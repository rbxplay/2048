import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CONTRAST_HEX, DARK_HEX, TILE_FG_HEX, TILE_HEX, TILE_VALUES, UI_HEX,
  contrastRatio, hexToInt,
} from '../theme/palette'
import { applyThemeToDom, buildTheme } from './theme'

const hexOf = (n: number) => `#${n.toString(16).padStart(6, '0').toUpperCase()}`

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

describe('buildTheme đọc màu từ palette, không chép tay (Critical #1)', () => {
  // Tầng Phaser và tầng DOM phải mô tả CÙNG một bảng màu. Trước đây mỗi tầng
  // chép tay bảng contrast và đã lệch: Phaser #CCCCCC (13.08:1), DOM thừa
  // hưởng #5B4A38 của theme sáng (2.48:1).
  it('theme tương phản cao khớp CONTRAST_HEX từng trường', () => {
    const c = buildTheme('contrast')
    expect(c.page).toBe(hexToInt(CONTRAST_HEX.page))
    expect(c.text).toBe(hexToInt(CONTRAST_HEX.text))
    expect(c.textMuted).toBe(hexToInt(CONTRAST_HEX.textMuted))
    expect(c.board).toBe(hexToInt(CONTRAST_HEX.surfaceBoard))
    expect(c.slot).toBe(hexToInt(CONTRAST_HEX.slot))
    expect(c.focus).toBe(hexToInt(CONTRAST_HEX.focus))
  })

  it('theme sáng khớp UI_HEX', () => {
    const t = buildTheme('light')
    expect(t.page).toBe(hexToInt(UI_HEX.page))
    expect(t.board).toBe(hexToInt(UI_HEX.surfaceBoard))
    expect(t.slot).toBe(hexToInt(UI_HEX.slot))
    expect(t.text).toBe(hexToInt(UI_HEX.text))
    expect(t.textMuted).toBe(hexToInt(UI_HEX.textMuted))
    expect(t.focus).toBe(hexToInt(UI_HEX.focus))
  })

  it('theme tối khớp DARK_HEX', () => {
    const t = buildTheme('dark')
    expect(t.page).toBe(hexToInt(DARK_HEX.page))
    expect(t.board).toBe(hexToInt(DARK_HEX.surfaceBoard))
    expect(t.slot).toBe(hexToInt(DARK_HEX.slot))
    expect(t.text).toBe(hexToInt(DARK_HEX.text))
    expect(t.textMuted).toBe(hexToInt(DARK_HEX.textMuted))
    expect(t.focus).toBe(hexToInt(DARK_HEX.focus))
  })

  it('mọi bậc tile lấy nền và numeral từ TILE_HEX / TILE_FG_HEX', () => {
    const t = buildTheme('light')
    for (const v of TILE_VALUES) {
      expect(t.tileFill(v), `tile ${v}`).toBe(hexToInt(TILE_HEX[v]))
      expect(t.tileText(v), `tile ${v}`).toBe(hexToInt(TILE_FG_HEX[v]))
    }
  })
})

describe('tileHairline — hai bậc theo §B4:162-163 (Important #3)', () => {
  it('tile ≤ 32 dùng viền tối #2A1C0C', () => {
    const t = buildTheme('light')
    for (const v of [2, 4, 8, 16, 32]) expect(t.tileHairline(v), `tile ${v}`).toBe(0x2a1c0c)
  })

  it('tile ≥ 64 dùng viền sáng #FFF8EE', () => {
    const t = buildTheme('light')
    for (const v of [64, 128, 256, 512, 1024, 2048, 4096, 8192]) {
      expect(t.tileHairline(v), `tile ${v}`).toBe(0xfff8ee)
    }
  })

  it('giá trị vượt 8192 vẫn theo bậc ≥ 64', () => {
    expect(buildTheme('light').tileHairline(16384)).toBe(0xfff8ee)
  })

  it('viền đạt >= 3:1 với nền tile ở CẢ HAI bậc (§B1.3)', () => {
    // Trước đây luôn trả #2A1C0C: trên tile 8192 chỉ 1.06:1 — mất đúng cơ chế
    // tách ô mà §B1.4 dựa vào ở theme tối.
    const t = buildTheme('light')
    for (const v of TILE_VALUES) {
      expect(contrastRatio(hexOf(t.tileHairline(v)), TILE_HEX[v]), `tile ${v}`)
        .toBeGreaterThanOrEqual(3)
    }
  })

  it('theme tương phản cao dùng viền đen đặc', () => {
    const c = buildTheme('contrast')
    for (const v of [2, 8192]) expect(c.tileHairline(v)).toBe(0x000000)
  })

  it('theme tối vẫn tách được tile bằng viền (§B1.4)', () => {
    const dark = buildTheme('dark')
    expect(dark.tileHairline(8192)).toBe(0xfff8ee)
    expect(contrastRatio(hexOf(dark.tileHairline(8192)), TILE_HEX[8192])).toBeGreaterThanOrEqual(3)
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
  // Test cũ chỉ kiểm định dạng chuỗi của UI_HEX nên đã bỏ lọt đúng lỗi nó mang
  // tên: bảng contrast chép tay trong theme.ts. Nay quét thẳng mã nguồn.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name)
      if (e.isDirectory()) return walk(p)
      return e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : []
    })

  it('mọi tệp .ts trong src/phaser/ đều không chứa literal màu', () => {
    const files = walk('src/phaser')
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), `${f} chứa literal hex`).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/)
    }
  })

  it('mọi màu UI của palette là chuỗi 6 chữ số', () => {
    for (const hex of Object.values(UI_HEX)) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })
})
