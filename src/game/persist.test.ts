import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, defaultSave, parse, serialize, type SaveData } from './persist'

function good(overrides: Partial<SaveData> = {}): SaveData {
  return {
    ...defaultSave(),
    board: [[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    score: 128,
    best: 4096,
    moves: 42,
    stats: { games: 7, bestTile: 512, totalScore: 22140 },
    ...overrides,
  }
}

describe('round-trip', () => {
  it('serialize rồi parse giữ nguyên board, score, best', () => {
    const d = good()
    const back = parse(serialize(d))
    expect(back).not.toBeNull()
    expect(back!.board).toEqual(d.board)
    expect(back!.score).toBe(128)
    expect(back!.best).toBe(4096)
    expect(back!.moves).toBe(42)
    expect(back!.stats).toEqual(d.stats)
  })

  it('payload nằm dưới 1 KiB (NFR-05)', () => {
    expect(serialize(good()).length).toBeLessThan(1024)
  })
})

describe('parse — đầu vào không dùng được ⇒ null', () => {
  it('null / undefined / chuỗi rỗng', () => {
    expect(parse(null)).toBeNull()
    expect(parse(undefined)).toBeNull()
    expect(parse('')).toBeNull()
  })

  it('JSON hỏng', () => {
    expect(parse('{rác')).toBeNull()
    expect(parse('[[[')).toBeNull()
  })

  it('JSON hợp lệ nhưng không phải object', () => {
    expect(parse('"chuỗi"')).toBeNull()
    expect(parse('42')).toBeNull()
    expect(parse('null')).toBeNull()
    expect(parse('[1,2,3]')).toBeNull()
  })

  it('thiếu hoặc sai kiểu trường v', () => {
    expect(parse('{}')).toBeNull()
    expect(parse('{"v":"1"}')).toBeNull()
    expect(parse('{"v":null}')).toBeNull()
  })
})

describe('parse — phiên bản lạ', () => {
  it('v cũ (v0) load được, không crash, nâng lên v hiện tại', () => {
    const d = good({ v: 0 })
    const back = parse(JSON.stringify(d))
    expect(back).not.toBeNull()
    expect(back!.v).toBe(SCHEMA_VERSION)
    expect(back!.board).toEqual(d.board)
  })

  it('v mới hơn (v99) load được, không crash', () => {
    const d = good({ v: 99 })
    const back = parse(JSON.stringify(d))
    expect(back).not.toBeNull()
    expect(back!.board).toEqual(d.board)
  })
})

describe('parse — board hỏng thì tạo ván mới NHƯNG giữ kỷ lục', () => {
  // Đây là Review Focus mục 1, và cũng là bài học từ RPS: "thà mất một phiên
  // còn hơn mất kỷ lục mọi thời đại".
  const corruptBoards: [string, unknown][] = [
    ['3×3', [[2, 0, 0], [0, 0, 0], [0, 0, 0]]],
    ['5×4', [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]],
    ['giá trị không phải luỹ thừa 2', [[7, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]],
    ['giá trị âm', [[-2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]],
    ['số thực', [[1.5, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]],
    ['phần tử là chuỗi', [['2', 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]],
    ['board là null', null],
    ['board là object', { a: 1 }],
  ]

  for (const [label, bad] of corruptBoards) {
    it(`board ${label} ⇒ ván mới, giữ best và stats`, () => {
      const raw = JSON.stringify({ ...good(), board: bad })
      const back = parse(raw)
      expect(back).not.toBeNull()
      expect(back!.board).toEqual(defaultSave().board)
      expect(back!.score).toBe(0)
      expect(back!.moves).toBe(0)
      expect(back!.won).toBe(false)
      // Kỷ lục phải sống sót.
      expect(back!.best).toBe(4096)
      expect(back!.stats).toEqual({ games: 7, bestTile: 512, totalScore: 22140 })
    })
  }
})

describe('parse — trường thiếu hoặc sai kiểu thì lấy mặc định', () => {
  it('thiếu hết chỉ còn v ⇒ mọi thứ về mặc định', () => {
    const back = parse('{"v":1}')
    expect(back).not.toBeNull()
    expect(back!.board).toEqual(defaultSave().board)
    expect(back!.score).toBe(0)
    expect(back!.best).toBe(0)
    expect(back!.moves).toBe(0)
    expect(back!.settings).toEqual(defaultSave().settings)
    expect(back!.stats).toEqual(defaultSave().stats)
  })

  it('score/moves/best âm hoặc không phải số ⇒ về 0', () => {
    const raw = JSON.stringify({
      v: 1,
      board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: -5,
      moves: 'nhiều',
      best: Number.NaN,
    })
    const back = parse(raw)
    expect(back!.score).toBe(0)
    expect(back!.moves).toBe(0)
    expect(back!.best).toBe(0)
  })

  it('won/keepPlaying chỉ nhận đúng boolean true', () => {
    const raw = JSON.stringify({
      v: 1,
      board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      won: 'có',
      keepPlaying: 1,
    })
    const back = parse(raw)
    expect(back!.won).toBe(false)
    expect(back!.keepPlaying).toBe(false)
  })

  it('settings sai kiểu ⇒ về mặc định, không crash', () => {
    // `sfxVolume` ở đây cố ý là SAI KIỂU, không phải số ngoài khoảng: số ngoài
    // khoảng thuộc về test "sfxVolume được kẹp về khoảng [0, 1]" bên dưới.
    const raw = JSON.stringify({
      v: 1,
      board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      settings: { haptics: 'yes', theme: 'neon', sfxVolume: 'to', dpad: 'maybe' },
    })
    const back = parse(raw)
    expect(back!.settings).toEqual(defaultSave().settings)
  })

  it('theme hợp lệ được giữ', () => {
    const raw = JSON.stringify({
      v: 1,
      board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      settings: { theme: 'dark' },
    })
    expect(parse(raw)!.settings.theme).toBe('dark')
  })

  it('sfxVolume được kẹp về khoảng [0, 1]', () => {
    const mk = (vol: unknown) =>
      JSON.stringify({
        v: 1,
        board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
        settings: { sfxVolume: vol },
      })
    expect(parse(mk(-3))!.settings.sfxVolume).toBe(0)
    expect(parse(mk(42))!.settings.sfxVolume).toBe(1)
  })

  it('stats sai kiểu ⇒ về 0, không crash', () => {
    const raw = JSON.stringify({
      v: 1,
      board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      stats: { games: 'nhiều', bestTile: null, totalScore: -1 },
    })
    expect(parse(raw)!.stats).toEqual({ games: 0, bestTile: 0, totalScore: 0 })
  })
})

describe('defaultSave', () => {
  it('board rỗng hoàn toàn', () => {
    expect(defaultSave().board).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  })

  it('v bằng SCHEMA_VERSION', () => {
    expect(defaultSave().v).toBe(SCHEMA_VERSION)
  })
})
