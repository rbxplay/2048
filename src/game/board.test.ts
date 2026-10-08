import { describe, expect, it } from 'vitest'
import {
  SIZE, emptyBoard, cloneBoard, sameBoard, toData, fromData,
  emptyCells, canMove, hasValue, maxValue, makeIdFactory,
  type Board, type Tile,
} from './board'

// Dựng board từ mảng số cho gọn test. 0 = rỗng.
function b(rows: number[][]): Board {
  const nextId = makeIdFactory()
  return fromData(rows, nextId)
}

const t = (id: number, value: number): Tile => ({ id, value })

describe('emptyBoard', () => {
  it('4×4 toàn ô rỗng', () => {
    const board = emptyBoard()
    expect(board).toHaveLength(SIZE)
    for (const row of board) {
      expect(row).toHaveLength(SIZE)
      for (const cell of row) expect(cell).toBeNull()
    }
  })
})

describe('cloneBoard', () => {
  it('sao chép cấu trúc — sửa bản sao không đụng bản gốc', () => {
    const a = b([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const c = cloneBoard(a)
    c[0]![0] = null
    expect(a[0]![0]).toEqual(t(1, 2))
  })
})

describe('toData / fromData', () => {
  it('round-trip giữ nguyên giá trị', () => {
    const rows = [[2, 4, 0, 8], [0, 16, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0]]
    expect(toData(b(rows))).toEqual(rows)
  })

  it('fromData cấp id tăng dần, không id nào trùng', () => {
    const board = b([[2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2]])
    const ids = board.flat().map((c) => c!.id)
    expect(new Set(ids).size).toBe(16)
  })

  it('fromData throw khi số hàng sai', () => {
    expect(() => b([[2, 0, 0, 0]])).toThrow(/hình dạng/)
  })

  it('fromData throw khi số cột sai', () => {
    expect(() => b([[2, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])).toThrow(/hình dạng/)
  })

  it('fromData throw khi giá trị không phải 0 hoặc luỹ thừa của 2', () => {
    expect(() => b([[7, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])).toThrow(/giá trị/)
    expect(() => b([[-2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])).toThrow(/giá trị/)
    expect(() => b([[1.5, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])).toThrow(/giá trị/)
  })
})

describe('emptyCells', () => {
  it('liệt kê đúng ô rỗng theo thứ tự hàng rồi cột', () => {
    const board = b([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 4]])
    const cells = emptyCells(board)
    expect(cells).toHaveLength(14)
    expect(cells[0]).toEqual({ row: 0, col: 1 })
    expect(cells[13]).toEqual({ row: 3, col: 2 })
  })

  it('rỗng khi board đầy', () => {
    const board = b([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])
    expect(emptyCells(board)).toEqual([])
  })
})

describe('canMove', () => {
  it('true khi còn ô rỗng', () => {
    expect(canMove(b([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]]))).toBe(true)
  })

  it('true khi board đầy nhưng có cặp kề bằng nhau', () => {
    expect(canMove(b([[2, 2, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]))).toBe(true)
  })

  it('false khi board đầy và không có cặp kề bằng nhau', () => {
    expect(canMove(b([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]))).toBe(false)
  })
})

describe('hasValue / maxValue', () => {
  it('hasValue tìm đúng', () => {
    const board = b([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 2048, 0], [0, 0, 0, 0]])
    expect(hasValue(board, 2048)).toBe(true)
    expect(hasValue(board, 4096)).toBe(false)
  })

  it('maxValue trên board rỗng là 0', () => {
    expect(maxValue(emptyBoard())).toBe(0)
  })

  it('maxValue trả giá trị lớn nhất', () => {
    expect(maxValue(b([[2, 512, 0, 0], [0, 0, 0, 0], [0, 0, 16, 0], [0, 0, 0, 0]]))).toBe(512)
  })
})

describe('sameBoard', () => {
  it('true khi giá trị giống nhau dù id khác', () => {
    const x = fromData([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], makeIdFactory())
    const y = fromData([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], makeIdFactory())
    expect(sameBoard(x, y)).toBe(true)
  })

  it('false khi một ô khác giá trị', () => {
    const x = b([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const y = b([[4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(sameBoard(x, y)).toBe(false)
  })
})
