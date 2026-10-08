import { MAX_TILE_TOKEN } from '../theme/palette'

/**
 * Hệ số cỡ chữ theo số chữ số — §B2, suy ra từ bản gốc (55/45/35/30 px trên
 * ô 106.25 px).
 */
export const GLYPH_KEYS = {
  2: 0.51,
  3: 0.42,
  4: 0.33,
  5: 0.28,
} as const

/**
 * §B2 "Min text size": sàn tuyệt đối 11 px, không chữ nào nhỏ hơn. Chỉ chạm tới
 * khi board co dưới 280 px (zoom 200 %, A11Y-10) — ô 39 px trở lên thì hệ số k
 * đã cho ≥ 11 px ở mọi bậc.
 */
export const MIN_GLYPH_PX = 11

/** Nhãn hiển thị của tile. Trên 8192 thì thêm hậu tố `+` (§B11). */
export function tileLabel(value: number): string {
  return value > MAX_TILE_TOKEN ? `${value}+` : `${value}`
}

/**
 * Số chữ số của nhãn. Hậu tố `+` không tính — nó là dấu báo tràn token, không
 * phải một chữ số, nên `16384+` vẫn xếp vào bậc k của 5 chữ số.
 */
export function digitCount(label: string): number {
  return label.replace('+', '').length
}

/**
 * Cỡ chữ cho numeral, tính từ cạnh ô.
 *
 * `cell` không hợp lệ (0, âm, NaN, Infinity) quy về 1 thay vì nhân ra 0/NaN:
 * cỡ chữ 0 làm Phaser dựng canvas 0×0, còn NaN làm hỏng cả layout chữ. Kết quả
 * không bao giờ dưới `MIN_GLYPH_PX`.
 */
export function tileFontSize(value: number, cell: number): number {
  const safeCell = Number.isFinite(cell) && cell > 0 ? cell : 1
  const digits = digitCount(tileLabel(value))
  const k = digits <= 2 ? GLYPH_KEYS[2] : digits === 3 ? GLYPH_KEYS[3] : digits === 4 ? GLYPH_KEYS[4] : GLYPH_KEYS[5]
  return Math.max(MIN_GLYPH_PX, safeCell * k)
}
