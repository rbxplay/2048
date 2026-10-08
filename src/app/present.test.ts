import { describe, expect, it } from 'vitest'
import type { Board } from '../game/board'
import { makeIdFactory } from '../game/board'
import { mulberry32 } from '../game/rng'
import type { MoveContext } from '../game/rules'
import { applyInput, createSession, type SessionState, type Step } from './session'
import { present, type PresentSinks } from './present'

function ctx(): MoveContext {
  return { rng: mulberry32(7), nextId: makeIdFactory() }
}

/** Phiên mới + một nước đi CHẮC CHẮN đổi board, để `step.move !== null`. */
function sessionWithMove(): { state: SessionState; step: Step; ctx: MoveContext } {
  const c = ctx()
  const state = createSession({ ctx: c })
  for (const dir of ['left', 'up', 'right', 'down'] as const) {
    const step = applyInput(state, dir, c)
    if (step.move !== null && step.move.moved) return { state: step.state, step, ctx: c }
  }
  throw new Error('không dựng được nước đi — fixture hỏng, không phải code hỏng')
}

/**
 * Sink giả ghi lại CHÍNH THAM CHIẾU nhận được, không phải bản sao.
 *
 * Bản sao là thứ che mất lỗi: hai bản sao cùng nội dung vẫn "khớp" trong khi
 * nguồn đã tách làm hai.
 */
function fakeSinks() {
  const seen: {
    boardToDom: Board | null
    boardToCanvas: Board | null
    played: unknown
    score: number | null
    delta: number | null
    best: number | null
    announced: { score: number; locale: string } | null
  } = {
    boardToDom: null,
    boardToCanvas: null,
    played: null,
    score: null,
    delta: null,
    best: null,
    announced: null,
  }
  const sinks: PresentSinks = {
    setScore: (score, delta) => {
      seen.score = score
      seen.delta = delta
    },
    setBest: (best) => {
      seen.best = best
    },
    syncBoard: (board) => {
      seen.boardToDom = board
    },
    announceScore: (score, locale) => {
      seen.announced = { score, locale }
    },
    playOutcome: (move) => {
      seen.played = move
      seen.boardToCanvas = move.board
    },
    renderBoard: (board) => {
      seen.played = null
      seen.boardToCanvas = board
    },
  }
  return { seen, sinks }
}

describe('session — nguồn board là MỘT (nền của bất biến canvas ↔ DOM)', () => {
  it('step.move.board và step.state.board là CÙNG một tham chiếu', () => {
    const { step } = sessionWithMove()
    expect(step.move).not.toBeNull()
    // Nếu `session.ts` đổi để hai vế này thành hai board khác nhau thì bất biến
    // "DOM là bản chiếu của canvas" sụp, mà không test nào khác bắt được.
    expect(step.move!.board).toBe(step.state.board)
  })

  it('mọi nước đi được nhận đều giữ bất biến đó', () => {
    const c = ctx()
    let state = createSession({ ctx: c })
    let checked = 0
    for (let i = 0; i < 40; i++) {
      const dir = (['left', 'up', 'right', 'down'] as const)[i % 4]!
      const step = applyInput(state, dir, c)
      state = step.state
      if (step.move !== null) {
        expect(step.move.board).toBe(step.state.board)
        checked++
      }
    }
    expect(checked, 'không kiểm được nước nào thì test vô nghĩa').toBeGreaterThan(10)
  })
})

