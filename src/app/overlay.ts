import type { OpenDialogOptions } from '../a11y/bridge'
import type { Strings } from '../i18n'
import {
  buttonActions,
  buttonLabels,
  type DialogAction,
  type DialogKind,
  type DialogPhase,
} from '../phaser/views/dialogs'
import type { Overlay, Status } from './session'

/**
 * Lớp canvas của overlay. Khai đúng hình dạng tối thiểu mà tầng này dùng, để
 * `Dialogs` thật của `views/dialogs.ts` khớp vào mà không phải nhập Phaser.
 */
export type DialogLayer = {
  open(kind: DialogKind, info: { score: number; best: number }): void
  close(): void
  readonly isOpen: boolean
  readonly phase: DialogPhase
}

/** Lớp DOM cho screen reader. Cùng lý do: chỉ khai phần dùng tới. */
export type BridgeLayer = {
  openDialog(opts: OpenDialogOptions): void
  closeDialog(): void
  announceOutcome(kind: DialogKind, strings: Strings): void
}

/**
 * Vòng đời overlay ở tầng ghép nối — đúng ba trạng thái của lớp canvas.
 *
 * Không có cờ riêng ở đây: `OverlayPresenter` suy từ `deps.dialogs.phase`. Hai
 * nguồn sự thật cho cùng một câu hỏi ("overlay đang thế nào?") là đúng cách để
 * chúng lệch nhau, mà lệch ở đây nghĩa là cổng chặn input mở sai lúc.
 */
export type OverlayPhase = DialogPhase

/**
 * Overlay còn CHIẾM MÀN HÌNH: đang mở hoặc đang mờ dần. HÀM THUẦN.
 *
 * Dùng cho input của BÀN CỜ. Cả hai trạng thái đó đều đang phơi một tấm card ra
 * trước mắt người chơi, nên một cú vuốt không được làm board nhúc nhích phía sau
 * nó — kể cả trong 800 ms cuối khi card đang mờ đi.
 */
export function overlayCoversScreen(phase: OverlayPhase): boolean {
  return phase !== 'closed'
}

/**
 * Action của dialog có được thi hành không. HÀM THUẦN.
 *
 * CHỈ khi overlay đang MỞ THẬT. Đây là chốt của lỗi "bấm hai lần trong lúc mờ
 * dần": cú bấm thứ nhất đóng overlay (⇒ `'closing'`), cú bấm thứ hai vẫn tới được
 * tầng nhận vì Phaser chỉ bỏ hit-test khi alpha đúng bằng 0 — nhưng nó rơi vào
 * `'closing'` và bị bỏ qua, thay vì chạy lại đúng action đó. Điều kiện ở đây là
 * TƯỜNG MINH theo trạng thái, không phải hệ quả phụ của `alpha > 0`.
 */
export function overlayAcceptsAction(phase: OverlayPhase): boolean {
  return phase === 'open'
}

export type OverlayPresenter = {
  open(overlay: 'win' | 'over'): void
  close(): void
  readonly isOpen: boolean
  readonly phase: OverlayPhase
}

/**
 * Overlay phải có theo `status` của state. HÀM THUẦN.
 *
 * Đây là đường DUY NHẤT để biết có overlay hay không: `Step.overlay` chỉ nói về
 * nước đi vừa rồi, còn lúc khôi phục save hay lúc `onResume` thì không có `Step`
 * nào cả. Suy từ `status` nên cả ba đường (nước đi, khôi phục save, resume) đọc
 * ra cùng một kết quả.
 */
export function overlayForStatus(status: Status): Overlay {
  if (status === 'won') return 'win'
  if (status === 'over') return 'over'
  return null
}

/** Overlay của state → loại dialog của canvas. HÀM THUẦN. */
export function dialogKindFor(overlay: 'win' | 'over'): DialogKind {
  return overlay === 'win' ? 'win' : 'gameover'
}

/** Tiêu đề dialog — cùng hai khoá mà canvas dùng. HÀM THUẦN. */
export function dialogHeading(kind: DialogKind, strings: Strings): string {
  return kind === 'win' ? strings.winTitle : strings.gameOverTitle
}

/**
 * Mở/đóng overlay ở **cả hai tầng** bằng một lời gọi.
 *
 * Review Focus mục 1: bản DOM và bản canvas không bao giờ được lệch. Cách duy
 * nhất để giữ được điều đó qua MỌI đường (nước đi, `Esc`, `onPause`, sự kiện
 * nền tảng) là để hai bên chỉ có một cửa vào duy nhất — chính là module này.
 * Gọi `dialogs.close()` ở một nơi và `bridge.closeDialog()` ở nơi khác là đúng
 * cách để chúng lệch nhau.
 *
 * Nhãn nút lấy từ `buttonLabels` của `views/dialogs.ts` (R25) chứ không chép
 * tay: canvas vẽ gì thì screen reader đọc đúng cái đó.
 */
export function createOverlayPresenter(deps: {
  dialogs: DialogLayer
  bridge: BridgeLayer
  getStrings: () => Strings
  getInfo: () => { score: number; best: number }
  onAction: (action: DialogAction) => void
}): OverlayPresenter {
  function open(overlay: 'win' | 'over'): void {
    const kind = dialogKindFor(overlay)
    const strings = deps.getStrings()
    // Canvas trước, DOM sau — cùng một `kind`, nên hai bên không thể lệch.
    deps.dialogs.open(kind, deps.getInfo())
    deps.bridge.announceOutcome(kind, strings)
    deps.bridge.openDialog({
      heading: dialogHeading(kind, strings),
      labels: buttonLabels(kind, strings),
      onActivate: (index) => {
        const action = buttonActions(kind)[index]
        // Chỉ số ngoài bảng là chuyện không xảy ra (nút do chính tầng này tạo
        // từ bảng đó), nhưng rơi vào `close` vẫn an toàn hơn là im lặng.
        deps.onAction(action ?? 'close')
      },
    })
  }

  function close(): void {
    deps.dialogs.close()
    // Idempotent ở tầng cầu nối, nên gọi lúc không có dialog là no-op thật.
    deps.bridge.closeDialog()
  }

  return {
    open,
    close,
    get isOpen(): boolean {
      // Suy từ lớp canvas, không giữ cờ riêng — xem `OverlayPhase`.
      return overlayAcceptsAction(deps.dialogs.phase)
    },
    get phase(): OverlayPhase {
      return deps.dialogs.phase
    },
  }
}
