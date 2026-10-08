import type { A11yPlacement, A11yRect } from '../a11y/bridge'
import type { Dir } from '../game/rules'
import type { Box } from '../phaser/views/canvas'
import type { DialogPhase } from '../phaser/views/dialogs'
import type { SettingsRects } from '../phaser/views/settings'

/**
 * Chỗ đặt các điều khiển DOM thật LÊN TRÊN nút tương ứng của canvas.
 *
 * Spec §12, Amend 2026-10-08 (4): tầng a11y không còn "lộ ra khi có focus" thành
 * một dải nằm dưới game (dải đó đẩy trang tràn và sinh thanh cuộn). Thay vào đó
 * mỗi nút DOM trong suốt nằm đúng trên nút canvas của nó, nên focus ring hiện
 * quanh chính thứ người chơi đang nhìn.
 *
 * Hình học có MỘT nguồn: các view của canvas (`buttonRects`, `gearRect`,
 * `controlRects`). Tệp này chỉ làm hai việc mà view không biết — đổi toạ độ game
 * sang toạ độ trang, và quyết định điều khiển nào đứng ở đâu theo trạng thái —
 * và là hàm thuần để cả hai việc đó có test (`main.ts` không nhập được vào test).
 */

/** Hộp của canvas trên TRANG (CSS px) và kích thước game mà nó đang vẽ. */
export type CanvasFrame = {
  left: number
  top: number
  width: number
  height: number
  gameWidth: number
  gameHeight: number
}

export type Viewport = { width: number; height: number }

export type PlacementSources = {
  frame: CanvasFrame
  viewport: Viewport
  dpad: Record<Dir, Box>
  gear: Box
  dialog: { phase: DialogPhase; buttons: readonly Box[] }
  settings: { phase: DialogPhase; controls: SettingsRects }
}

/**
 * Bề dày focus ring tính từ mép điều khiển: `outline: 3px` + `outline-offset:
 * 2px` của `a11y/bridge.css` (DesignSystem §B8). Hai chỗ phải cùng một con số.
 */
export const RING_REACH = 5

/**
 * Toạ độ game → toạ độ trang. HÀM THUẦN.
 *
 * `Scale.RESIZE` cho canvas khớp 1:1 với viewport nên thường đây là phép đồng
 * nhất, nhưng không được DỰA vào điều đó: canvas lệch gốc hoặc bị co giãn (thanh
 * cuộn chiếm chỗ, host đổi kích thước iframe giữa hai khung hình) thì nút DOM
 * phải đi theo cái canvas đang thật sự nằm ở đâu.
 */
export function toPage(box: Box, frame: CanvasFrame): A11yRect {
  const sx = frame.gameWidth > 0 ? frame.width / frame.gameWidth : 1
  const sy = frame.gameHeight > 0 ? frame.height / frame.gameHeight : 1
  return {
    x: frame.left + box.x * sx,
    y: frame.top + box.y * sy,
    w: box.w * sx,
    h: box.h * sy,
  }
}

/**
 * Thu hộp lại vừa đủ để focus ring nằm TRỌN trong viewport. HÀM THUẦN.
 *
 * Hai yêu cầu đụng nhau ở mép màn hình: nút DOM phải trùng nút canvas, mà ring
 * lại vươn ra ngoài nút 5 px. Nút "xuống" của D-pad dán sát đáy viewport ở mọi
 * bố cục xếp dọc, nên ring của nó mất hẳn cạnh dưới nếu giữ nguyên hộp. Chọn
 * cách ít tệ nhất: lùi ĐÚNG cạnh chạm mép vào tối đa 5 px để ring còn đủ bốn
 * cạnh; ba cạnh kia không đổi. Vùng bấm thật của chuột/cảm ứng là ô bấm của
 * canvas (nút DOM không nhận pointer event), nên nó KHÔNG nhỏ đi theo.
 */
export function fitRing(rect: A11yRect, viewport: Viewport): A11yRect {
  const left = Math.max(rect.x, RING_REACH)
  const top = Math.max(rect.y, RING_REACH)
  const right = Math.min(rect.x + rect.w, viewport.width - RING_REACH)
  const bottom = Math.min(rect.y + rect.h, viewport.height - RING_REACH)
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
}

/**
 * Điều khiển nào đứng ở đâu, theo trạng thái hiện tại. HÀM THUẦN.
 *
 *  - D-pad và bánh răng: luôn ở chỗ canvas vẽ chúng.
 *  - Nút dialog: chỉ khi dialog đang MỞ THẬT. `'closing'` thì dialog DOM đã bị
 *    gỡ rồi, không còn nút nào để đặt.
 *  - Bốn ô nhập cài đặt và nút Đóng: lên đúng slider / toggle / nút theme / nút
 *    Đóng khi bảng Settings đang mở. Bảng đóng thì canvas KHÔNG vẽ chúng ở đâu
 *    cả. Bốn ô nhập vẫn phải nằm trong cây accessibility (§12.1) nhưng đã rời
 *    thứ tự Tab (`bridge.setSettingsOpen`); chúng đứng trên bánh răng — thứ duy
 *    nhất trên màn hình đại diện cho "cài đặt" — để trình đọc màn hình nào vẽ
 *    khung theo hộp phần tử thì khung đó không rơi vào góc màn hình.
 */
export function placementFor(src: PlacementSources): A11yPlacement {
  const at = (box: Box): A11yRect => fitRing(toPage(box, src.frame), src.viewport)
  const gear = at(src.gear)
  const open = src.settings.phase === 'open'
  const c = src.settings.controls
  return {
    dpad: {
      up: at(src.dpad.up),
      down: at(src.dpad.down),
      left: at(src.dpad.left),
      right: at(src.dpad.right),
    },
    settingsButton: gear,
    sfx: open ? at(c.sfx) : gear,
    haptics: open ? at(c.haptics) : gear,
    reducedMotion: open ? at(c.reducedMotion) : gear,
    theme: open ? at(c.theme) : gear,
    // Nút Đóng của DOM bị `hidden` khi bảng đóng, nên hộp lúc đó không ai thấy.
    settingsClose: open ? at(c.close) : gear,
    dialogButtons: src.dialog.phase === 'open' ? src.dialog.buttons.map(at) : [],
  }
}
