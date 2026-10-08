import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTheme } from '../phaser/theme'
import {
  CONTRAST_HAIRLINE_HEX,
  CONTRAST_HEX,
  CONTRAST_TILE_FG_HEX,
  CONTRAST_TILE_HEX,
  DARK_HEX,
  REDUCED_MOTION_TOKENS,
  TILE_FG_HEX,
  TILE_HEX,
  TILE_VALUES,
  UI_HEX,
} from '../theme/palette'

/**
 * `src/styles/tokens.css` là file SINH RA. Test này canh đúng chỗ dễ lệch nhất:
 * bản đã commit so với `palette.ts` — nguồn sự thật — cho CẢ BA theme.
 *
 * Vì sao cần: theme tương phản cao từng bị chép tay ở hai nơi và lệch thật
 * (`--text-muted` tầng DOM thừa hưởng màu nâu của theme sáng ⇒ 2.48:1 trên nền
 * đen), còn khối contrast thì thiếu hẳn bản lật tile. Không cổng nào bắt được:
 * `check_contrast.py` chép cứng cặp màu của tài liệu, không đọc file này.
 */
const CSS = readFileSync('src/styles/tokens.css', 'utf8')
const GENERATOR = readFileSync('scripts/gen-tokens.mjs', 'utf8')

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** Nội dung giữa cặp `{` `}` đầu tiên sau `marker`; '' nếu thiếu khối. */
function block(marker: string): string {
  const at = CSS.indexOf(marker)
  if (at === -1) return ''
  const from = CSS.indexOf('{', at)
  const to = CSS.indexOf('}', from)
  return from === -1 || to === -1 ? '' : CSS.slice(from + 1, to)
}

function decls(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim())
  return out
}

const root = decls(block('\n:root{'))
const dark = decls(block('[data-theme="dark"]{'))
const contrast = decls(block('[data-theme="contrast"]{'))
const reduced = decls(block('@media (prefers-reduced-motion: reduce){'))

const isColour = (v: string) => /^#|^rgba?\(|^hsla?\(/.test(v)

describe('tokens.css — các khối bắt buộc phải tồn tại', () => {
  it.each([':root', '[data-theme="dark"]', '[data-theme="contrast"]'])('%s có nội dung', (sel) => {
    expect(block(sel)).not.toBe('')
  })

  it('có khối @media (prefers-reduced-motion: reduce)', () => {
    expect(block('@media (prefers-reduced-motion: reduce){')).not.toBe('')
  })
})

describe('tokens.css — theme sáng khớp palette.ts', () => {
  it('mọi token màu UI có mặt và đúng giá trị', () => {
    for (const [key, hex] of Object.entries(UI_HEX)) {
      expect(root.get(`--${kebab(key)}`), `--${kebab(key)}`).toBe(hex)
    }
  })

  it('màu mặt board tên là --surface-board, không phải --board', () => {
    expect(root.get('--surface-board')).toBe(UI_HEX.surfaceBoard)
  })

  it('13 tile có cả nền lẫn màu numeral', () => {
    for (const v of TILE_VALUES) {
      expect(root.get(`--t${v}`), `--t${v}`).toBe(TILE_HEX[v])
      expect(root.get(`--t${v}-fg`), `--t${v}-fg`).toBe(TILE_FG_HEX[v])
    }
  })
})

describe('tokens.css — theme tối khớp palette.ts', () => {
  it('mọi token ghi đè có mặt và đúng giá trị', () => {
    for (const [key, hex] of Object.entries(DARK_HEX)) {
      expect(dark.get(`--${kebab(key)}`), `--${kebab(key)}`).toBe(hex)
    }
  })

  it('không ghi đè màu tile (thang màu giữ nguyên)', () => {
    for (const v of TILE_VALUES) expect(dark.has(`--t${v}`)).toBe(false)
  })
})

