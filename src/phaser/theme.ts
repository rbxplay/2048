import {
  CONTRAST_HAIRLINE_HEX, CONTRAST_HEX, CONTRAST_TILE_FG_HEX, CONTRAST_TILE_HEX,
  DARK_HEX, HAIRLINE_DARK_ALPHA, HAIRLINE_DARK_HEX, HAIRLINE_LIGHT_ALPHA,
  HAIRLINE_LIGHT_HEX, MAX_TILE_TOKEN, TILE_FG_HEX,
  TILE_HEX, TILE_VALUES, UI_HEX, hexToInt,
  type TileValue,
} from '../theme/palette'
import type { ThemeName } from '../game/persist'

// `ThemeName` thuộc `game/persist.ts` vì nó là một phần của save schema
// (`settings.theme`). Định nghĩa lại ở đây sẽ lệch khi thêm theme thứ tư.
// Xuất lại chỉ để call-site của Task 18 (`import { …, type ThemeName } from
// './phaser/theme'`) biên dịch được — vẫn đúng một định nghĩa duy nhất.
export type { ThemeName } from '../game/persist'

export type PhaserTheme = {
  page: number
  board: number
  slot: number
  text: number
  textMuted: number
  textOnDark: number
  btn: number
  focus: number
  /**
   * §B1.5 — độ dày viền tile. Theme tương phản cao vẽ "white tiles with a 2-px
   * black border", hai theme kia dùng hairline 1px của §B11:287-288. Nằm ở đây
   * chứ không ở nơi vẽ vì CHỈ theme biết mình là theme nào.
   */
  hairlineWidth: number
  tileFill(value: number): number
  tileText(value: number): number
  tileHairline(value: number): number
  /** Alpha của viền: §B4:162-163 theo bậc numeral, §B1.5 đen đặc ở contrast. */
  tileHairlineAlpha(value: number): number
}

/** Giá trị tile đã quy về token gần nhất ≤ 8192. */
function tokenFor(value: number): TileValue {
  if ((TILE_VALUES as readonly number[]).includes(value)) return value as TileValue
  let best: TileValue = TILE_VALUES[0]!
  for (const v of TILE_VALUES) if (v <= Math.min(value, MAX_TILE_TOKEN)) best = v
  return best
}

export function buildTheme(name: ThemeName = 'light'): PhaserTheme {
  const dark = name === 'dark'
  const contrast = name === 'contrast'

  return {
    page: hexToInt(contrast ? CONTRAST_HEX.page : dark ? DARK_HEX.page : UI_HEX.page),
    text: hexToInt(contrast ? CONTRAST_HEX.text : dark ? DARK_HEX.text : UI_HEX.text),
    textMuted: hexToInt(
      contrast ? CONTRAST_HEX.textMuted : dark ? DARK_HEX.textMuted : UI_HEX.textMuted,
    ),
    textOnDark: hexToInt(UI_HEX.textOnDark),
    // Theme tương phản cao: nền đen, board và slot đều tối để ô nổi bằng viền.
    board: hexToInt(
      contrast ? CONTRAST_HEX.surfaceBoard : dark ? DARK_HEX.surfaceBoard : UI_HEX.surfaceBoard,
    ),
    slot: hexToInt(contrast ? CONTRAST_HEX.slot : dark ? DARK_HEX.slot : UI_HEX.slot),
    btn: hexToInt(UI_HEX.btn),
    focus: hexToInt(contrast ? CONTRAST_HEX.focus : dark ? DARK_HEX.focus : UI_HEX.focus),
    // §B11:287-288 dày 1px; §B1.5 đổi thành 2px ở theme tương phản cao. Con số
    // này khớp `CONTRAST_HAIRLINE_TOKENS` mà `tokens.css` sinh ra, nên hai tầng
    // vẽ cùng một độ dày.
    hairlineWidth: contrast ? 2 : 1,

    // Theme tương phản cao bỏ hẳn thang màu: mọi tile nền trắng, viền đen,
    // numeral đen. Giá trị vẫn đọc được vì numeral luôn hiện (§A11).
    tileFill: (value) => hexToInt(contrast ? CONTRAST_TILE_HEX : TILE_HEX[tokenFor(value)]),
    tileText: (value) => hexToInt(contrast ? CONTRAST_TILE_FG_HEX : TILE_FG_HEX[tokenFor(value)]),
    // §B4:162-163: hai viền theo bậc tile. Một màu duy nhất không đủ — ở theme
    // tối, tile 8192 trên slot chỉ 1.20:1, chính viền sáng mới tách được ô ra
    // (§B1.4). Alpha do nơi vẽ truyền vào (0.18 cho 2–32, 0.22 cho 64+).
    tileHairline: (value) => {
      if (contrast) return hexToInt(CONTRAST_HAIRLINE_HEX)
      return hexToInt(value >= 64 ? HAIRLINE_DARK_HEX : HAIRLINE_LIGHT_HEX)
    },
    tileHairlineAlpha: (value) => {
      if (contrast) return 1
      return value >= 64 ? HAIRLINE_DARK_ALPHA : HAIRLINE_LIGHT_ALPHA
    },
  }
}

/**
 * Ghi theme hiện tại lên `<html>` để CSS của tầng DOM a11y dùng cùng bảng màu.
 * Không có bước này thì focus ring và live region vẫn theo theme cũ.
 */
export function applyThemeToDom(name: ThemeName): void {
  document.documentElement.setAttribute('data-theme', name)
}
