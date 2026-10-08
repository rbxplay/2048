import type Phaser from 'phaser'
import { hexToInt, SHADOW_BASE_HEX } from '../../theme/palette'

/**
 * Tiện ích vẽ dùng chung cho các view trong canvas.
 *
 * Đây là **module LÁ**: nó không nhập gì từ các view anh em. Hướng phụ thuộc luôn
 * là `views/*` → `canvas.ts`, không bao giờ ngược lại — nếu không thì chính nó
 * chặn việc di trú mà nó mở đường, và mọi view muốn dùng chung lại phải kéo theo
 * cả cây phụ thuộc của view khác.
 *
 * `FONT_STACK`, một hàm `hex` cục bộ và một `clamp` cục bộ từng bị chép ở
 * `scenes/Board.ts`, `views/hud.ts` và `views/dialogs.ts`. `FONT_STACK` đã gộp
 * về đây (Task 18 — xem chú thích ở định nghĩa); `hex`/`clamp` vẫn là nợ đã ghi
 * lại, chưa view nào dùng chúng qua đường này.
 *
 * Ở đây chỉ có thứ mà các view thật sự cần; không gom `clamp` vào vì chưa view
 * nào dùng tới nó qua đường này.
 */

/** §B11:285 `--radius-card:16px`. Bán kính bo góc card của mọi overlay (§B8). */
export const CARD_RADIUS = 16

/** §B11:291 `--shadow-float: 0 8px 28px rgba(0,0,0,.28)` — quãng đổ xuống. */
export const SHADOW_DY = 8

/**
 * §B2 / §11.2 — ĐỊNH NGHĨA DUY NHẤT mặt chữ cho cả canvas lẫn DOM.
 *
 * §11.2 yêu cầu một WOFF2 subset nhúng trong bundle, và cho phép phương án dự
 * phòng: "Nếu file font không lấy được, phương án dự phòng là `system-ui` stack
 * (0 byte) — nhưng numeral sẽ khác nhau giữa Android / iOS / Windows." Không có
 * tệp font nào trong repo, nên bản dựng này đi ĐÚNG đường dự phòng đó, và đi
 * tường minh: tên family không tồn tại (`"2048 Digits"`) đã bị xoá hẳn, vì một
 * cái tên không có `@font-face` nào đứng sau sẽ lặng lẽ rơi về font hệ thống mà
 * không ai đọc ra được là yêu cầu §B2 đang không được đáp ứng.
 *
 * Giá trị này phải TRÙNG `--font` trong `styles/tokens.css` và
 * `theme/palette.ts`: lệch một chữ là số của HUD khác mặt chữ với số của tile.
 * Ba bản sao cục bộ trước đây ở `scenes/Board.ts`, `views/hud.ts`,
 * `views/dialogs.ts` đã gộp về đây — chúng vốn là bốn chỗ phải sửa mỗi lần đổi
 * font, tức bốn cơ hội để lệch.
 */
export const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/**
 * Bắt buộc để nét chữ sắc ở DPI cao (§B2). Mọi `Text` hiện số hoặc chữ đều phải
 * đi qua đây.
 */
export function crisp(txt: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  return txt.setResolution(window.devicePixelRatio || 1)
}

/**
 * `0xRRGGBB` → `'#rrggbb'`.
 *
 * Đây là phép đảo của `hexToInt` ở `theme/palette.ts`, không phải bản thay thế:
 * `hexToInt` đi từ chuỗi token sang số, còn `TextStyle.color` của Phaser chỉ
 * nhận chuỗi CSS (`string | CanvasGradient | CanvasPattern`) nên chiều ngược lại
 * là bắt buộc, không thể lấy `hexToInt` mà thay.
 *
 * Giá trị hỏng (NaN, vô cực) quy về màu đen thay vì ném — đây là đường vẽ,
 * không phải đường kiểm tra dữ liệu.
 */
export function hexFromInt(color: number): string {
  const n = Number.isFinite(color) ? Math.trunc(color) : 0
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`
}

/** Hộp bao của một hình chữ nhật bo góc, toạ độ đã tính sẵn. */
export type Box = { x: number; y: number; w: number; h: number }

/**
 * `Graphics` không vẽ được bóng nhoè, nên `--shadow-float`
 * (`0 8px 28px rgba(0,0,0,.28)`, §B11:291) được XẤP XỈ bằng ba vòng cùng tâm,
 * nở dần và nhạt dần; tổng alpha ở lõi ≈ 0.28.
 *
 * `dialogs.ts` giữ một bảng vòng riêng y hệt nhưng KHÔNG xuất ra, và gộp hai
 * chỗ lại phải sửa tệp của Task 12. Bảng ở đây là bản dùng chung; khi có người
 * được phép sửa `dialogs.ts` thì nên để nó nhập từ đây.
 */
const SHADOW_RINGS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.12],
  [6, 0.09],
  [12, 0.07],
]

/** Vẽ bóng `--shadow-float` cho một card đã có hộp bao. Ghi đè `Graphics` cũ. */
export function drawFloatShadow(g: Phaser.GameObjects.Graphics, box: Box): void {
  g.clear()
  for (const [spread, alpha] of SHADOW_RINGS) {
    g.fillStyle(hexToInt(SHADOW_BASE_HEX), alpha)
    g.fillRoundedRect(
      box.x - spread,
      box.y - spread + SHADOW_DY,
      box.w + spread * 2,
      box.h + spread * 2,
      CARD_RADIUS + spread,
    )
  }
}
