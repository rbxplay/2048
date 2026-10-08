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
 * Công thức lấy nguyên §B3:139 `clamp(280px, min(92vmin, 560px), 560px)` và
 * §B3:144 `clamp(48px, 9vmin, 72px)` — `vmin` là cạnh NGẮN của viewport. Vì
 * `Scale.RESIZE` cho canvas khớp 1:1 với viewport, `width`/`height` ở đây chính
 * là kích thước vật lý của canvas.
 *
 * Hai bất biến phải đúng với MỌI đầu vào hữu hạn:
 *
 *   dpadY >= boardY + boardSide        (D-pad không bao giờ đè lên board)
 *   boardY >= hudY + hudHeight         (HUD không bao giờ đè lên board)
 *
 * Cận TRÊN của `boardSide` co lại được theo chỗ đứng thật, nhưng sàn 280 px thì
 * không: sàn giữ cỡ ô và cỡ chữ đọc được. Ở viewport quá thấp để chứa cả sàn
 * lẫn D-pad, sàn thắng và D-pad tràn khỏi đáy — đó là hành vi đúng, không phải
 * nợ kỹ thuật (§B3:154 xử viewport chật bằng "compact HUD, D-pad only", chứ
 * không bằng cách thu nhỏ bàn cờ). Đè lên board thì tuyệt đối không.
 */
export function computeLayout(width: number, height: number): Layout {
  const w = Number.isFinite(width) && width > 0 ? width : MIN_BOARD
  const h = Number.isFinite(height) && height > 0 ? height : MIN_BOARD

  // §B3:144 — 9vmin, tức 0.09 × cạnh NGẮN. Viewport thấp hiếm khi chạm trần.
  const hudHeight = clamp(0.09 * Math.min(w, h), HUD_MIN, HUD_MAX)

  // §B3:139 nguyên văn. `92vmin` = 0.92 × cạnh ngắn của viewport.
  const bySpec = clamp(Math.min(0.92 * Math.min(w, h), MAX_BOARD), MIN_BOARD, MAX_BOARD)

  // Chỗ đứng thật còn lại sau HUD, khối D-pad và đệm — chỉ dùng làm CẬN TRÊN.
  const spaceCap = h - hudHeight - DPAD_BLOCK - PADDING
  const boardSide = Math.max(MIN_BOARD, Math.min(bySpec, spaceCap))

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
