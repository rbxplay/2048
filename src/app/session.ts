import { canMove, fromData, maxValue, toData, type Board } from '../game/board'
import {
  applyMove, createStartBoard,
  type Dir, type MoveContext, type MoveOutcome,
} from '../game/rules'
import {
  SCHEMA_VERSION, defaultSave,
  type SaveData, type SaveSettings, type SaveStats,
} from '../game/persist'

export type Status = 'playing' | 'won' | 'over'
export type Milestone = 'start' | 'threshold' | 'win' | 'over'
export type Overlay = 'win' | 'over' | null

export type SessionState = {
  board: Board
  score: number
  best: number
  moves: number
  /** Đã chạm 2048 trong ván này chưa. */
  won: boolean
  keepPlaying: boolean
  status: Status
  games: number
  bestTile: number
  totalScore: number
  settings: SaveSettings
  /** Mốc 1000 điểm đã vượt gần nhất, để không phát lại cùng một milestone. */
  thresholdMark: number
}

export type Step = {
  state: SessionState
  /** null khi input bị bỏ qua vì overlay đang mở. */
  move: MoveOutcome | null
  overlay: Overlay
  milestones: Milestone[]
  /** Input có được xử lý không. false thì đây là no-op hoặc bị bỏ qua. */
  accepted: boolean
}

/** Mỗi 1000 điểm là một milestone save (§A5). */
export const THRESHOLD_STEP = 1000

export function createSession(opts: {
  ctx: MoveContext
  stats?: SaveStats
  best?: number
  settings?: SaveSettings
  resume?: {
    board: number[][]
    score: number
    moves: number
    won: boolean
    keepPlaying: boolean
  } | null
}): SessionState {
  const base = defaultSave()
  const stats = opts.stats ?? base.stats
  const settings = opts.settings ?? base.settings

  const common = {
    best: opts.best ?? 0,
    games: stats.games,
    bestTile: stats.bestTile,
    totalScore: stats.totalScore,
    settings,
  }

  const resume = opts.resume
  if (resume != null) {
    try {
      // Dùng CHÍNH bộ đếm id của ván này: cấp id bằng một factory riêng sẽ
      // trùng id với tile sinh ra ở nước đi đầu tiên, mà id là danh tính node
      // của renderer (§6.1).
      const board = fromData(resume.board, opts.ctx.nextId)
      // Board rỗng không phải trạng thái hợp lệ giữa ván — coi như chưa có ván.
      if (board.flat().some((c) => c !== null)) {
        // Trạng thái chết phải suy lại từ board: `resume` không mang `status`,
        // board hết nước mà sống lại thành 'playing' thì nước đi nào cũng là
        // no-op nên overlay GAME OVER không bao giờ mở.
        // WIN xét TRƯỚC stuck: save ở trạng thái won && !keepPlaying chính là
        // ca "vừa tạo 2048 vừa hết nước" của Review Focus mục 5 đi qua đĩa, nên
        // overlay chỉ được là 'win'; over chỉ lộ ra sau khi người chơi keepPlaying.
        const stuck = !canMove(board)
        return {
          ...common,
          board,
          score: resume.score,
          moves: resume.moves,
          won: resume.won,
          keepPlaying: resume.keepPlaying,
          status: resume.won && !resume.keepPlaying ? 'won' : stuck ? 'over' : 'playing',
          thresholdMark: Math.floor(resume.score / THRESHOLD_STEP) * THRESHOLD_STEP,
        }
      }
    } catch {
      // board hỏng ⇒ rơi xuống ván mới
    }
  }

  return {
    ...common,
    board: createStartBoard(opts.ctx),
    score: 0,
    moves: 0,
    won: false,
    keepPlaying: false,
    status: 'playing',
    thresholdMark: 0,
  }
}

/**
 * Áp một nước đi.
 *
 * Input bị bỏ qua khi `status !== 'playing'` — tức khi overlay WIN hoặc GAME
 * OVER đang mở. Đây là Review Focus mục 2: không được để một cú vuốt lọt qua
 * và làm đổi board phía sau một overlay đang che nó.
 */
export function applyInput(state: SessionState, dir: Dir, ctx: MoveContext): Step {
  if (state.status !== 'playing') {
    return { state, move: null, overlay: null, milestones: [], accepted: false }
  }

  const move = applyMove(state.board, dir, ctx)

  if (!move.moved) {
    // Không spawn, không tăng moves, không save (A3, A13 mục 3). Vẫn trả `move`
    // để renderer phát feedback invalid — im lặng là lỗi rủi ro R7.
    return { state, move, overlay: null, milestones: [], accepted: false }
  }

  const score = state.score + move.scoreDelta
  const best = Math.max(state.best, score)
  const mark = Math.floor(score / THRESHOLD_STEP) * THRESHOLD_STEP
  const milestones: Milestone[] = []
  if (mark > state.thresholdMark) milestones.push('threshold')

  // Thắng chỉ đến từ merge (`created2048`), không bao giờ từ tile sinh ra.
  const reachedWin = move.created2048 && !state.won

  // Review Focus mục 5: nếu vừa thắng vừa hết nước thì WIN thắng thế. Người
  // chơi còn "keep playing"; hết nước thật thì lộ ra sau khi họ bấm.
  let status: Status = 'playing'
  let overlay: Overlay = null
  if (reachedWin) {
    status = 'won'
    overlay = 'win'
    milestones.push('win')
  } else if (move.over) {
    status = 'over'
    overlay = 'over'
    milestones.push('over')
  }

  return {
    state: {
      ...state,
      board: move.board,
      score,
      best,
      moves: state.moves + 1,
      won: state.won || reachedWin,
      status,
      thresholdMark: mark,
    },
    move,
    overlay,
    milestones,
    accepted: true,
  }
}

/** Người chơi bấm "Keep playing" sau khi thắng. */
export function keepPlaying(state: SessionState): Step {
  if (state.status !== 'won') {
    return { state, move: null, overlay: null, milestones: [], accepted: false }
  }
  const stuck = !canMove(state.board)
  return {
    state: { ...state, status: stuck ? 'over' : 'playing', keepPlaying: true },
    move: null,
    overlay: stuck ? 'over' : null,
    milestones: stuck ? ['over'] : [],
    accepted: true,
  }
}

/** Bắt đầu ván mới. Kỷ lục và settings được giữ nguyên (FR-09). */
export function newGame(state: SessionState, ctx: MoveContext): Step {
  return {
    state: {
      ...state,
      board: createStartBoard(ctx),
      score: 0,
      moves: 0,
      won: false,
      keepPlaying: false,
      status: 'playing',
      thresholdMark: 0,
      games: state.games + 1,
      totalScore: state.totalScore + state.score,
      bestTile: Math.max(state.bestTile, maxValue(state.board)),
    },
    move: null,
    overlay: null,
    milestones: ['start'],
    accepted: true,
  }
}

export function toSave(state: SessionState, nowIso: string): SaveData {
  return {
    v: SCHEMA_VERSION,
    board: toData(state.board),
    score: state.score,
    best: state.best,
    won: state.won,
    keepPlaying: state.keepPlaying,
    moves: state.moves,
    stats: { games: state.games, bestTile: state.bestTile, totalScore: state.totalScore },
    settings: state.settings,
    lastSavedAt: nowIso,
  }
}
