import { describe, expect, it, vi } from 'vitest'
import { makeIdFactory } from '../game/board'
import { mulberry32 } from '../game/rng'
import type { MoveContext } from '../game/rules'
import type { DialogAction } from '../phaser/views/dialogs'
import { createActionReceiver } from './actions'
import type { OverlayPhase } from './overlay'
import { createSession, keepPlaying, newGame, type SessionState } from './session'

/**
 * `actions.ts` nhập `overlay.ts`, mà tệp đó nhập BẢNG nút của
 * `views/dialogs.ts` — tệp này nhập Phaser, và bản ESM của Phaser dò tính năng
 * canvas ngay lúc import nên không boot nổi trong jsdom. Mock rỗng là đủ: ở đây
 * chỉ dùng hai hàm thuần của tệp đó.
 */
vi.mock('phaser', () => ({ default: {} }))

/** Board hết nước có thật: không còn cặp ô nào bằng nhau để nhập. */
const STUCK = {
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
}

/**
 * Lớp overlay giả — mô phỏng ĐÚNG máy trạng thái của `views/dialogs.ts`:
 * `open() → 'open'`, `close() → 'closing'`, tween chạy xong → `'closed'`.
 *
 * Chính cái máy đó được kiểm ở `views.test.ts` (kèm ô bấm bị tắt ở tầng engine);
 * ở tệp này nó đóng vai NGUỒN SỰ KIỆN, để phép kiểm tập trung vào hệ quả quan
 * sát được: một cú bấm trong cửa sổ mờ dần thì không được chạy action lần hai.
 */
function fakeOverlay() {
  let phase: OverlayPhase = 'closed'
  return {
    open(): void {
      phase = 'open'
    },
    close(): void {
      if (phase === 'open') phase = 'closing'
    },
    /** Tween `--dur-overlay` chạy xong. */
    finishFade(): void {
      if (phase === 'closing') phase = 'closed'
    },
    get phase(): OverlayPhase {
      return phase
    },
  }
}

type Harness = {
  press: (action: DialogAction) => void
  overlay: ReturnType<typeof fakeOverlay>
  games: () => number
  requests: () => number
  state: () => SessionState
  setPaused: (on: boolean) => void
  setGameOvers: (n: number) => void
}

/** Ghép `createActionReceiver` với state THẬT của `session.ts`. */
function harness(gameOvers = 2, overrides: Partial<SessionState> = {}): Harness {
  const ctx: MoveContext = { rng: mulberry32(7), nextId: makeIdFactory() }
  let state: SessionState = { ...createSession({ ctx, resume: STUCK }), ...overrides }
  let losses = gameOvers
  let requests = 0
  let paused = false
  // §A8: phiên đã chạy 60 s ⇒ cửa sổ 30 s đầu không còn chặn quảng cáo, nên
  // mọi phép kiểm ở đây nói về CHÍNH SÁCH chứ không phải về mốc thời gian.
  const sessionStartedAt = 0
  const now = 60_000
  const overlay = fakeOverlay()

  const { applyAction } = createActionReceiver({
    isPaused: () => paused,
    overlayPhase: () => overlay.phase,
    closeOverlay: () => overlay.close(),
    getState: () => state,
    setState: (next) => {
      state = next
    },
    keepPlaying: (s) => keepPlaying(s),
    newGame: (s) => newGame(s, ctx),
    syncAll: () => {},
    saveIfNeeded: () => {},
    showOverlay: () => overlay.open(),
    // `main.ts` đếm lần thua ở đúng một chỗ: `onDir` khi nước đi kết thúc ván.
    noteLoss: () => {
      losses += 1
    },
    ads: {
      state: () => ({ gameOvers: losses, sessionStartedAt }),
      now: () => now,
      request: () => {
        requests += 1
      },
    },
  })

  return {
    press: applyAction,
    overlay,
    games: () => state.games,
    requests: () => requests,
    state: () => state,
    setPaused: (on) => {
      paused = on
    },
    setGameOvers: (n) => {
      losses = n
    },
  }
}

