/**
 * Nguồn sự thật DUY NHẤT của màu — và của mọi token trong §B11.
 *
 * Vì sao để trong TS chứ không chỉ trong CSS: Phaser cần số `0xRRGGBB`, còn
 * tầng DOM a11y cần chuỗi `#RRGGBB`. Hai nơi, một nguồn. `scripts/gen-tokens.mjs`
 * sinh ra `src/styles/tokens.css` từ bảng này, nên không có chỗ nào chép tay
 * để lệch.
 *
 * Cả token KHÔNG phải màu (hình học, chuyển động, font) cũng nằm ở đây vì
 * §B11 là một khối drop-in duy nhất — tách đôi thì generator lại phải viết
 * cứng một nửa, đúng thứ file này sinh ra để chặn.
 */
export const TILE_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192] as const
export type TileValue = (typeof TILE_VALUES)[number]

/** §B11:266-278 — màu nền từng bậc tile. */
export const TILE_HEX: Record<TileValue, string> = {
  2: '#F1E8E0',
  4: '#E8DBC4',
  8: '#F4C19C',
  16: '#F6A581',
  32: '#F6836A',
  64: '#C54A2D',
  128: '#B34120',
  256: '#A43519',
  512: '#912A1D',
  1024: '#7A2531',
  2048: '#60223F',
  4096: '#442142',
  8192: '#271D44',
}

/**
 * §B11:266-278 — màu numeral trên từng bậc tile (`--t{n}-fg`).
 * Hai bậc theo §B1.2: numeral tối cho tile 2–32, numeral sáng cho tile 64+.
 * Viết thẳng ra đây (không suy diễn từ `UI_HEX`) vì `gen-tokens.mjs` đọc file
 * này bằng regex, và vì đó là giá trị §B11 chép nguyên văn.
 */
export const TILE_FG_HEX: Record<TileValue, string> = {
  2: '#2A1C0C',
  4: '#2A1C0C',
  8: '#2A1C0C',
  16: '#2A1C0C',
  32: '#2A1C0C',
  64: '#FFF8EE',
  128: '#FFF8EE',
  256: '#FFF8EE',
  512: '#FFF8EE',
  1024: '#FFF8EE',
  2048: '#FFF8EE',
  4096: '#FFF8EE',
  8192: '#FFF8EE',
}

/**
 * §B11:260-264 — theme sáng: mặt, chữ, hành động.
 * `surfaceBoard` sinh ra `--surface-board`; §B11:280 dành `--board` cho ĐỘ DÀI
 * hình học, nên tên màu phải khác.
 */
export const UI_HEX = {
  page: '#FBF6EC',
  surfaceBoard: '#B9A894',
  slot: '#D2C6B5',
  text: '#2A1C0C',
  textMuted: '#5B4A38',
  textOnDark: '#FFF8EE',
  accent: '#F6C177',
  btn: '#8F4A22',
  ok: '#1B5E20',
  danger: '#B3261E',
  focus: '#1B6EF3',
} as const

/** §B11:302 — theme tối. Chỉ ghi đè cái đổi; còn lại thừa hưởng `:root`. */
export const DARK_HEX = {
  page: '#17161A',
  text: '#F2EDE4',
  textMuted: '#B9B2A6',
  focus: '#8AB4F8',
  surfaceBoard: '#2A2730',
  slot: '#332F3A',
} as const

/**
 * §B11:303 — theme tương phản cao.
 *
 * `textMuted` KHÔNG có trong khối §B11, nhưng phải có ở đây: thiếu nó thì tầng
 * DOM thừa hưởng `--text-muted:#5B4A38` của theme sáng, tức chữ phụ nâu trên
 * nền đen = 2.48:1 — trượt cả 4.5:1 lẫn 3:1, trong đúng cái theme tồn tại vì
 * a11y (§R10). Tầng Phaser đã dùng `#CCCCCC` (13.08:1) từ trước; nay hai tầng
 * lấy cùng một giá trị.
 */
export const CONTRAST_HEX = {
  page: '#000000',
  text: '#FFFFFF',
  textMuted: '#CCCCCC',
  focus: '#FFFF00',
  surfaceBoard: '#000000',
  slot: '#111111',
} as const

/** §B11:304 — tương phản cao lật MỌI tile: nền trắng, numeral đen. */
export const CONTRAST_TILE_HEX = '#FFFFFF'
export const CONTRAST_TILE_FG_HEX = '#000000'
/** §B11:303 — viền trong theme tương phản cao là đen đặc, alpha 1. */
export const CONTRAST_HAIRLINE_HEX = '#000000'

