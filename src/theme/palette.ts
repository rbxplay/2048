/**
 * Nguồn sự thật DUY NHẤT của màu. Giá trị chép nguyên văn từ §B11 của
 * docs/DesignSystem.md.
 *
 * Vì sao để trong TS chứ không chỉ trong CSS: Phaser cần số `0xRRGGBB`, còn
 * tầng DOM a11y cần chuỗi `#RRGGBB`. Hai nơi, một nguồn. `scripts/gen-tokens.mjs`
 * sinh ra `src/styles/tokens.css` từ bảng này, nên không có chỗ nào chép tay
 * để lệch.
 */
export const TILE_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192] as const
export type TileValue = (typeof TILE_VALUES)[number]

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

export const UI_HEX = {
  page: '#FBF6EC',
  board: '#B9A894',
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

export const DARK_HEX = {
  page: '#17161A',
  text: '#F2EDE4',
  textMuted: '#B9B2A6',
  focus: '#8AB4F8',
  board: '#2A2730',
  slot: '#332F3A',
} as const

/** Giá trị tile > 8192 dùng lại token 8192 (§B11). */
export const MAX_TILE_TOKEN = 8192

const HEX6 = /^#?([0-9a-fA-F]{6})$/

/** Đổi `#RRGGBB` sang số cho Phaser. Ném lỗi với chuỗi sai. */
export function hexToInt(hex: string): number {
  const m = HEX6.exec(hex)
  if (m === null) throw new Error(`màu không hợp lệ: ${hex}`)
  return Number.parseInt(m[1]!, 16)
}

/** Luminance tương đối theo WCAG 2.x. */
export function luminance(hex: string): number {
  const m = HEX6.exec(hex)
  if (m === null) throw new Error(`màu không hợp lệ: ${hex}`)
  const n = Number.parseInt(m[1]!, 16)
  const channels = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  const [r, g, b] = channels.map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
