export type Tile = { id: number; value: number }
export type Board = (Tile | null)[][]
export type BoardData = number[][]
export type Pos = { row: number; col: number }

export const SIZE = 4

/** Bộ cấp id tăng dần. Không dùng Math.random để test tái lập được. */
export function makeIdFactory(start = 0): () => number {
  let n = start
  return () => {
    n += 1
    return n
  }
}

export function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null as Tile | null))
}

/**
 * Sao chép cấu trúc mảng, dùng lại tham chiếu Tile.
 * An toàn vì Tile được đối xử như bất biến: merge tạo object mới thay vì sửa tại chỗ.
 */
export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice())
}

export function toData(board: Board): BoardData {
  return board.map((row) => row.map((cell) => (cell === null ? 0 : cell.value)))
}

function isPowerOfTwoOrZero(v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false
  if (v === 0) return true
  return (v & (v - 1)) === 0
}

/**
 * Dựng board runtime từ dữ liệu lưu trữ.
 * Throw khi hình dạng hoặc giá trị sai — người gọi là `persist.parse`, nơi bắt
 * lỗi và rơi về ván mới. Xem spec §5 Review Focus mục 1.
 */
export function fromData(data: BoardData, nextId: () => number): Board {
  if (!Array.isArray(data) || data.length !== SIZE) {
    throw new Error(`hình dạng board sai: cần ${SIZE} hàng, nhận ${Array.isArray(data) ? data.length : typeof data}`)
  }
  return data.map((row, r) => {
    if (!Array.isArray(row) || row.length !== SIZE) {
      throw new Error(`hình dạng board sai: hàng ${r} cần ${SIZE} cột`)
    }
    return row.map((v) => {
      if (!isPowerOfTwoOrZero(v)) {
        throw new Error(`giá trị ô không hợp lệ ở hàng ${r}: ${String(v)}`)
      }
      return v === 0 ? null : { id: nextId(), value: v }
    })
  })
}

export function emptyCells(board: Board): Pos[] {
  const out: Pos[] = []
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (board[row]![col] == null) out.push({ row, col })
    }
  }
  return out
}

export function sameBoard(a: Board, b: Board): boolean {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      // `?? null`: ngoài phạm vi tính là ô rỗng, và `noUncheckedIndexedAccess`
      // khiến chỉ số truy cập trả thêm `undefined`.
      const x = a[row]![col] ?? null
      const y = b[row]![col] ?? null
      if ((x === null) !== (y === null)) return false
      if (x !== null && y !== null && x.value !== y.value) return false
    }
  }
  return true
}

/** Còn nước đi khi còn ô rỗng, hoặc còn cặp kề bằng nhau (A3, A13 mục 5). */
export function canMove(board: Board): boolean {
  if (emptyCells(board).length > 0) return true
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const v = board[row]![col]!.value
      const right = col + 1 < SIZE ? board[row]![col + 1]!.value : -1
      const down = row + 1 < SIZE ? board[row + 1]![col]!.value : -1
      if (v === right || v === down) return true
    }
  }
  return false
}

export function hasValue(board: Board, value: number): boolean {
  return board.some((row) => row.some((c) => c !== null && c.value === value))
}

export function maxValue(board: Board): number {
  let max = 0
  for (const row of board) {
    for (const c of row) if (c !== null && c.value > max) max = c.value
  }
  return max
}