describe('một cú bấm trong cửa sổ mờ dần chỉ được tính MỘT lần (I1)', () => {
  it('cú bấm thứ hai không chạy lại `retry`: đúng một ván mới, đúng một yêu cầu quảng cáo', () => {
    const h = harness(2)
    h.overlay.open()
    const before = h.games()
    expect(h.state().status).toBe('over')

    h.press('retry')
    expect(h.games()).toBe(before + 1)
    expect(h.state().status).toBe('playing')
    expect(h.requests()).toBe(1)
    // Cú bấm đầu đã đóng overlay: 800 ms mờ dần bắt đầu.
    expect(h.overlay.phase).toBe('closing')

    // Sự kiện thứ hai tới trong lúc tween còn chạy. Đây không phải giả định
    // suông: Phaser chỉ bỏ hit-test khi alpha ĐÚNG BẰNG 0, và
    // `InputPlugin.processUpEvents` phát `pointerup` cho mọi hình dưới con trỏ
    // lúc nhả — không đòi hỏi trước đó phải có `pointerdown`.
    h.press('retry')

    // Hệ quả quan sát được: KHÔNG ván mới thứ hai, KHÔNG yêu cầu quảng cáo thứ hai.
    expect(h.games()).toBe(before + 1)
    expect(h.requests()).toBe(1)
  })

  it('nút đóng và `Esc` cũng bị chặn trong cửa sổ mờ dần', () => {
    const h = harness(2)
    h.overlay.open()
    h.press('close') // ván 'over' ⇒ dịch thành retry
    const after = h.games()
    h.press('close')
    h.press('new-game')
    h.press('keep-playing')
    expect(h.games()).toBe(after)
    expect(h.requests()).toBe(1)
  })

  it('chưa mở overlay thì không action nào chạy', () => {
    const h = harness(2)
    const before = h.games()
    expect(h.overlay.phase).toBe('closed')
    h.press('new-game')
    h.press('retry')
    expect(h.games()).toBe(before)
    expect(h.requests()).toBe(0)
  })

  it('pause chặn đường này — nút trong dialog DOM vẫn bấm được bằng bàn phím', () => {
    const h = harness(2)
    h.overlay.open()
    h.setPaused(true)
    h.press('retry')
    expect(h.requests()).toBe(0)
    expect(h.overlay.phase).toBe('open')
  })
})

describe('interstitial idempotent theo từng lần thua', () => {
  it('cùng một lần thua thì không xin quảng cáo lần hai, dù overlay mở lại', () => {
    const h = harness(2)
    const before = h.games()
    h.overlay.open()
    h.press('retry')
    expect(h.requests()).toBe(1)

    // Đóng hẳn rồi mở lại cho CÙNG lần thua — đường `onResume` (mở lại theo
    // `status`) và đường `keepPlaying` phát hiện board hết nước. Cổng theo
    // trạng thái cho qua, nên đây là phép thử của RIÊNG chốt quảng cáo.
    h.overlay.finishFade()
    h.overlay.open()
    h.press('retry')

    // Cú bấm thật trên overlay đang mở thật ⇒ ván mới chạy thật...
    expect(h.games()).toBe(before + 2)
    // ...nhưng lần thua này đã được phục vụ rồi.
    expect(h.requests()).toBe(1)
  })

  it('lần thua MỚI thì vẫn xin quảng cáo — chốt không chặn nhầm', () => {
    const h = harness(2)
    h.overlay.open()
    h.press('retry')
    expect(h.requests()).toBe(1)

    // Hai lần thua nữa: §A8 cho một quảng cáo mỗi HAI ván, nên `gameOvers` 4
    // là lần thua kế tiếp đủ điều kiện.
    h.setGameOvers(4)
    h.overlay.finishFade()
    h.overlay.open()
    h.press('retry')
    expect(h.requests()).toBe(2)
  })

  it('ván `new-game` không bao giờ xin quảng cáo (US-05 AC3: chỉ `retry`)', () => {
    const h = harness(2)
    h.overlay.open()
    h.press('new-game')
    expect(h.requests()).toBe(0)
    expect(h.state().status).toBe('playing')
  })
})

describe('applyAction — hành vi cũ giữ nguyên sau khi rời khỏi main.ts', () => {
  it("'close' trên ván đã thắng ⇒ Chơi tiếp chứ KHÔNG phải ván mới", () => {
    const h = harness(0, { status: 'won', won: true, score: 500 })
    const before = h.games()
    h.overlay.open()
    h.press('close')

    // Board hết nước nên "Chơi tiếp" rơi thẳng vào GAME OVER — dấu hiệu phân
    // biệt với nhánh 'retry', vốn cho status 'playing' và tăng `games`.
    expect(h.state().status).toBe('over')
    expect(h.games()).toBe(before)
  })

  it("'keep-playing' trên board hết nước ⇒ mở GAME OVER và tính thêm một lần thua", () => {
    const h = harness(0, { status: 'won', won: true, score: 500 })
    h.overlay.open()
    h.press('keep-playing')

    expect(h.state().status).toBe('over')
    expect(h.overlay.phase).toBe('open')
    // Lần thua MỚI này (gameOvers 0 → 1) không đủ điều kiện quảng cáo: §A8 đòi
    // số chẵn và ≥ 30 s. 'keep-playing' cũng không bao giờ xin quảng cáo.
    expect(h.requests()).toBe(0)
  })
})
