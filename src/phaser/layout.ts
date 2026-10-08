export type Layout = {
  width: number
  height: number
  boardSide: number
  gap: number
  cell: number
  boardX: number
  boardY: number
  hudY: number
  dpadY: number
}

const MIN_BOARD = 280
const MAX_BOARD = 560
const HUD_MIN = 48
const HUD_MAX = 72
/** Chiều cao khối D-pad. `dpadY` là MÉP TRÊN của khối này. */
const DPAD_BLOCK = 160
const PADDING = 16

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Tính toàn bộ bố cục từ kích thước viewport thật. HÀM THUẦN — không đọc
 * `this.scale`, không chạm Phaser, nên test được không cần engine.
 *
 * Công thức cạnh board lấy từ §B3:139 `clamp(280px, min(92vmin, 560px), 560px)`.
 * Vì `Scale.RESIZE` cho canvas khớp 1:1 với viewport, `width`/`height` ở đây
 * chính là kích thước vật lý của canvas.
 *
 * §B3 không biết đến HUD và D-pad, nên cạnh board còn bị chặn trên bởi chỗ
 * đứng thật. Hai bất biến phải đúng với MỌI đầu vào hữu hạn:
 *
 *   dpadY >= boardY + boardSide        (D-pad không đè lên board)
 *   boardY >= hudY + hudHeight         (HUD không đè lên board)
 *
 * Khi viewport thấp đến mức cả sàn 280 px lẫn D-pad không cùng lọt, sàn bị hạ
 * xuống theo chỗ đứng thật: board nhỏ vẫn chơi được, D-pad bị đè thì không.
 */
export function computeLayout(width: number, height: number): Layout {
  const w = Number.isFinite(width) && width > 0 ? width : MIN_BOARD
  const h = Number.isFinite(height) && height > 0 ? height : MIN_BOARD

  const hudHeight = clamp(h * 0.09, HUD_MIN, HUD_MAX)

  // §B3:139. `92vmin` = 0.92 × cạnh ngắn của viewport.
  const bySpec = clamp(Math.min(0.92 * Math.min(w, h), MAX_BOARD), MIN_BOARD, MAX_BOARD)

  // Chỗ đứng thật: trừ HUD, khối D-pad và đệm trên/dưới.
  const spaceCap = Math.max(0, h - DPAD_BLOCK - hudHeight - PADDING * 2)
  // Sàn hạ được, nhưng không bao giờ vượt quá chỗ đứng thật hay bề ngang.
  const floor = Math.min(MIN_BOARD, spaceCap, w)
  const boardSide = clamp(Math.min(bySpec, spaceCap, w), floor, MAX_BOARD)

  const gap = Math.round(boardSide * 0.03)
  const cell = (boardSide - 5 * gap) / 4
  const boardX = (w - boardSide) / 2

  // Cụm HUD + board căn giữa trong khoảng trống PHÍA TRÊN khối D-pad.
  const arenaH = h - DPAD_BLOCK - PADDING
  const stackH = hudHeight + boardSide
  const top = clamp((arenaH - stackH) / 2, PADDING, Math.max(PADDING, arenaH - stackH))

  const hudY = top
  const boardY = top + hudHeight

  return {
    width: w,
    height: h,
    boardSide,
    gap,
    cell,
    boardX,
    boardY,
    hudY,
    // Đáy màn hình khi lọt; nếu không thì ngay dưới board — bất biến luôn giữ.
    dpadY: Math.max(boardY + boardSide, h - DPAD_BLOCK),
  }
}
