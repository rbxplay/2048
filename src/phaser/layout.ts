import type { Pos } from '../game/board'

export type Layout = {
  width: number
  height: number
  boardSide: number
  gap: number
  cell: number
  boardX: number
  boardY: number
  /** Mép trái và bề ngang hàng HUD. Bằng board, trừ khi board co dưới 280 px. */
  hudX: number
  hudWidth: number
  hudY: number
  dpadX: number
  dpadY: number
}

/**
 * Viewport nhỏ nhất mà bố cục cam kết KHÔNG cắt và KHÔNG đè (A11Y-10). Zoom
 * 200 % chia đôi viewport CSS, nên đây là 520×720 px vật lý ở mức zoom đó. Nhỏ
 * hơn nữa thì HUD + D-pad (48 + 160 px) đã ăn gần hết chiều cao: hàm vẫn trả số
 * hữu hạn và không để thứ gì đè lên nhau, nhưng không hứa lọt trong màn.
 */
export const MIN_VIEWPORT_W = 260
export const MIN_VIEWPORT_H = 360

/** Cỡ board ƯU TIÊN tối thiểu (§B3:139). Nhường viewport khi không còn chỗ. */
const MIN_BOARD = 280
const MAX_BOARD = 560
/** Sàn cứng, chỉ chạm tới ở viewport nhỏ hơn mức tối thiểu — giữ cạnh board dương. */
const HARD_MIN_BOARD = 120
const HUD_MIN = 48
const HUD_MAX = 72
/** Cạnh khối D-pad (vuông). `dpadX`/`dpadY` là góc TRÊN-TRÁI của khối này. */
const DPAD_BLOCK = 160
const PADDING = 16
/** Đệm trên còn lại sau khi đã nhường hết cho board ở viewport thấp. */
const PADDING_MIN = 4

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Tính toàn bộ bố cục từ kích thước viewport thật. HÀM THUẦN — không đọc
 * `this.scale`, không chạm Phaser, nên test được không cần engine.
 *
 * Công thức gốc là §B3:139 `clamp(280px, min(92vmin, 560px), 560px)` và
 * §B3:144 `clamp(48px, 9vmin, 72px)` — `vmin` là cạnh NGẮN của viewport. Vì
 * `Scale.RESIZE` cho canvas khớp 1:1 với viewport, `width`/`height` ở đây chính
 * là kích thước vật lý của canvas.
 *
 * Bất biến (A11Y-10), đúng với mọi viewport từ `MIN_VIEWPORT_W × MIN_VIEWPORT_H`
 * trở lên: HUD, board và khối D-pad nằm TRỌN trong `[0,w]×[0,h]` và không đè
 * nhau. "Không đè nhau" còn đúng với MỌI đầu vào hữu hạn.
 *
 * Sàn 280 px của §B3:139 từng là tuyệt đối và D-pad luôn xếp dưới board, nên ở
 * viewport thấp (zoom 200 %) D-pad tràn khỏi đáy và board tràn hai bên. Nay 280
 * chỉ là cỡ ƯU TIÊN, và bố cục được chọn theo ba bậc:
 *
 *   1. Xếp DỌC (HUD → board → D-pad) nếu giữ được board ≥ 280 — đúng những con
 *      số của bản trước, nên viewport nào đã lọt thì không đổi một px.
 *   2. Không thì thử xếp NGANG: D-pad sang bên phải board (§B3:152-154 đã tính
 *      tới việc dời sang cạnh ở tỉ lệ rộng). Cách nào cho board lớn hơn thì thắng.
 *   3. Cả hai đều không giữ nổi 280 thì board co lại cho vừa (hàng HUD thì giữ
 *      bề ngang — xem `hudWidth`). Luôn là cỡ px
 *      thật — không `transform: scale()`, không zoom camera (§B3) — và D-pad
 *      giữ nguyên 160 px vì nút của nó không được nhỏ hơn 48 px (A11Y-07).
 */
