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
const DPAD_BLOCK = 160

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Tính toàn bộ bố cục từ kích thước viewport thật. HÀM THUẦN — không đọc
 * `this.scale`, không chạm Phaser, nên test được không cần engine.
 *
 * Công thức lấy từ §B3. Vì `Scale.RESIZE` cho canvas khớp 1:1 với viewport,
 * `width`/`height` ở đây chính là kích thước vật lý của canvas.
 */
export function computeLayout(width: number, height: number): Layout {
  const w = Number.isFinite(width) && width > 0 ? width : MIN_BOARD
  const h = Number.isFinite(height) && height > 0 ? height : MIN_BOARD

  const hudHeight = clamp(h * 0.09, HUD_MIN, HUD_MAX)
  const padding = 16

  // Board phải vừa cả bề ngang lẫn phần chiều cao còn lại sau HUD và D-pad.
  const byWidth = Math.min(w * 0.92, w - padding * 2)
  const byHeight = Math.max(MIN_BOARD, h - hudHeight - DPAD_BLOCK - padding * 3)
  const boardSide = clamp(Math.min(byWidth, byHeight, MAX_BOARD), MIN_BOARD, MAX_BOARD)

  const gap = Math.round(boardSide * 0.03)
  const cell = (boardSide - 5 * gap) / 4

  const boardX = (w - boardSide) / 2
  // Đặt board hơi cao hơn giữa một chút để chừa chỗ cho D-pad ở nửa dưới.
  const stackHeight = hudHeight + boardSide
  const boardY = clamp((h - stackHeight) / 2 + hudHeight, padding, Math.max(padding, h - boardSide - padding))

  return {
    width: w,
    height: h,
    boardSide,
    gap,
    cell,
    boardX,
    boardY,
    hudY: boardY - hudHeight,
    dpadY: Math.min(h - DPAD_BLOCK, boardY + boardSide + padding),
  }
}
