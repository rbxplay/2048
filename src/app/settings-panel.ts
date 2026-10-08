import type { SaveSettings } from '../game/persist'
import type { DialogPhase } from '../phaser/views/dialogs'
import { overlayCoversScreen, type OverlayPhase } from './overlay'

/**
 * Mở/đóng bảng Settings ở CẢ HAI tầng — ĐƯỜNG DUY NHẤT cho bánh răng canvas, nút
 * Cài đặt DOM, nút Đóng canvas, nút Đóng DOM và `Esc`.
 *
 * Vì sao tách khỏi `main.ts` (cùng lý do với `actions.ts`): ở đây có một CỔNG
 * CHẶN và một cặp việc phải luôn đi cùng nhau, mà `main.ts` không nhập được vào
 * test. Trước khi có tệp này `openSettings` để trần: bấm bánh răng xuyên qua
 * lớp phủ của dialog thua là bảng mở chồng lên dialog; Enter trên nút Cài đặt
 * DOM lúc pause là ô nhập DOM nhảy vào chỗ một bảng mà canvas không vẽ; Enter
 * lần nữa khi bảng đang mở là bảng nháy về alpha 0.
 */

/** Lớp canvas của bảng. Chỉ khai phần dùng tới, để không phải nhập Phaser. */
export type SettingsLayer = {
  open(current: SaveSettings, onClose: () => void): void
  close(): void
  readonly phase: DialogPhase
}

/** Lớp DOM của bảng. */
export type SettingsBridgeLayer = {
  setSettingsOpen(open: boolean): void
}

/**
 * Bảng Settings có được mở lúc này không. HÀM THUẦN.
 *
 *  - pause: vòng lặp đã ngủ, canvas không vẽ được bảng nào;
 *  - overlay còn chiếm màn hình (kể cả `'closing'`): bảng sẽ chồng lên dialog;
 *  - bảng không ở `'closed'`: đang mở thì mở nữa là nháy, đang mờ dần thì đã hết
 *    hiệu lực — cùng luật với `overlayAcceptsAction`.
 */
export function settingsMayOpen(s: {
  paused: boolean
  overlay: OverlayPhase
  settings: DialogPhase
}): boolean {
  if (s.paused) return false
  if (overlayCoversScreen(s.overlay)) return false
  return s.settings === 'closed'
}

export type SettingsPresenter = {
  open(): void
  close(): void
}

export function createSettingsPresenter(deps: {
  settings: SettingsLayer
  bridge: SettingsBridgeLayer
  isPaused: () => boolean
  overlayPhase: () => OverlayPhase
  getSettings: () => SaveSettings
  /** Chạy khi cổng đã cho qua, TRƯỚC khi bảng mở (mở khoá âm thanh). */
  onOpen: () => void
  /** Đặt lại nút DOM lên nút canvas — xem `app/placement.ts`. */
  place: () => void
}): SettingsPresenter {
  /**
   * Bảng vừa bắt đầu đóng — do `close()` bên dưới hoặc do nút Đóng của canvas
   * (view tự đóng rồi gọi lại hàm này). Chạy NGAY lúc vào `'closing'`, không đợi
   * hết 800 ms mờ dần: trong cửa sổ đó bảng đã hết hiệu lực, nên focus không
   * được nằm lại trên một ô nhập của nó.
   */
  function closed(): void {
    deps.bridge.setSettingsOpen(false)
    deps.place()
  }

  function open(): void {
    const gate = {
      paused: deps.isPaused(),
      overlay: deps.overlayPhase(),
      settings: deps.settings.phase,
    }
    if (!settingsMayOpen(gate)) return
    deps.onOpen()
    // Canvas trước, DOM sau — cùng thứ tự với `OverlayPresenter`.
    deps.settings.open(deps.getSettings(), closed)
    deps.bridge.setSettingsOpen(true)
    deps.place()
  }

  function close(): void {
    // Chỉ bảng ĐANG MỞ mới đóng được — cùng cổng với `views/settings.ts`.
    if (deps.settings.phase !== 'open') return
    deps.settings.close()
    closed()
  }

  return { open, close }
}
