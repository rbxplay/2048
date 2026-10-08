#!/usr/bin/env node
// Sinh src/styles/tokens.css từ src/theme/palette.ts.
//
// Vì sao sinh thay vì chép tay: Phaser cần số 0xRRGGBB còn tầng DOM a11y cần
// chuỗi #RRGGBB. Chép tay hai nơi thì sớm muộn lệch nhau, mà lệch màu ở đây
// nghĩa là hỏng tương phản đã đo — mắt thường không thấy.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync('src/theme/palette.ts', 'utf8')
const grab = (obj, key) => {
  const block = src.slice(src.indexOf(`export const ${obj}`))
  const m = new RegExp(`\\b${key}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(block)
  if (m === null) throw new Error(`không tìm thấy ${obj}.${key}`)
  return m[1]
}

const tiles = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]
const uiKeys = ['page', 'board', 'slot', 'text', 'textMuted', 'textOnDark', 'accent', 'btn', 'ok', 'danger', 'focus']
const darkKeys = ['page', 'text', 'textMuted', 'focus', 'board', 'slot']

const lines = [
  '/* SINH TỰ ĐỘNG bởi scripts/gen-tokens.mjs — đừng sửa tay.',
  '   Nguồn sự thật là src/theme/palette.ts. Giá trị lấy từ §B11 Design System. */',
  ':root{',
  ...uiKeys.map((k) => `  --${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${grab('UI_HEX', k)};`),
  ...tiles.map((t) => `  --t${t}:${grab('TILE_HEX', t)};`),
  '  --board:clamp(280px, min(92vmin, 560px), 560px);',
  '  --gap:calc(var(--board) * 0.03);',
  '  --cell:calc((var(--board) - 5 * var(--gap)) / 4);',
  '  --radius-tile:calc(var(--cell) * 0.06);',
  '}',
  `[data-theme="dark"]{${darkKeys.map((k) => `--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${grab('DARK_HEX', k)};`).join('')}}`,
  `[data-theme="contrast"]{--page:#000;--text:#FFF;--board:#000;--slot:#111;--focus:#FFFF00;}`,
  '',
]

mkdirSync('src/styles', { recursive: true })
writeFileSync('src/styles/tokens.css', lines.join('\n'))
console.log('đã sinh src/styles/tokens.css')
