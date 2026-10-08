#!/usr/bin/env node
// Sinh src/styles/tokens.css TỪ src/theme/palette.ts.
//
// Vì sao sinh thay vì chép tay: Phaser cần số 0xRRGGBB còn tầng DOM a11y cần
// chuỗi #RRGGBB. Chép tay hai nơi thì sớm muộn lệch nhau, mà lệch màu ở đây
// nghĩa là hỏng tương phản đã đo — mắt thường không thấy.
//
// Script này KHÔNG chứa một chuỗi màu nào, cũng không chứa danh sách tên token
// nào: tất cả — kể cả thứ tự khai báo — đọc từ palette.ts. Thêm một token màu
// mới vào palette.ts là nó tự ra CSS.
//
// Dùng: node scripts/gen-tokens.mjs [đường-dẫn-xuất]   (mặc định src/styles/tokens.css)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const SRC = 'src/theme/palette.ts'
const OUT = process.argv[2] ?? 'src/styles/tokens.css'

const src = readFileSync(SRC, 'utf8')

// Cắt từ khai báo tới dấu đóng của chính khối đó. Cắt tới hết file thì một key
// thiếu sẽ khớp sang object sau và ÂM THẦM trả giá trị của object khác — mà
// ba bảng theme ở đây dùng chung tên key (`page`, `text`, `slot`, `focus`, …).
function blockOf(name, open, close) {
  const decl = src.indexOf(`export const ${name}`)
  if (decl === -1) throw new Error(`không tìm thấy ${name} trong ${SRC}`)
  const from = src.indexOf(open, decl)
  if (from === -1) throw new Error(`${name} thiếu dấu mở`)
  const to = src.indexOf(close, from)
  if (to === -1) throw new Error(`${name} thiếu dấu đóng`)
  return src.slice(from, to)
}

/** Bảng `{ key: '#RRGGBB', … }` → mảng [key, hex] theo đúng thứ tự trong nguồn. */
function hexTable(name) {
  const block = blockOf(name, '= {', '\n}')
  const out = [...block.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]])
  if (out.length === 0) throw new Error(`${name} không có cặp key/màu nào`)
  return out
}

/** Hằng màu đơn: `export const X = '#RRGGBB'`. */
function hexConst(name) {
  const m = new RegExp(`export const ${name} = '(#[0-9A-Fa-f]{6})'`).exec(src)
  if (m === null) throw new Error(`không tìm thấy hằng màu ${name}`)
  return m[1]
}

/** Mảng số: `export const X = [2, 4, …]`. */
function numberList(name) {
  const block = blockOf(name, '= [', ']')
  const out = block
    .replace(/^=\s*\[/, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
  if (out.length === 0 || out.some((n) => !Number.isInteger(n))) {
    throw new Error(`${name} phải là mảng số nguyên`)
  }
  return out
}

/** Mảng cặp `[['--token', 'giá trị'], …]` theo đúng thứ tự trong nguồn. */
function tokenList(name) {
  // Đóng ở `\n]` chứ không phải `]` trần: mỗi phần tử cũng có `]` của riêng nó.
  const block = blockOf(name, '= [', '\n]')
  // Giá trị nhận cả `'chuỗi'` lẫn `` `template` ``; dạng template cho phép dựng
  // giá trị từ hằng màu (xem `resolveHex`) mà không phải chép lại hex ở đây.
  const out = [...block.matchAll(/\[\s*'(--[a-z0-9-]+)'\s*,\s*(?:'([^']*)'|`([^`]*)`)\s*\]/g)]
    .map((m) => [m[1], resolveHex(m[2] ?? m[3] ?? '')])
  if (out.length === 0) throw new Error(`${name} không có cặp token/giá trị nào`)
  return out
}

/**
 * Thay `${TÊN_HẰNG}` bằng hex của hằng đó trong palette.ts. Nhờ vậy một token
 * như `--hairline-light` của theme contrast vẫn lấy màu từ
 * `CONTRAST_HAIRLINE_HEX` — script này không chứa chuỗi màu nào.
 */
function resolveHex(value) {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => hexConst(name))
}

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const decl = ([key, hex]) => `  --${kebab(key)}:${hex};`
const raw = ([name, value]) => `  ${name}:${value};`

const tiles = numberList('TILE_VALUES')
const ui = hexTable('UI_HEX')
const tileHex = new Map(hexTable('TILE_HEX'))
const tileFg = new Map(hexTable('TILE_FG_HEX'))
const dark = hexTable('DARK_HEX')
const contrast = hexTable('CONTRAST_HEX')
const contrastTile = hexConst('CONTRAST_TILE_HEX')
const contrastTileFg = hexConst('CONTRAST_TILE_FG_HEX')
const statics = tokenList('STATIC_TOKENS')
const reducedMotion = tokenList('REDUCED_MOTION_TOKENS')
const contrastHairlines = tokenList('CONTRAST_HAIRLINE_TOKENS')

const fillOf = (t) => {
  const hex = tileHex.get(String(t))
  if (hex === undefined) throw new Error(`TILE_HEX thiếu tile ${t}`)
  return hex
}
const fgOf = (t) => {
  const hex = tileFg.get(String(t))
  if (hex === undefined) throw new Error(`TILE_FG_HEX thiếu tile ${t}`)
  return hex
}

const lines = [
  '/* SINH TỰ ĐỘNG bởi scripts/gen-tokens.mjs — đừng sửa tay.',
  '   Nguồn sự thật là src/theme/palette.ts. Nội dung theo §B11 Design System. */',
  ':root{',
  ...ui.map(decl),
  ...tiles.flatMap((t) => [`  --t${t}:${fillOf(t)};`, `  --t${t}-fg:${fgOf(t)};`]),
  ...statics.map(raw),
  '}',
  '@media (prefers-reduced-motion: reduce){',
  '  :root{',
  ...reducedMotion.map(raw),
  '  }',
  '}',
  `[data-theme="dark"]{`,
  ...dark.map(decl),
  '}',
  `[data-theme="contrast"]{`,
  ...contrast.map(decl),
  // §B11:304 — tương phản cao bỏ hẳn thang màu: mọi tile nền trắng, numeral đen.
  ...tiles.flatMap((t) => [
    `  --t${t}:${contrastTile};`,
    `  --t${t}-fg:${contrastTileFg};`,
  ]),
  // §B1.5 — viền đen đặc 2px, dày hơn 1px của hai theme kia. §B11:303-304 không
  // liệt kê vì nó tự rút gọn bằng "…same flip for all values…".
  ...contrastHairlines.map(raw),
  '}',
  '',
]

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n'))
console.log(`đã sinh ${OUT}`)
