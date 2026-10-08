import {
  DARK_HEX, MAX_TILE_TOKEN, TILE_HEX, TILE_VALUES, UI_HEX, hexToInt,
  type TileValue,
} from '../theme/palette'
import type { ThemeName } from '../game/persist'

// `ThemeName` thuộc `game/persist.ts` vì nó là một phần của save schema
// (`settings.theme`). Định nghĩa lại ở đây sẽ lệch khi thêm theme thứ tư.

export type PhaserTheme = {
  page: number
  board: number
  slot: number
  text: number
  textMuted: number
  textOnDark: number
  btn: number
  focus: number
  tileFill(value: number): number
  tileText(value: number): number
  tileHairline(value: number): number
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

  const page = contrast ? 0x000000 : hexToInt(dark ? DARK_HEX.page : UI_HEX.page)
  const text = contrast ? 0xffffff : hexToInt(dark ? DARK_HEX.text : UI_HEX.text)

  return {
    page,
    text,
    textMuted: contrast ? 0xcccccc : hexToInt(dark ? DARK_HEX.textMuted : UI_HEX.textMuted),
    textOnDark: hexToInt(UI_HEX.textOnDark),
    // Theme tương phản cao: nền đen, board và slot đều tối để ô nổi bằng viền.
    board: contrast ? 0x000000 : hexToInt(dark ? DARK_HEX.board : UI_HEX.board),
    slot: contrast ? 0x111111 : hexToInt(dark ? DARK_HEX.slot : UI_HEX.slot),
    btn: hexToInt(UI_HEX.btn),
    focus: hexToInt(contrast ? '#FFFF00' : dark ? DARK_HEX.focus : UI_HEX.focus),

    // Theme tương phản cao bỏ hẳn thang màu: mọi tile nền trắng, viền đen,
    // numeral đen. Giá trị vẫn đọc được vì numeral luôn hiện (§A11).
    tileFill: (value) => (contrast ? 0xffffff : hexToInt(TILE_HEX[tokenFor(value)])),
    tileText: (value) => (contrast ? 0x000000 : hexToInt(value >= 64 ? UI_HEX.textOnDark : UI_HEX.text)),
    tileHairline: () => (contrast ? 0x000000 : hexToInt(UI_HEX.text)),
  }
}

/**
 * Ghi theme hiện tại lên `<html>` để CSS của tầng DOM a11y dùng cùng bảng màu.
 * Không có bước này thì focus ring và live region vẫn theo theme cũ.
 */
export function applyThemeToDom(name: ThemeName): void {
  document.documentElement.setAttribute('data-theme', name)
}
