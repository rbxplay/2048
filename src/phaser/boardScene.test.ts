import { describe, expect, it, vi } from 'vitest'
import { HAIRLINE_DARK_ALPHA, HAIRLINE_LIGHT_ALPHA } from '../theme/palette'
import { resolveSwipe, tileStroke } from './scenes/Board'
import { buildTheme } from './theme'

/**
 * `phaser` KHÔNG import được trong jsdom: bản ESM của Phaser 4 dò tính năng
 * canvas ngay lúc import (`checkInverseAlpha` gọi `canvas.getContext('2d')`, mà
 * jsdom trả `null` khi thiếu gói `canvas` native), nên suite chết trước khi tới
 * test đầu tiên — đã đo bằng một probe tạm. Ở đây chỉ cần `Phaser.Scene` để lớp
 * `BoardScene` định nghĩa được; không test nào chạm tới engine, và các hàm được
 * kiểm là hàm THUẦN đúng như brief yêu cầu ("xuất ra để test không cần scene").
 */
vi.mock('phaser', () => ({ default: { Scene: class {} } }))

describe('resolveSwipe — ngưỡng §A4', () => {
  const MIN = 24

  it('dưới ngưỡng ⇒ null', () => {
    expect(resolveSwipe(10, 5, MIN)).toBeNull()
  })

  it('ngang trội ⇒ trái/phải', () => {
    expect(resolveSwipe(60, 5, MIN)).toBe('right')
    expect(resolveSwipe(-60, 5, MIN)).toBe('left')
  })

  it('dọc trội ⇒ lên/xuống', () => {
    expect(resolveSwipe(5, 60, MIN)).toBe('down')
    expect(resolveSwipe(5, -60, MIN)).toBe('up')
  })

  it('chéo mơ hồ (tỉ lệ < 1.2) ⇒ null, không đoán bừa', () => {
    expect(resolveSwipe(50, 50, MIN)).toBeNull()
  })

  it('đúng ranh giới 1.2 thì nhận trục trội', () => {
    expect(resolveSwipe(60, 50, MIN)).toBe('right')
  })

  it('NaN ⇒ null', () => {
    expect(resolveSwipe(Number.NaN, 50, MIN)).toBeNull()
  })
})

describe('tileStroke — §B4:162-163 và §B1.5', () => {
  it('theme sáng: 1px, alpha theo bậc numeral', () => {
    const t = buildTheme('light')
    expect(tileStroke(t, 2)).toEqual({
      width: 1,
      color: t.tileHairline(2),
      alpha: HAIRLINE_LIGHT_ALPHA,
    })
    expect(tileStroke(t, 2048)).toEqual({
      width: 1,
      color: t.tileHairline(2048),
      alpha: HAIRLINE_DARK_ALPHA,
    })
  })

  it('ranh giới bậc nằm đúng ở 64', () => {
    const t = buildTheme('light')
    expect(tileStroke(t, 32).alpha).toBe(HAIRLINE_LIGHT_ALPHA)
    expect(tileStroke(t, 64).alpha).toBe(HAIRLINE_DARK_ALPHA)
  })

  it('theme tối giữ 1px và hai bậc alpha', () => {
    const t = buildTheme('dark')
    expect(tileStroke(t, 2).width).toBe(1)
    expect(tileStroke(t, 8192).alpha).toBe(HAIRLINE_DARK_ALPHA)
  })

  it('theme tương phản cao: viền đen đặc 2px ở MỌI bậc (§B1.5)', () => {
    const c = buildTheme('contrast')
    for (const v of [2, 4, 32, 64, 2048, 8192, 16384]) {
      expect(tileStroke(c, v), `tile ${v}`).toEqual({ width: 2, color: 0x000000, alpha: 1 })
    }
  })
})

/**
 * Fake đủ trung thành để kiểm vòng đời tween của `BoardScene`: `killAll` và
 * `killTweensOf` HUỶ tween TẠI CHỖ và KHÔNG chạy `onComplete` (đúng Phaser 4).
 */