export function computeLayout(width: number, height: number): Layout {
  const w = Number.isFinite(width) && width > 0 ? width : MIN_BOARD
  const h = Number.isFinite(height) && height > 0 ? height : MIN_BOARD

  // §B3:144 — 9vmin, tức 0.09 × cạnh NGẮN. Viewport thấp hiếm khi chạm trần.
  const hudHeight = clamp(0.09 * Math.min(w, h), HUD_MIN, HUD_MAX)

  // §B3:139 nguyên văn. `92vmin` = 0.92 × cạnh ngắn của viewport.
  const bySpec = clamp(Math.min(0.92 * Math.min(w, h), MAX_BOARD), MIN_BOARD, MAX_BOARD)

  // Xếp DỌC. `room` là chỗ cho board + đệm trên, sau HUD và khối D-pad. Thiếu
  // chỗ cho 280 thì đệm trên nhường trước (16 → 4 px), rồi mới tới board.
  const room = h - hudHeight - DPAD_BLOCK
  const padTop = clamp(room - MIN_BOARD, PADDING_MIN, PADDING)
  const stacked = Math.min(bySpec, w, room - padTop)

  // Xếp NGANG. Board chừa đệm trên/dưới và chừa bên phải đủ khối D-pad + khe.
  const beside = Math.min(bySpec, h - hudHeight - 2 * PADDING, w - DPAD_BLOCK - 3 * PADDING)

  const sideBySide = stacked < MIN_BOARD && beside > stacked && beside >= HARD_MIN_BOARD
  const boardSide = Math.max(HARD_MIN_BOARD, sideBySide ? beside : stacked)

  const gap = Math.round(boardSide * 0.03)
  const cell = (boardSide - 5 * gap) / 4
  const stackH = hudHeight + boardSide
  // Board co dưới 280 px thì HUD KHÔNG co theo: hai thẻ điểm + bánh răng cần
  // chừng ấy bề ngang để số 5–6 chữ số không đè lên nhau.
  const hudWidth = Math.max(boardSide, Math.min(MIN_BOARD, w - 2 * PADDING_MIN))

  if (sideBySide) {
    // Board vẫn canh giữa khi hai bên còn đủ chỗ cho D-pad; không thì lùi sang
    // trái vừa đủ. D-pad dán khe bên phải board, đáy bằng đáy board.
    const boardX = Math.min((w - boardSide) / 2, w - DPAD_BLOCK - 2 * PADDING - boardSide)
    const hudY = (h - stackH) / 2
    const boardY = hudY + hudHeight
    return {
      width: w,
      height: h,
      boardSide,
      gap,
      cell,
      boardX,
      boardY,
      // Canh trái theo board: bên phải là D-pad, nhưng D-pad nằm thấp hơn hàng HUD.
      hudX: boardX,
      hudWidth,
      hudY,
      dpadX: boardX + boardSide + PADDING,
      // Không cao hơn mép trên board, kẻo chạm hàng HUD khi board thấp hơn D-pad.
      dpadY: Math.max(boardY, boardY + boardSide - DPAD_BLOCK),
    }
  }

  // Cụm HUD + board canh giữa trong khoảng trống PHÍA TRÊN khối D-pad.
  const top = Math.max(padTop, (h - DPAD_BLOCK - PADDING - stackH) / 2)
  const boardY = top + hudHeight

  return {
    width: w,
    height: h,
    boardSide,
    gap,
    cell,
    boardX: (w - boardSide) / 2,
    boardY,
    hudX: (w - hudWidth) / 2,
    hudWidth,
    hudY: top,
    dpadX: (w - DPAD_BLOCK) / 2,
    // Đáy màn hình khi lọt; nếu không thì ngay dưới board — không bao giờ đè.
    dpadY: Math.max(boardY + boardSide, h - DPAD_BLOCK),
  }
}

/**
 * Tâm của một ô, toạ độ game. HÀM THUẦN, cùng lý do `computeLayout` ở đây chứ
 * không nằm trong scene: §A4 bắt "re-layout on resize keeping state" là MUST, và
 * đó chính là chuyện tile đang bay dở phải đáp vào ĐÚNG ô của layout MỚI. Đặt
 * hình học ở module thuần thì bất biến ấy kiểm được bằng test, thay vì kiểm bằng
 * mắt trong một scene mà jsdom không nạp nổi.
 */
export function cellCenter(layout: Layout, pos: Pos): { x: number; y: number } {
  const step = layout.cell + layout.gap
  return {
    x: layout.boardX + layout.gap + layout.cell / 2 + pos.col * step,
    y: layout.boardY + layout.gap + layout.cell / 2 + pos.row * step,
  }
}
