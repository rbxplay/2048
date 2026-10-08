import { describe, expect, it } from 'vitest'
import { canMove, fromData, makeIdFactory, toData, type Tile } from '../game/board'
import { mulberry32 } from '../game/rng'
import type { Dir, MoveContext } from '../game/rules'
import {
  applyInput, createSession, keepPlaying, newGame, THRESHOLD_STEP, toSave,
  type SessionState,
} from './session'

function ctx(seed = 1): MoveContext {
  return { rng: mulberry32(seed), nextId: makeIdFactory() }
}

// Nhập từ board module để không lặp logic dựng board.
function rowsToBoard(rows: number[][]) {
  return fromData(rows, makeIdFactory(500))
}

/** Session với board cố định để test tất định. */
function sessionFrom(rows: number[][], extra: Partial<SessionState> = {}): SessionState {
  const base = createSession({ ctx: ctx() })
  return {
    ...base,
    board: rowsToBoard(rows),
    ...extra,
  }
}

describe('createSession', () => {
  it('ván mới có đúng 2 tile và điểm 0', () => {
    const s = createSession({ ctx: ctx() })
    expect(s.board.flat().filter((c) => c !== null)).toHaveLength(2)
    expect(s.score).toBe(0)
    expect(s.moves).toBe(0)
    expect(s.status).toBe('playing')
  })

  it('kế thừa best và stats đã lưu', () => {
    const s = createSession({
      ctx: ctx(),
      best: 4096,
      stats: { games: 7, bestTile: 512, totalScore: 22140 },
    })
    expect(s.best).toBe(4096)
    expect(s.games).toBe(7)
  })

  it('resume thì dùng lại board đã lưu, KHÔNG sinh ván mới', () => {
    const s = createSession({
      ctx: ctx(),
      resume: {
        board: [[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
        score: 128,
        moves: 42,
        won: false,
        keepPlaying: false,
      },
    })
    expect(toData(s.board)[0]).toEqual([2, 4, 0, 0])
    expect(s.score).toBe(128)
    expect(s.moves).toBe(42)
  })

  it('resume board rỗng ⇒ coi như ván mới', () => {
    const s = createSession({
      ctx: ctx(),
      resume: {
        board: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
        score: 0,
        moves: 0,
        won: false,
        keepPlaying: false,
      },
    })
    expect(s.board.flat().filter((c) => c !== null)).toHaveLength(2)
  })

  it('resume board đã hết nước ⇒ status over ngay, không phải playing', () => {
    // Thua bình thường: save ở milestone 'over' (INT-05) rồi mở lại game.
    const s = createSession({
      ctx: ctx(),
      resume: {
        board: [
          [2, 4, 2, 4],
          [4, 2, 4, 2],
          [2, 4, 2, 4],
          [4, 2, 4, 2],
        ],
        score: 1234,
        moves: 88,
        won: false,
        keepPlaying: false,
      },
    })
    expect(canMove(s.board)).toBe(false)
    expect(s.status).toBe('over')
  })

  it('resume board hết nước sau khi đã thắng và Chơi tiếp ⇒ status over', () => {
    // Thắng trên board đầy ⇒ keepPlaying phát hiện stuck và set keepPlaying:true,
    // nên save ra won:true, keepPlaying:true trên board không còn nước.
    const s = createSession({
      ctx: ctx(),
      resume: {
        board: [
          [2, 4, 2, 4],
          [4, 2, 4, 2],
          [2, 4, 2, 4],
          [4, 2, 4, 2],
        ],
        score: 20480,
        moves: 300,
        won: true,
        keepPlaying: true,
      },
    })
    expect(canMove(s.board)).toBe(false)
    expect(s.status).toBe('over')
  })

  it('sau resume, id trên board vẫn duy nhất qua các nước đi tiếp', () => {
    // Board khôi phục và tile sinh ra sau đó phải dùng CHUNG một bộ đếm id,
    // nếu không id trùng và Board.ts#acquire trả nhầm node cho hai tile khác nhau.
    const c = ctx()
    let state = createSession({
      ctx: c,
      resume: {
        board: [[0, 0, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
        score: 0,
        moves: 0,
        won: false,
        keepPlaying: false,
      },
    })
    const dirs: Dir[] = ['left', 'right', 'left']
    dirs.forEach((dir, i) => {
      const step = applyInput(state, dir, c)
      expect(step.accepted).toBe(true)
      state = step.state
      const ids = state.board.flat().filter((t): t is Tile => t !== null).map((t) => t.id)
      expect(new Set(ids).size, `id trùng sau lượt ${i + 1}`).toBe(ids.length)
    })
  })
})

describe('applyInput — nước đi hợp lệ', () => {
  it('cập nhật board, điểm, số lượt', () => {
    const s = sessionFrom([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const step = applyInput(s, 'left', ctx())
    expect(step.accepted).toBe(true)
    expect(step.state.score).toBe(4)
    expect(step.state.moves).toBe(1)
    expect(toData(step.state.board)[0]![0]).toBe(4)
  })

  it('cập nhật kỷ lục khi vượt', () => {
    const s = sessionFrom([[8, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { best: 5 })
    const step = applyInput(s, 'left', ctx())
    expect(step.state.score).toBe(16)
    expect(step.state.best).toBe(16)
  })

  it('không hạ kỷ lục khi điểm thấp hơn', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { best: 9999 })
    const step = applyInput(s, 'left', ctx())
    expect(step.state.best).toBe(9999)
  })
})

describe('applyInput — nước đi không đổi gì (A13 mục 3)', () => {
  it('không tăng lượt, không spawn, không điểm', () => {
    const s = sessionFrom([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const step = applyInput(s, 'left', ctx())
    expect(step.move!.moved).toBe(false)
    expect(step.state.moves).toBe(0)
    expect(step.state.score).toBe(0)
    expect(step.accepted).toBe(false)
    expect(step.milestones).toEqual([])
  })

  it('vẫn trả move để renderer phát feedback invalid', () => {
    const s = sessionFrom([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(applyInput(s, 'left', ctx()).move).not.toBeNull()
  })
})

describe('applyInput — Review Focus mục 2: input khi overlay đang mở', () => {
  it('status won ⇒ bỏ qua input, không đổi state', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      status: 'won',
      won: true,
    })
    const step = applyInput(s, 'left', ctx())
    expect(step.accepted).toBe(false)
    expect(step.move).toBeNull()
    expect(step.overlay).toBeNull()
    expect(step.state).toBe(s)
  })

  it('status over ⇒ bỏ qua input', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      status: 'over',
    })
    const step = applyInput(s, 'left', ctx())
    expect(step.accepted).toBe(false)
    expect(step.move).toBeNull()
  })

  it('status playing ⇒ vẫn nhận, kể cả khi vừa mới có overlay trước đó', () => {
    // Hướng phải là 'right': board chỉ có tile ở mép trái, đi 'left' là no-op
    // nên không phân biệt được "đã xử lý" với "bị bỏ qua".
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(applyInput(s, 'right', ctx()).accepted).toBe(true)
  })
})

describe('applyInput — thắng', () => {
  it('tạo 2048 ⇒ status won và overlay win', () => {
    const s = sessionFrom([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const step = applyInput(s, 'left', ctx())
    expect(step.state.won).toBe(true)
    expect(step.state.status).toBe('won')
    expect(step.overlay).toBe('win')
    expect(step.milestones).toContain('win')
  })

  it('đã won rồi thì không mở lại overlay win', () => {
    const s = sessionFrom([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      won: true,
      keepPlaying: true,
    })
    const step = applyInput(s, 'left', ctx())
    expect(step.overlay).toBeNull()
    expect(step.milestones).not.toContain('win')
  })
})

describe('applyInput — Review Focus mục 5: win và over cùng lúc', () => {
  it('chỉ mở overlay WIN, không mở chồng hai overlay', () => {
    // Board gần kín, nước đi tạo 2048 và cũng làm hết nước.
    const rows = [
      [1024, 1024, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]
    const s = sessionFrom(rows)
    let found = false
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const step = applyInput(s, 'left', ctx(seed))
      if (step.state.won && step.state.status === 'won') {
        found = true
        expect(step.overlay).toBe('win')
      }
    }
    expect(found).toBe(true)
  })

  // Bổ sung: fixture trên không bao giờ đặt `over` cùng lúc với `win` (sau nước
  // đi vẫn còn cặp 2-2 kề nhau ở cột chỉ số 1: [0][1] và [1][1]), nên quy tắc
  // ưu tiên của Review Focus mục 5 chưa được kiểm. Fixture dưới đây merge ra
  // 2048 VÀ lấp ô trống cuối cùng, để lại board hết nước thật.
  it('thắng và hết nước cùng một nước ⇒ chỉ WIN, keepPlaying mới lộ ra over', () => {
    const rows = [
      [1024, 1024, 8, 16],
      [4, 2, 4, 8],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]
    const s = sessionFrom(rows)
    const step = applyInput(s, 'left', ctx())
    expect(step.state.won).toBe(true)
    expect(step.state.status).toBe('won')
    expect(step.overlay).toBe('win')
    expect(step.milestones).toContain('win')
    expect(step.milestones).not.toContain('over')

    const after = keepPlaying(step.state)
    expect(after.state.status).toBe('over')
    expect(after.overlay).toBe('over')
  })

  it('over mà không thắng ⇒ overlay over', () => {
    // Nước đi lấp ô trống cuối cùng và để lại board không còn cặp kề nào, cho
    // cả hai giá trị tile sinh ra (2 và 4).
    const rows = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 8],
      [0, 4, 8, 16],
    ]
    const s = sessionFrom(rows)
    let sawOver = false
    for (let seed = 1; seed <= 300 && !sawOver; seed++) {
      const step = applyInput(s, 'left', ctx(seed))
      if (step.state.status === 'over') {
        sawOver = true
        expect(step.overlay).toBe('over')
        expect(step.milestones).toContain('over')
      }
    }
    expect(sawOver).toBe(true)
  })
})

describe('applyInput — milestone ngưỡng 1000 điểm', () => {
  it('vượt mốc 1000 ⇒ có milestone threshold', () => {
    const s = sessionFrom([[512, 512, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      score: 990,
      thresholdMark: 0,
    })
    const step = applyInput(s, 'left', ctx())
    expect(step.state.score).toBeGreaterThanOrEqual(THRESHOLD_STEP)
    expect(step.milestones).toContain('threshold')
  })

  it('không vượt mốc ⇒ không có milestone threshold', () => {
    const s = sessionFrom([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      thresholdMark: 0,
    })
    expect(applyInput(s, 'left', ctx()).milestones).not.toContain('threshold')
  })

  it('không phát lại cùng một mốc hai lần', () => {
    // Merge 256+256 (+512) từ 990 điểm ⇒ 1502, tức VƯỢT ĐÚNG MỘT mốc: mốc
    // 1000. Fixture 512+512 (+1024) sẽ nhảy qua cả mốc 2000 trong một nước,
    // nên `thresholdMark` phải là 2000 và khẳng định `toBe(1000)` không thể đúng.
    const s = sessionFrom([[256, 256, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      score: 990,
      thresholdMark: 0,
    })
    const step = applyInput(s, 'left', ctx())
    expect(step.state.score).toBe(1502)
    expect(step.state.thresholdMark).toBe(1000)
    const s2 = sessionFrom([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], step.state)
    expect(applyInput(s2, 'left', ctx()).milestones).not.toContain('threshold')
  })
})

describe('keepPlaying', () => {
  it('quay lại playing, giữ nguyên board và điểm', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      status: 'won',
      won: true,
      score: 20480,
    })
    const step = keepPlaying(s)
    expect(step.state.status).toBe('playing')
    expect(step.state.score).toBe(20480)
    expect(step.overlay).toBeNull()
  })

  it('nếu board đã hết nước thì chuyển thẳng sang over', () => {
    const rows = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]
    const s = sessionFrom(rows, { status: 'won', won: true })
    const step = keepPlaying(s)
    expect(step.state.status).toBe('over')
    expect(step.overlay).toBe('over')
  })

  it('khi không ở status won thì là no-op', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(keepPlaying(s).state).toBe(s)
  })
})

describe('newGame', () => {
  it('ván mới: 2 tile, điểm 0, GIỮ kỷ lục', () => {
    const s = sessionFrom([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      score: 5000,
      best: 5000,
      status: 'over',
    })
    const step = newGame(s, ctx())
    expect(step.state.score).toBe(0)
    expect(step.state.moves).toBe(0)
    expect(step.state.best).toBe(5000)
    expect(step.state.status).toBe('playing')
    expect(step.state.board.flat().filter((c) => c !== null)).toHaveLength(2)
  })

  it('tăng số ván đã chơi và cộng dồn tổng điểm', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      score: 1200,
      games: 3,
      totalScore: 5000,
    })
    const step = newGame(s, ctx())
    expect(step.state.games).toBe(4)
    expect(step.state.totalScore).toBe(6200)
  })

  it('ghi nhận bestTile của ván vừa kết thúc', () => {
    const s = sessionFrom([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      board: rowsToBoard([[512, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]),
      bestTile: 2,
    })
    expect(newGame(s, ctx()).state.bestTile).toBe(512)
  })

  it('phát milestone start', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(newGame(s, ctx()).milestones).toContain('start')
  })
})

describe('toSave', () => {
  it('best trong save khớp giá trị dùng cho sendScore (INT-08)', () => {
    const s = sessionFrom([[8, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { best: 5 })
    const step = applyInput(s, 'left', ctx())
    const save = toSave(step.state, '2026-10-08T00:00:00Z')
    expect(save.best).toBe(step.state.best)
  })

  it('board trong save là số thuần, không có id', () => {
    const s = sessionFrom([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const save = toSave(s, '')
    expect(save.board).toEqual([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(JSON.stringify(save)).not.toContain('id')
  })

  it('settings được đưa vào save nguyên vẹn', () => {
    const s = sessionFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      settings: { haptics: false, reducedMotion: true, dpad: 'off', theme: 'dark', sfxVolume: 0.1 },
    })
    expect(toSave(s, '').settings.theme).toBe('dark')
  })

  it('payload vẫn dưới 1 KiB (NFR-05)', () => {
    const s = createSession({ ctx: ctx(), best: 999999, stats: { games: 999, bestTile: 8192, totalScore: 999999 } })
    expect(JSON.stringify(toSave(s, '2026-10-08T00:00:00Z')).length).toBeLessThan(1024)
  })
})