describe('tokens.css — theme tương phản cao khớp palette.ts', () => {
  it('mọi token ghi đè có mặt, gồm cả --text-muted', () => {
    for (const [key, hex] of Object.entries(CONTRAST_HEX)) {
      expect(contrast.get(`--${kebab(key)}`), `--${kebab(key)}`).toBe(hex)
    }
  })

  it('chữ phụ đủ tương phản trên nền đen (§R10, a11y)', () => {
    const muted = contrast.get('--text-muted')
    expect(muted, '--text-muted của theme contrast phải được khai báo tường minh').toBeDefined()
    expect(muted).toBe(CONTRAST_HEX.textMuted)
  })

  it('lật MỌI tile thành nền trắng + numeral đen (§B11:304)', () => {
    for (const v of TILE_VALUES) {
      expect(contrast.get(`--t${v}`), `--t${v}`).toBe(CONTRAST_TILE_HEX)
      expect(contrast.get(`--t${v}-fg`), `--t${v}-fg`).toBe(CONTRAST_TILE_FG_HEX)
    }
  })

  // §B11:303-304 KHÔNG liệt kê hai token hairline, nhưng §B1.5 nói thẳng theme
  // contrast vẽ tile trắng viền ĐEN **2px**, và §B11 tự rút gọn bằng "…same flip
  // for all values…" nên nó là bản minh hoạ, không đầy đủ. Thiếu override thì
  // tầng DOM giữ `rgba(42,28,12,.18)` của theme sáng — viền nâu gần như vô hình
  // trên nền đen, mà §B4:168 / §B1.4:112 nói chính hairline là thứ tách tile.
  describe('hairline ở tầng DOM (R9)', () => {
    const HAIRLINES = ['--hairline-light', '--hairline-dark'] as const

    it.each(HAIRLINES)('khối contrast ghi đè %s', (token) => {
      const value = contrast.get(token)
      expect(value, `${token} phải được khai báo trong [data-theme="contrast"]`).toBeDefined()
      // Phải KHÁC theme sáng, nếu không thì "có khai báo" mà vẫn thừa hưởng màu nâu.
      expect(value, `${token} vẫn là giá trị của theme sáng`).not.toBe(root.get(token))
    })

    it.each(HAIRLINES)('%s dày 2px và là màu đen đặc (§B1.5)', (token) => {
      expect(contrast.get(token)).toMatch(/^2px\s+solid\s+#0{6}$/i)
    })

    it('màu hairline tầng DOM ở contrast BẰNG màu theme.ts trả cho contrast', () => {
      const domHex = (contrast.get('--hairline-light') ?? '').match(/#[0-9a-fA-F]{6}/)?.[0]
      expect(domHex, 'không đọc được mã màu từ --hairline-light').toBeDefined()
      expect(domHex!.toUpperCase()).toBe(CONTRAST_HAIRLINE_HEX.toUpperCase())

      // Cùng một giá trị ở tầng Phaser — nếu một tầng đổi mà tầng kia không, đỏ.
      const theme = buildTheme('contrast')
      const phaserHex = `#${theme.tileHairline(2).toString(16).padStart(6, '0')}`
      expect(domHex!.toUpperCase()).toBe(phaserHex.toUpperCase())
    })
  })
})

describe('tokens.css — --board là độ dài, không phải màu', () => {
  // `[data-theme]` cùng specificity (0,1,0) với `:root` và đứng sau, nên ở
  // dark/contrast một `--board` màu sẽ thắng và làm `--gap`/`--cell` thành
  // `calc(#2A2730 * 0.03)` — invalid at computed-value time, kéo sập cả cụm.
  it.each([
    [':root', root],
    ['dark', dark],
    ['contrast', contrast],
  ])('%s: --board là độ dài', (_name, scope) => {
    const value = scope.get('--board')
    if (value === undefined) return
    expect(isColour(value), `--board không được là màu: ${value}`).toBe(false)
    expect(value).toMatch(/^(clamp|min|max|calc)\(/)
  })

  it('cả ba theme đều có --surface-board là màu', () => {
    for (const scope of [root, dark, contrast]) {
      expect(scope.get('--surface-board')).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
})

describe('tokens.css — bộ token §B11 đầy đủ', () => {
  const REQUIRED = [
    '--radius-slot', '--radius-tile', '--radius-card',
    '--hairline-light', '--hairline-dark',
    '--shadow-tile', '--shadow-tile-high', '--shadow-float',
    '--dur-slide', '--dur-appear', '--dur-pop', '--dur-badge', '--dur-overlay',
    '--delay-appear', '--ease-standard', '--font',
    '--board', '--gap', '--cell',
  ]

  it.each(REQUIRED)('%s có mặt trong :root', (name) => {
    expect(root.get(name), name).toBeDefined()
  })

  it('khối giảm chuyển động ghi đè đủ 6 token', () => {
    for (const [name, value] of REDUCED_MOTION_TOKENS) {
      expect(reduced.get(name), name).toBe(value)
      expect(root.get(name), `${name} phải có giá trị gốc khác`).not.toBe(value)
    }
  })

  it('mọi rgba() trong file dựng từ màu có trong palette', () => {
    const palette = new Set(
      [
        ...Object.values(UI_HEX), ...Object.values(DARK_HEX), ...Object.values(CONTRAST_HEX),
        ...Object.values(TILE_HEX), ...Object.values(TILE_FG_HEX),
        CONTRAST_TILE_HEX, CONTRAST_TILE_FG_HEX,
      ].map((hex) => {
        const n = Number.parseInt(hex.slice(1), 16)
        return `${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff}`
      }),
    )
    const found = [...CSS.matchAll(/rgba?\(([^)]*)\)/g)]
    expect(found.length).toBeGreaterThan(0)
    for (const m of found) {
      const rgb = m[1]!.split(',').slice(0, 3).join(',')
      expect(palette.has(rgb), `rgba(${m[1]}) không có màu nào trong palette khớp`).toBe(true)
    }
  })
})

describe('gen-tokens.mjs — không chép màu, không chép tên token', () => {
  it('không chứa một chuỗi màu nào', () => {
    expect(GENERATOR).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/)
    expect(GENERATOR).not.toMatch(/rgba?\(/)
  })

  it('không liệt kê cứng tên token nào', () => {
    // Bỏ comment trước: chính tài liệu trong file có nhắc `'--token'` làm ví dụ.
    const code = GENERATOR
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/['"`]--[a-z]/)
  })

  it('sinh lại cho ra file y hệt bản đã commit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tokens-'))
    const out = join(dir, 'tokens.css')
    execFileSync(process.execPath, ['scripts/gen-tokens.mjs', out], { stdio: 'pipe' })
    expect(readFileSync(out, 'utf8')).toBe(CSS)
  })
})