type FakeTw = { targets: unknown[]; stopped: boolean; done: boolean; onComplete: (() => void) | undefined }

function chain(): Record<string, unknown> {
  // Mỗi game object là một đối tượng riêng (để `killTweensOf` phân biệt được);
  // mọi setter trả về chính nó như API chuỗi của Phaser.
  const self: Record<string, unknown> = new Proxy(
    {},
    {
      get(t: Record<string, unknown>, key: string) {
        if (key in t) return t[key]
        if (key === 'getByName') return () => null
        return () => self
      },
    },
  )
  return self
}

async function makeBoardScene() {
  const { BoardScene } = await import('./scenes/Board')
  const tweens: FakeTw[] = []
  const handlers: Record<string, () => void> = {}
  const scene = new BoardScene() as unknown as Record<string, unknown> & {
    create(): void
    renderBoard(b: unknown): void
    playOutcome(o: unknown): void
  }
  const go = chain
  Object.assign(scene, {
    add: {
      container: go,
      rectangle: go,
      text: go,
      graphics: go,
    },
    cameras: { main: { setBackgroundColor: () => undefined } },
    scale: {
      width: 360,
      height: 640,
      on: (_e: string, fn: () => void) => {
        handlers.resize = fn
      },
      off: () => undefined,
    },
    input: { on: () => undefined },
    events: { once: () => undefined, emit: () => undefined },
    tweens: {
      add: (cfg: { targets: unknown; onComplete?: (() => void) | undefined }): FakeTw => {
        const tw: FakeTw = {
          targets: Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets],
          stopped: false,
          done: false,
          onComplete: cfg.onComplete,
        }
        tweens.push(tw)
        return tw
      },
      killAll: () => {
        for (const tw of tweens) tw.stopped = true
      },
      killTweensOf: (t: unknown) => {
        const list = Array.isArray(t) ? t : [t]
        for (const tw of tweens) if (tw.targets.some((x) => list.includes(x))) tw.stopped = true
      },
    },
  })
  scene.create()
  return { scene, tweens, handlers }
}

const boardOf = (id: number) =>
  Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 4 }, (_, c) => (r === 0 && c === 0 ? { id, value: 2 } : null)),
  )

describe('BoardScene — chỉ huỷ tween CỦA MÌNH (D1)', () => {
  it('renderBoard không giết tween mờ dần của dialog/settings cùng scene', async () => {
    const { scene, tweens } = await makeBoardScene()
    // Tween của một view khác (dialog) — mục tiêu KHÔNG phải tile nào của Board.
    const dialogFade = scene.tweens as { add: (c: { targets: unknown[] }) => FakeTw }
    const fade = dialogFade.add({ targets: [{ name: 'dialog-card' }] })
    scene.renderBoard(boardOf(1))
    expect(fade.stopped).toBe(false)
    expect(tweens).toContain(fade)
  })

  it('resize giữa lúc dialog mờ dần cũng để yên tween của dialog', async () => {
    const { scene, handlers } = await makeBoardScene()
    const fade = (scene.tweens as { add: (c: { targets: unknown[] }) => FakeTw }).add({
      targets: [{}],
    })
    handlers.resize?.()
    expect(fade.stopped).toBe(false)
  })

  it('vẫn huỷ tween của tile (slide/spawn/pop) khi render lại', async () => {
    const { scene, tweens } = await makeBoardScene()
    scene.renderBoard(boardOf(1))
    const after = boardOf(1)
    after[0]![3] = { id: 1, value: 2 }
    after[0]![0] = null
    after[1]![1] = { id: 2, value: 2 }
    scene.playOutcome({
      moved: true,
      slides: [{ id: 1, from: { row: 0, col: 0 }, to: { row: 0, col: 3 } }],
      merges: [],
      spawn: { id: 2, at: { row: 1, col: 1 }, value: 2 },
      board: after,
    })
    const own = tweens.filter((t) => !t.stopped)
    expect(own.length).toBeGreaterThan(0)
    scene.renderBoard(boardOf(1))
    expect(tweens.every((t) => t.stopped)).toBe(true)
  })
})
