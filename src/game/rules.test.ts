import { describe, expect, it } from 'vitest'
import { emptyBoard, fromData, makeIdFactory, toData, maxValue, type Board } from './board'
import { applyMove, createStartBoard, spawnTile, START_TILES, type Dir, type MoveContext } from './rules'
import { mulberry32 } from './rng'

function ctx(seed = 1): MoveContext {
  return { rng: mulberry32(seed), nextId: makeIdFactory() }
}

function b(rows: number[][]): Board {
  return fromData(rows, makeIdFactory())
}

function go(board: Board, dir: Dir, seed = 1) {
  return applyMove(board, dir, ctx(seed))
}

const Z = [0, 0, 0, 0]

describe('applyMove — merge đúng luật A3', () => {
  it('2 2 2 2 + trái ⇒ 4 4, KHÔNG ra 8', () => {
    const r = go(b([[2, 2, 2, 2], Z, Z, Z]), 'left')
    expect(toData(r.board)[0]).toEqual([4, 4, 0, 0])
    expect(r.scoreDelta).toBe(8)
  })

  it('4 2 2 + trái ⇒ 4 4 (ô đã merge không merge tiếp)', () => {
    const r = go(b([[4, 2, 2, 0], Z, Z, Z]), 'left')
    expect(toData(r.board)[0]).toEqual([4, 4, 0, 0])
  })

  it('2 2 4 + trái ⇒ 4 4 (ưu tiên mép đích)', () => {
    const r = go(b([[2, 2, 4, 0], Z, Z, Z]), 'left')
    expect(toData(r.board)[0]).toEqual([4, 4, 0, 0])
  })

  it('4 4 2 2 + trái ⇒ 8 4', () => {
    const r = go(b([[4, 4, 2, 2], Z, Z, Z]), 'left')
    expect(toData(r.board)[0]).toEqual([8, 4, 0, 0])
    expect(r.scoreDelta).toBe(12)
  })

  it('2 2 2 2 + phải ⇒ 4 4 ở mép phải, cặp phải merge trước', () => {
    const r = go(b([[2, 2, 2, 2], Z, Z, Z]), 'right')
    expect(toData(r.board)[0]).toEqual([0, 0, 4, 4])
  })

  it('2 2 2 2 + lên ⇒ 4 4 ở hàng trên', () => {
    const rows = [[2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0]]
    const r = go(b(rows), 'up')
    expect(toData(r.board).map((row) => row[0])).toEqual([4, 4, 0, 0])
  })

  it('2 2 2 2 + xuống ⇒ 4 4 ở hàng dưới', () => {
    const rows = [[2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0]]
    const r = go(b(rows), 'down')
    expect(toData(r.board).map((row) => row[0])).toEqual([0, 0, 4, 4])
  })

  it('trượt qua ô rỗng rồi mới merge', () => {
    const r = go(b([[0, 0, 2, 2], Z, Z, Z]), 'left')
    expect(toData(r.board)[0]).toEqual([4, 0, 0, 0])
  })
})

describe('applyMove — scoreDelta', () => {
  it('cộng đúng tổng giá trị sau merge (A13 mục 2)', () => {
    const r = go(b([[8, 8, 0, 0], Z, Z, Z]), 'left')
    expect(r.scoreDelta).toBe(16)
  })

  it('không merge thì scoreDelta bằng 0', () => {
    const r = go(b([[2, 4, 8, 16], Z, Z, Z]), 'down')
    expect(r.scoreDelta).toBe(0)
    expect(r.moved).toBe(true)
  })
})

describe('applyMove — nước đi không đổi gì (A13 mục 3)', () => {
  it('hàng đã dồn sát mép trái ⇒ moved false', () => {
    const r = go(b([[2, 4, 8, 16], Z, Z, Z]), 'left')
    expect(r.moved).toBe(false)
    expect(r.spawn).toBeNull()
    expect(r.slides).toEqual([])
    expect(r.merges).toEqual([])
    expect(r.scoreDelta).toBe(0)
  })

  it('moved false ⇒ board giữ nguyên', () => {
    const board = b([[2, 4, 8, 16], Z, Z, Z])
    const r = go(board, 'left')
    expect(toData(r.board)).toEqual(toData(board))
  })

  it('moved false ⇒ không đánh dấu over dù board đầy', () => {
    // Board đầy, còn cặp kề 2-2 ở hàng 0 nên vẫn đi được; kéo lên là no-op.
    const full = b([[2, 2, 4, 8], [4, 8, 16, 32], [2, 4, 8, 16], [4, 8, 16, 32]])
    expect(go(full, 'up').moved).toBe(false)
  })
})