/** §B11:287 / §B4:162 — viền tile 2–32 (numeral tối). */
export const HAIRLINE_LIGHT_HEX = '#2A1C0C'
export const HAIRLINE_LIGHT_ALPHA = 0.18
/** §B11:288 / §B4:163 — viền tile 64+ (numeral sáng). */
export const HAIRLINE_DARK_HEX = '#FFF8EE'
export const HAIRLINE_DARK_ALPHA = 0.22
/** §B11:289-291 — bóng đổ dùng đen tuyền. */
export const SHADOW_BASE_HEX = '#000000'

/**
 * §B11:280-297 — token hình học, viền, bóng, chuyển động, font.
 * Thứ tự trong mảng CHÍNH LÀ thứ tự trong `tokens.css`.
 */
export const STATIC_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--board', 'clamp(280px, min(92vmin, 560px), 560px)'],
  ['--gap', 'calc(var(--board) * 0.03)'],
  ['--cell', 'calc((var(--board) - 5 * var(--gap)) / 4)'],
  ['--radius-slot', 'calc(var(--cell) * 0.06)'],
  ['--radius-tile', 'calc(var(--cell) * 0.06)'],
  ['--radius-card', '16px'],
  ['--hairline-light', '1px solid rgba(42,28,12,.18)'],
  ['--hairline-dark', '1px solid rgba(255,248,238,.22)'],
  ['--shadow-tile', '0 1px 0 rgba(42,28,12,.10), 0 2px 6px rgba(42,28,12,.08)'],
  ['--shadow-tile-high', '0 2px 0 rgba(0,0,0,.18), 0 6px 18px rgba(0,0,0,.22)'],
  ['--shadow-float', '0 8px 28px rgba(0,0,0,.28)'],
  ['--dur-slide', '100ms'],
  ['--dur-appear', '200ms'],
  ['--dur-pop', '200ms'],
  ['--dur-badge', '600ms'],
  ['--dur-overlay', '800ms'],
  ['--delay-appear', '100ms'],
  ['--ease-standard', 'cubic-bezier(.25,.1,.25,1)'],
  ['--font', '"2048 Digits", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
]

/** §B11:299-301 — override khi người chơi bật giảm chuyển động. */
export const REDUCED_MOTION_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--dur-slide', '0ms'],
  ['--dur-pop', '0ms'],
  ['--dur-appear', '120ms'],
  ['--dur-badge', '0ms'],
  ['--dur-overlay', '200ms'],
  ['--delay-appear', '0ms'],
]

/**
 * §B1.5 — theme tương phản cao vẽ "white `#FFFFFF` tiles with a 2-px black
 * border": viền ĐEN ĐẶC và DÀY 2px, khác `1px` nâu/kem của hai theme kia. Nếu
 * không ghi đè, tầng DOM giữ viền nâu của theme sáng — gần như vô hình trên nền
 * đen, mà §B4:168 và §B1.4:112 nói chính hairline là thứ tách tile.
 *
 * §B11:303-304 không liệt kê hai token này, nhưng nó tự rút gọn bằng "…same flip
 * for all values…" nên là bản minh hoạ; §B1.5 mới là chỗ nói rõ độ dày. Đây là
 * phần BỔ SUNG cho §B11, không phải sửa nó.
 *
 * Màu dựng từ `CONTRAST_HAIRLINE_HEX` — không chép lại hex.
 */
export const CONTRAST_HAIRLINE_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--hairline-light', `2px solid ${CONTRAST_HAIRLINE_HEX}`],
  ['--hairline-dark', `2px solid ${CONTRAST_HAIRLINE_HEX}`],
]

/** Giá trị tile > 8192 dùng lại token 8192 (§B11). */
export const MAX_TILE_TOKEN = 8192

const HEX6 = /^#?([0-9a-fA-F]{6})$/

function channels(hex: string): [number, number, number] {
  const m = HEX6.exec(hex)
  if (m === null) throw new Error(`màu không hợp lệ: ${hex}`)
  const n = Number.parseInt(m[1]!, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Đổi `#RRGGBB` sang số cho Phaser. Ném lỗi với chuỗi sai. */
export function hexToInt(hex: string): number {
  const m = HEX6.exec(hex)
  if (m === null) throw new Error(`màu không hợp lệ: ${hex}`)
  return Number.parseInt(m[1]!, 16)
}

/** Luminance tương đối theo WCAG 2.x. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Tỉ lệ tương phản WCAG giữa hai màu. Luôn >= 1. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
