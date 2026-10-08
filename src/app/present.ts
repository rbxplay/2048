import type { Board } from '../game/board'
import type { MoveOutcome } from '../game/rules'
import type { Locale } from '../i18n'
import type { SessionState, Step } from './session'

/**
 * Chiếu state ra hai tầng (canvas và DOM) từ MỘT nguồn.
 *
 * Review Focus mục 1 của cả dự án: nếu một nhánh chỉ cập nhật một bên thì mắt
 * người chơi và cây accessibility nói hai chuyện khác nhau — mà canvas không có
 * cây accessibility, nên screen reader là bên duy nhất đọc sai.
 *
 * Bất biến được GHIM ở đây chứ không ở `main.ts`: tầng này lấy board ra MỘT lần
 * rồi đưa đúng tham chiếu đó cho cả hai sink. Không có tham số nào để truyền
 * hai board khác nhau vào, nên "lệch canvas ↔ DOM" trở thành không biểu diễn
 * được, không chỉ khó xảy ra. `session.ts` bảo đảm thêm ở nguồn:
 * `step.move.board === step.state.board` (nó đặt `board: move.board`).
 *
 * Tách khỏi `main.ts` vì composition root không test được (nó boot ngay khi
 * import), còn đây là hàm thuần.
 */
export type PresentSinks = {
  setScore(score: number, delta: number | null): void
  setBest(best: number): void
  syncBoard(board: Board): void
  announceScore(score: number, locale: Locale): void
  playOutcome(move: MoveOutcome): void
  renderBoard(board: Board): void
}

export function present(
  sinks: PresentSinks,
  state: SessionState,
  step: Step | null,
  locale: Locale,
): void {
  /**
   * Khi có `Step`, state được đọc từ CHÍNH `step` chứ không từ tham số.
   *
   * Đây là chỗ bịt lỗi thật của Review Focus mục 1: `main.ts` phải nhớ
   * `state = step.state` TRƯỚC khi chiếu, và quên một lần là DOM mô tả board cũ
   * trong khi canvas đã vẽ board mới. Đọc từ `step` thì việc quên đó không còn
   * biểu diễn được — không có tham số nào để truyền state cũ vào.
   */
  const src = step === null ? state : step.state
  const move = step?.move ?? null

  sinks.setScore(src.score, move?.scoreDelta ?? null)
  sinks.setBest(src.best)

  // MỘT nguồn board cho cả hai tầng, lấy MỘT lần rồi đưa đúng tham chiếu đó cho
  // cả hai sink — không có nhánh nào đọc board từ chỗ thứ hai.
  const board = move === null ? src.board : move.board
  sinks.syncBoard(board)
  sinks.announceScore(src.score, locale)

  if (move === null) sinks.renderBoard(board)
  else sinks.playOutcome(move)
}