describe('applyMove — spawn chỉ khi board đổi (A3)', () => {
  it('có thay đổi ⇒ spawn một tile giá trị 2 hoặc 4', () => {
    const r = go(b([[2, 0, 0, 0], Z, Z, Z]), 'right')
    expect(r.moved).toBe(true)
    expect(r.spawn).not.toBeNull()
    expect([2, 4]).toContain(r.spawn!.value)
  })

  it('spawn nằm trên một ô rỗng của board SAU khi di chuyển', () => {
    const r = go(b([[2, 0, 0, 0], Z, Z, Z]), 'right')
    const data = toData(r.board)
    expect(data[r.spawn!.at.row]![r.spawn!.at.col]).toBe(r.spawn!.value)
  })

  it('tổng số tile tăng đúng 1 khi merge xảy ra', () => {
    // 2 tile -> merge thành 1 -> spawn thêm 1 => vẫn 2
    const r = go(b([[2, 2, 0, 0], Z, Z, Z]), 'left')
    expect(toData(r.board).flat().filter((v) => v !== 0)).toHaveLength(2)
  })
})

describe('applyMove — slides ghi đúng để render animation', () => {
  it('ghi from và to cho tile bị dịch chuyển', () => {
    const board = b([[0, 0, 0, 2], Z, Z, Z])
    const id = board[0]![3]!.id
    const r = go(board, 'left')
    expect(r.slides).toContainEqual({ id, from: { row: 0, col: 3 }, to: { row: 0, col: 0 } })
  })

  it('tile đứng yên không sinh slide', () => {
    const r = go(b([[2, 0, 0, 0], Z, Z, Z]), 'left')
    expect(r.slides).toEqual([])
  })
})

describe('applyMove — merges ghi đúng để render animation', () => {
  it('merge ghi id của tile bị hấp thụ và giá trị sau merge', () => {
    const board = b([[2, 2, 0, 0], Z, Z, Z])
    const survivor = board[0]![0]!.id
    const absorbed = board[0]![1]!.id
    const r = go(board, 'left')
    expect(r.merges).toEqual([{ id: absorbed, at: { row: 0, col: 0 }, value: 4 }])
    // tile sống sót giữ nguyên id, chỉ đổi giá trị
    expect(r.board[0]![0]!.id).toBe(survivor)
    expect(r.board[0]![0]!.value).toBe(4)
  })
})

describe('applyMove — thắng và thua', () => {
  it('tạo tile 2048 ⇒ created2048 true', () => {
    const r = go(b([[1024, 1024, 0, 0], Z, Z, Z]), 'left')
    expect(r.created2048).toBe(true)
    expect(maxValue(r.board)).toBe(2048)
  })

  it('merge thường ⇒ created2048 false', () => {
    expect(go(b([[2, 2, 0, 0], Z, Z, Z]), 'left').created2048).toBe(false)
  })

  it('spawn ra 4 không bao giờ kích hoạt created2048', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = go(b([[2, 0, 0, 0], Z, Z, Z]), 'left', seed)
      expect(r.created2048).toBe(false)
    }
  })

  it('điền kín ô cuối mà không còn cặp kề ⇒ over true (A13 mục 5)', () => {
    // Hàng 3 chỉ thiếu ô (3,3). Sau khi kéo trái, ba hàng trên đã kín và hàng
    // 3 thành 4 2 4 _; lượt spawn điền nốt ô (3,3). Nếu spawn ra 2 thì board
    // là bàn cờ hoàn hảo — không còn cặp kề bằng nhau ⇒ hết nước.
    const rows = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 0, 2, 4],
    ]
    let sawOver = false
    for (let seed = 1; seed <= 200 && !sawOver; seed++) {
      const r = go(b(rows), 'left', seed)
      if (r.moved && r.over) sawOver = true
    }
    expect(sawOver).toBe(true)
  })

  it('còn ô rỗng ⇒ over false', () => {
    const r = go(b([[2, 0, 0, 0], Z, Z, Z]), 'left')
    expect(r.over).toBe(false)
  })
})

describe('spawnTile', () => {
  it('trả null khi board đầy', () => {
    const full = b([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])
    expect(spawnTile(full, ctx())).toBeNull()
  })

  it('10 000 lần spawn cho tỉ lệ 2:4 = 90:10 ±1 % (A13 mục 1)', () => {
    const c = ctx(20261008)
    const total = 10_000
    let twos = 0
    for (let i = 0; i < total; i++) {
      const r = spawnTile(emptyBoard(), c)
      expect(r).not.toBeNull()
      if (r!.spawn.value === 2) twos += 1
      else expect(r!.spawn.value).toBe(4)
    }
    const pct = (twos / total) * 100
    expect(pct).toBeGreaterThan(89)
    expect(pct).toBeLessThan(91)
  })

  it('không sửa board gốc', () => {
    const board = b([[2, 0, 0, 0], Z, Z, Z])
    const before = toData(board)
    spawnTile(board, ctx())
    expect(toData(board)).toEqual(before)
  })
})

describe('createStartBoard', () => {
  it('đúng 2 tile, giá trị thuộc {2, 4} (FR-02, A13 mục 1)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const board = createStartBoard(ctx(seed))
      const tiles = board.flat().filter((c) => c !== null)
      expect(tiles).toHaveLength(START_TILES)
      for (const tile of tiles) expect([2, 4]).toContain(tile.value)
    }
  })

  it('hai tile nằm ở hai ô khác nhau', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const board = createStartBoard(ctx(seed))
      const ids = board.flat().filter((c) => c !== null).map((c) => c!.id)
      expect(new Set(ids).size).toBe(2)
    }
  })
})
