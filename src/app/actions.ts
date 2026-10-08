import type { DialogAction } from '../phaser/views/dialogs'
import { shouldRequestInterstitialFor, type AdPolicyState } from './ads'
import { overlayAcceptsAction, type OverlayPhase } from './overlay'
import type { SessionState, Step } from './session'

/**
 * Bộ nhận action của overlay — ĐƯỜNG DUY NHẤT cho nút canvas, nút DOM và `Esc`.
 *
 * Vì sao tách khỏi `main.ts`: đây chính là chỗ chặn cú bấm thứ hai lọt vào trong
 * cửa sổ 800 ms của hiệu ứng mờ đóng overlay, và một chốt chặn như vậy phải có
 * test — mà `main.ts` không nhập được vào test (nó `void boot()` ngay khi nạp).
 *
 * Cửa sổ đó là thật, không phải giả định: Phaser chỉ bỏ hit-test khi alpha ĐÚNG
 * BẰNG 0, còn `InputPlugin.processUpEvents` phát `pointerup` cho MỌI hình đang
 * nằm dưới con trỏ lúc nhả — nó không đòi hỏi trước đó phải có `pointerdown`.
 * Nên một cú bấm thứ hai vào nút "Chơi lại" vẫn tới được đây sau khi cú thứ nhất
 * đã đóng overlay, và nếu không có cổng chặn thì nó chạy lại đúng action đó: hai
 * lời gọi quảng cáo cho MỘT lần thua, `newGame` chạy hai lần.
 */
export type ActionReceiverDeps = {
  isPaused: () => boolean
  /** Trạng thái overlay HIỆN TẠI — đầu vào của cổng chặn, xem `overlayAcceptsAction`. */
  overlayPhase: () => OverlayPhase
  closeOverlay: () => void
  getState: () => SessionState
  setState: (next: SessionState) => void
  keepPlaying: (state: SessionState) => Step
  newGame: (state: SessionState) => Step
  syncAll: (step: Step | null) => void
  saveIfNeeded: (milestones: readonly string[]) => void
  showOverlay: (overlay: 'win' | 'over') => void
  /** Một lần GAME OVER MỚI: âm thanh + đếm cho chính sách quảng cáo. */
  noteLoss: () => void
  ads: {
    state: () => AdPolicyState
    /** `performance.now()` — bơm từ ngoài để test không cần đồng hồ giả. */
    now: () => number
    request: () => void
  }
}

export type ActionReceiver = {
  applyAction: (action: DialogAction) => void
}

export function createActionReceiver(deps: ActionReceiverDeps): ActionReceiver {
  /** `gameOvers` của lần thua đã xin quảng cáo gần nhất; `null` = chưa xin lần nào. */
  let advertisedLoss: number | null = null

  /**
   * Cổng chặn + đóng overlay, rồi mới thi hành.
   *
   * Cả hai điều kiện đầu đều là điều kiện ĐẦU VÀO, không phải hệ quả phụ của một
   * thuộc tính hiển thị nào: pause thì vòng lặp đã ngủ, còn overlay không mở thật
   * thì sự kiện này là thừa.
   */
  function applyAction(action: DialogAction): void {
    // Pause chặn cả đường này: nút trong dialog DOM vẫn bấm được bằng bàn phím
    // kể cả khi vòng lặp game đã ngủ.
    if (deps.isPaused()) return
    // CỔNG CHẶN. Trong lúc mờ dần (`'closing'`) cú bấm đã hết hiệu lực, và khi
    // không có overlay nào (`'closed'`) thì nó không thuộc về ai cả.
    if (!overlayAcceptsAction(deps.overlayPhase())) return
    // Đóng ở CẢ HAI tầng trước khi làm gì khác — mở lại sau đó là đường duy nhất
    // không để lại overlay mồ côi.
    deps.closeOverlay()
    run(action)
  }

  /**
   * Thi hành action. Tách khỏi `applyAction` để cổng chặn chỉ được đánh giá MỘT
   * lần cho mỗi cú bấm: nhánh `'close'` dịch sang action khác SAU khi overlay đã
   * đóng, nên đi vòng qua cổng ở đây là bắt buộc chứ không phải sơ hở.
   */
  function run(action: DialogAction): void {
    if (action === 'close') {
      // Nút đóng chỉ có nghĩa "thoát khỏi card này". Ván đã thắng thì đóng card
      // = chơi tiếp; ván đã hết thì đóng card = ván mới, vì `status` vẫn là
      // 'over' và board thì đã kẹt — đóng trần sẽ để người chơi nhìn một bàn cờ
      // không đi được nước nào.
      if (deps.getState().status === 'won') return run('keep-playing')
      if (deps.getState().status === 'over') return run('retry')
      return
    }

    if (action === 'keep-playing') {
      const step = deps.keepPlaying(deps.getState())
      deps.setState(step.state)
      deps.syncAll(null)
      deps.saveIfNeeded(step.milestones)
      // Bàn cờ hết nước ngay lúc vừa "chơi tiếp" là ca biên có thật: lúc đó mới
      // tính là một lần thua.
      if (step.overlay === 'over') {
        deps.noteLoss()
        deps.showOverlay('over')
      }
      return
    }

    // 'retry' và 'new-game' đều là ván mới; kỷ lục và settings giữ nguyên (FR-09).
    const step = deps.newGame(deps.getState())
    deps.setState(step.state)
    deps.syncAll(null)
    deps.saveIfNeeded(step.milestones)

    // Interstitial chỉ thuộc về 'retry' (US-05 AC3). Và chỉ MỘT lần cho mỗi lần
    // thua: `advertisedLoss` là chốt, nên một sự kiện trùng — từ cửa sổ mờ dần,
    // từ một refactor sau này, hay từ bất cứ đâu — cũng không xin được cái thứ hai.
    if (action !== 'retry') return
    const adState = deps.ads.state()
    if (!shouldRequestInterstitialFor(adState, advertisedLoss, deps.ads.now())) return
    // Ghi nhớ TRƯỚC khi gọi: cổng đã cho qua nghĩa là lần thua này đã được phục
    // vụ, bất kể SDK trả về gì.
    advertisedLoss = adState.gameOvers
    deps.ads.request()
  }

  return { applyAction }
}
