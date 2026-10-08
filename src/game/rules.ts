import {
  SIZE, canMove, cloneBoard, emptyBoard, emptyCells, sameBoard,
  type Board, type Pos, type Tile,
} from './board'
import type { Rng } from './rng'

export type Dir = 'up' | 'down' | 'left' | 'right'
export type MoveContext = { rng: Rng; nextId: () => number }
export type Slide = { id: number; from: Pos; to: Pos }
export type Merge = { id: number; at: Pos; value: number }
export type Spawn = { id: number; at: Pos; value: number }

export type MoveOutcome = {
  board: Board
  scoreDelta: number
  moved: boolean
  slides: Slide[]
  merges: Merge[]
  spawn: Spawn | null
  created2048: boolean
  over: boolean
}

/** Số tile lúc bắt đầu ván (A3 `startTiles = 2`). */
export const START_TILES = 2

/**
 * Các đường cần xét khi đi theo `dir`, mỗi đường xếp từ MÉP ĐÍCH vào trong.
 *
 * `positions[0]` luôn là ô xa nhất theo hướng đi — đó là nơi mọi tile dồn về.
 * Nhờ vậy phần merge không cần biết hướng, chỉ cần duyệt theo thứ tự này.
 */
export function lines(dir: Dir): Pos[][] {
  const out: Pos[][] = []
  for (let i = 0; i < SIZE; i++) {
    const line: Pos[] = []
    for (let j = 0; j < SIZE; j++) {
      if (dir === 'left') line.push({ row: i, col: j })
      else if (dir === 'right') line.push({ row: i, col: SIZE - 1 - j })
      else if (dir === 'up') line.push({ row: j, col: i })
      else line.push({ row: SIZE - 1 - j, col: i })
    }
    out.push(line)
  }
  return out
}

/**
 * Đặt một tile mới (2 với p = 0.9, 4 với p = 0.1) vào ô rỗng ngẫu nhiên.
 * Trả null khi board đầy. Không sửa board truyền vào.
 */
export function spawnTile(
  board: Board,
  ctx: MoveContext,
): { board: Board; spawn: Spawn } | null {
  const cells = emptyCells(board)
  if (cells.length === 0) return null
  const index = Math.min(cells.length - 1, Math.floor(ctx.rng() * cells.length))
  const at = cells[index]!
  const value = ctx.rng() < 0.9 ? 2 : 4
  const next = cloneBoard(board)
  const tile: Tile = { id: ctx.nextId(), value }
  next[at.row]![at.col] = tile
  return { board: next, spawn: { id: tile.id, at, value } }
}

/** Board lúc mở ván: đúng 2 tile (FR-02). */
export function createStartBoard(ctx: MoveContext): Board {
  let board = emptyBoard()
  for (let i = 0; i < START_TILES; i++) {
    const s = spawnTile(board, ctx)
    if (s === null) break
    board = s.board
  }
  return board
}

/**
 * Một nước đi. HÀM THUẦN: không sửa `board`, không chạm DOM, không đọc đồng hồ.
 *
 * Quy tắc merge nằm ở việc tiêu thụ HAI phần tử một lượt (`i += 2`). Đó là
 * cách bảo đảm mỗi tile chỉ merge một lần mỗi nước — không cần cờ trạng thái
 * trên tile, nên `2 2 2 2` + trái ra `4 4` chứ không ra `8` (A13 mục 2).
 */
export function applyMove(board: Board, dir: Dir, ctx: MoveContext): MoveOutcome {
  const before = cloneBoard(board)
  const next = cloneBoard(board)
  const slides: Slide[] = []
  const merges: Merge[] = []
  let scoreDelta = 0

  for (const positions of lines(dir)) {
    const entries: { p: Pos; tile: Tile }[] = []
    for (const p of positions) {
      const tile = next[p.row]![p.col] ?? null
      if (tile !== null) entries.push({ p, tile })
    }

    const placed: { tile: Tile; from: Pos }[] = []
    let i = 0
    while (i < entries.length) {
      const a = entries[i]!
      const b = entries[i + 1]
      if (b !== undefined && b.tile.value === a.tile.value) {
        const value = a.tile.value * 2
        scoreDelta += value
        // Tile bị hấp thụ biến mất tại ô đích; tile sống sót giữ nguyên id
        // để renderer phát pop trên chính element đó.
        merges.push({ id: b.tile.id, at: positions[placed.length]!, value })
        placed.push({ tile: { id: a.tile.id, value }, from: a.p })
        i += 2
      } else {
        placed.push({ tile: a.tile, from: a.p })
        i += 1
      }
    }

    for (let k = 0; k < SIZE; k++) {
      const dest = positions[k]!
      const e = placed[k]
      next[dest.row]![dest.col] = e === undefined ? null : e.tile
      if (e !== undefined && (e.from.row !== dest.row || e.from.col !== dest.col)) {
        slides.push({ id: e.tile.id, from: e.from, to: dest })
      }
    }
  }

  const moved = !sameBoard(before, next)

  let resultBoard = next
  let spawn: Spawn | null = null
  let created2048 = false
  let over = false

  if (moved) {
    const s = spawnTile(next, ctx)
    if (s !== null) {
      resultBoard = s.board
      spawn = s.spawn
    }
    // Thắng chỉ đến từ merge — tile sinh ra chỉ là 2 hoặc 4.
    created2048 = merges.some((m) => m.value === 2048)
    over = !canMove(resultBoard)
  }

  return { board: resultBoard, scoreDelta, moved, slides, merges, spawn, created2048, over }
}
