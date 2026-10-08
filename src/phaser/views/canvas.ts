import type Phaser from 'phaser'
import { hexToInt, SHADOW_BASE_HEX } from '../../theme/palette'
import { CARD_RADIUS, SHADOW_DY } from './dialogs'

/**
 * Tiện ích vẽ dùng chung cho các view trong canvas.
 *
 * `FONT_STACK`, một hàm `hex` cục bộ và một `clamp` cục bộ đang bị chép ba lần ở
 * `scenes/Board.ts`, `views/hud.ts` và `views/dialogs.ts` — Task 12 đã ghi lại
 * khoản nợ đó. Tệp này KHÔNG thêm bản sao thứ tư: nó là chỗ ở đầu tiên cho phần
 * dùng chung, và ba bản cũ vẫn nguyên vì gộp chúng lại phải sửa tệp của ba task
 * khác. Việc di trú ba bản cũ là một task riêng.
 *
 * Ở đây chỉ có thứ mà view mới thật sự cần; không gom `clamp` vào vì tệp này
 * không dùng tới nó.
 */

/**
 * §B2: một font duy nhất, WOFF2 subset, nhúng trong bundle. Không CDN.
 * Trùng giá trị với bản cục bộ ở ba tệp kia — cố ý, để chữ trong panel Settings
 * không lệch khỏi chữ trong dialog.
 */
export const FONT_STACK = '"2048 Digits", system-ui, sans-serif'

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