describe('R42 — present chiếu state ra hai tầng từ MỘT nguồn', () => {
  it('DOM và canvas nhận CÙNG một board khi có nước đi', () => {
    const { state, step } = sessionWithMove()
    const { seen, sinks } = fakeSinks()

    present(sinks, state, step, 'vi')

    expect(seen.boardToDom, 'DOM phải được chiếu').not.toBeNull()
    expect(
      seen.boardToDom,
      'hai tầng đọc hai board khác nhau là đúng lỗi Review Focus mục 1',
    ).toBe(seen.boardToCanvas)
    expect(seen.played, 'nhánh có move phải đi qua playOutcome').toBe(step.move)
  })

  it('DOM và canvas nhận CÙNG một board khi không có nước đi', () => {
    const c = ctx()
    const state = createSession({ ctx: c })
    const { seen, sinks } = fakeSinks()

    present(sinks, state, null, 'vi')

    expect(seen.boardToDom).toBe(state.board)
    expect(seen.boardToCanvas, 'không có move thì canvas vẽ thẳng state.board').toBe(state.board)
    expect(seen.played, 'không có move thì KHÔNG được gọi playOutcome').toBeNull()
  })

  it('board chiếu ra canvas vẫn là board của state, không phải bản chụp cũ', () => {
    const { state, step } = sessionWithMove()
    const { seen, sinks } = fakeSinks()
    present(sinks, state, step, 'vi')
    // Cùng nội dung lẫn cùng tham chiếu: board cũ còn sót lại là lỗi lệch một
    // nước đi, thứ mà so sánh nội dung sẽ bỏ qua nếu hai board tình cờ giống nhau.
    expect(seen.boardToCanvas).toBe(state.board)
  })

  it('delta điểm chỉ được truyền khi có nước đi', () => {
    const { state, step } = sessionWithMove()
    const withMove = fakeSinks()
    present(withMove.sinks, state, step, 'vi')
    expect(withMove.seen.delta).toBe(step.move!.scoreDelta)

    const noMove = fakeSinks()
    present(noMove.sinks, state, null, 'vi')
    expect(noMove.seen.delta, 'không có move thì không có badge +N').toBeNull()
  })

  it('điểm, kỷ lục và công bố đều đọc từ state', () => {
    const { state, step } = sessionWithMove()
    const { seen, sinks } = fakeSinks()
    present(sinks, state, step, 'vi')
    expect(seen.score).toBe(state.score)
    expect(seen.best).toBe(state.best)
    expect(seen.announced).toEqual({ score: state.score, locale: 'vi' })
  })

  it('state CŨ truyền vào cũng không chiếu được: có Step thì đọc từ Step', () => {
    // Đúng lỗi của Review Focus mục 1: `main.ts` quên `state = step.state` rồi
    // chiếu. Đưa hẳn một state cũ vào — DOM vẫn phải mô tả board MỚI.
    //
    // State cũ phải KHÁC thấy được (điểm, kỷ lục), không chỉ khác tham chiếu:
    // hai state cùng 0 điểm thì `toBe(step.state.score)` vẫn xanh kể cả khi code
    // đọc nhầm từ tham số — test sẽ rỗng đúng ở nhánh cần bịt nhất.
    const c = ctx()
    const stale: SessionState = { ...createSession({ ctx: c }), score: 4242, best: 9999 }
    const { step } = sessionWithMove()

    const { seen, sinks } = fakeSinks()
    present(sinks, stale, step, 'vi')

    expect(seen.boardToDom, 'board cũ lọt ra DOM là lệch một nước đi').toBe(step.move!.board)
    expect(seen.boardToDom).not.toBe(stale.board)
    expect(seen.score, 'điểm phải đọc từ Step, không từ tham số').toBe(step.state.score)
    expect(seen.best).toBe(step.state.best)
    expect(seen.announced).toEqual({ score: step.state.score, locale: 'vi' })
  })

  it('Step KHÔNG có nước đi thì board vẫn lấy từ Step, không lấy từ tham số', () => {
    // Nhánh này quan trọng riêng: khi `move === null`, board chỉ còn MỘT chỗ để
    // lấy, nên đọc nhầm tham số sẽ lộ ra đây chứ không lộ ở nhánh có move (nhánh
    // kia vẫn vớ được `move.board` dù đã đọc nhầm state).
    const c = ctx()
    const stale = createSession({ ctx: c })
    const { step } = sessionWithMove()
    const ignored: Step = {
      state: step.state,
      move: null,
      overlay: null,
      milestones: [],
      accepted: false,
    }

    const { seen, sinks } = fakeSinks()
    present(sinks, stale, ignored, 'vi')

    expect(seen.boardToDom, 'board phải là của Step, không phải của state cũ').toBe(step.state.board)
    expect(seen.boardToDom).not.toBe(stale.board)
    expect(seen.played).toBeNull()
  })

  it('kể cả khi Step tự mâu thuẫn, hai tầng vẫn nhận ĐÚNG MỘT board', () => {
    // `session.ts` giữ `move.board === state.board`, nên ca này không xảy ra
    // trong thực tế. Dựng nó để chứng minh tầng chiếu không có HAI chỗ đọc
    // board: cách viết `syncBoard(state.board)` + `playOutcome(move)` sẽ đỏ ở
    // đây, còn cách đọc một lần rồi chia sẻ thì xanh.
    const { step } = sessionWithMove()
    const inconsistent: Step = {
      ...step,
      state: { ...step.state, board: [[null, null, null, null]] as Board },
    }
    const { seen, sinks } = fakeSinks()

    present(sinks, inconsistent.state, inconsistent, 'vi')

    expect(seen.boardToDom).not.toBeNull()
    expect(seen.boardToDom, 'canvas và DOM đọc hai board khác nhau').toBe(seen.boardToCanvas)
  })

  it('nước đi bị bỏ qua (move === null) vẫn chiếu board của state', () => {
    const c = ctx()
    const state = createSession({ ctx: c })
    // Ép overlay đang mở: `applyInput` trả `move: null` khi status khác 'playing'.
    const over = { ...state, status: 'over' as const }
    const step = applyInput(over, 'left', c)
    expect(step.move, 'fixture: phải là nhánh bị bỏ qua').toBeNull()

    const { seen, sinks } = fakeSinks()
    present(sinks, step.state, step, 'vi')
    expect(seen.boardToDom).toBe(step.state.board)
    expect(seen.boardToCanvas).toBe(step.state.board)
    expect(seen.played).toBeNull()
  })
})
