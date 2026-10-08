import { describe, expect, it, vi } from 'vitest'
// `vi` của vitest đụng tên với export `vi` (chuỗi tiếng Việt) của i18n.
import { en } from '../../i18n'
import { computeLayout, type Layout } from '../layout'
import { buildTheme } from '../theme'
import { CARD_RADIUS, createDialogs, DIALOG_MAX_W, SHADOW_DY } from './dialogs'
import { createHud, GEAR_SIZE, hudCardsWidth } from './hud'

/**
 * Cùng cách xử như `formatScore.test.ts`: bản ESM của Phaser 4 dò tính năng
 * canvas ngay lúc import nên không boot nổi trong jsdom. Nhưng khác tệp kia,
 * ở đây ta KHÔNG bỏ qua engine — ta thay nó bằng một `scene` giả ghi lại đúng
 * những gì hai factory gọi.
 *
 * Đây là chỗ bắt các lỗi mà brief đã viết sai cả bốn: thứ tự thẻ-trước-chữ,
 * ô bấm đo sai lúc `setInteractive`, vòng đời badge, và nút đóng không phát
 * `'close'`. `Phaser.Geom` phải có mặt vì `dialogs.ts` dùng
 * `instanceof Phaser.Geom.Rectangle` để đồng bộ ô bấm.
 */
const { FakeGeomRectangle } = vi.hoisted(() => {
  class FakeGeomRectangle {}
  return { FakeGeomRectangle }
})

vi.mock('phaser', () => ({
  default: { Scene: class {}, Geom: { Rectangle: FakeGeomRectangle } },
}))

type Op = { op: string; args: unknown[] }

/**
 * Ô bấm — mô phỏng ĐÚNG hành vi Phaser: chụp `width` ngay lúc `setInteractive`.
 *
 * Phải kế thừa `Phaser.Geom.Rectangle` của bản mock, vì `syncHitArea` trong
 * `dialogs.ts` lọc bằng `instanceof` — đúng như engine thật, nơi `hitArea` là
 * một `Phaser.Geom.Rectangle`.
 */
class FakeHitArea extends FakeGeomRectangle {
  constructor(public width: number, public height: number) {
    super()
  }
  setSize(w: number, h: number): void {
    this.width = w
    this.height = h
  }
}

class FakeGO {
  x = 0
  y = 0
  width = 0
  height = 0
  alpha = 1
  visible = true
  text = ''
  color = ''
  fontSize = 0
  resolution = 1
  originX = 0
  originY = 0
  fillColor = 0
  fillAlpha = 1
  destroyed = false
  input: { hitArea: FakeHitArea } | null = null
  readonly ops: Op[] = []
  readonly handlers = new Map<string, (() => void)[]>()

  constructor(readonly kind: string) {}

  #log(op: string, ...args: unknown[]): void {
    this.ops.push({ op, args })
  }

  /** Có phải hình đã được vẽ bằng lệnh `op` với tham số đầu tiên khớp không. */
  drew(op: string): boolean {
    return this.ops.some((o) => o.op === op)
  }

  argOf(op: string, index: number): unknown {
    return this.ops.find((o) => o.op === op)?.args[index]
  }

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this.#log2('setPosition', x, y)
  }
  setSize(w: number, h: number): this {
    this.width = w
    this.height = h
    return this.#log2('setSize', w, h)
  }
  setInteractive(): this {
    // `width` chụp TẠI ĐÂY. `setSize()` sau đó chỉ đổi hình, không đụng ô bấm —
    // đúng như `InputPlugin.setHitAreaFromTexture`.
    this.input = { hitArea: new FakeHitArea(this.width, this.height) }
    return this.#log2('setInteractive')
  }
  on(event: string, cb: () => void): this {
    const list = this.handlers.get(event) ?? []
    list.push(cb)
    this.handlers.set(event, list)
    return this
  }
  emit(event: string): void {
    for (const cb of this.handlers.get(event) ?? []) cb()
  }
  destroy(): void {
    this.destroyed = true
    this.#log('destroy')
  }

  setText(t: string): this {
    this.text = t
    return this
  }
  setFontSize(n: number): this {
    this.fontSize = n
    return this
  }
  setResolution(n: number): this {
    this.resolution = n
    return this
  }
  setColor(c: string): this {
    this.color = c
    return this
  }
  setOrigin(x: number, y?: number): this {
    this.originX = x
    this.originY = y ?? x
    return this
  }
  setFillStyle(c: number, a?: number): this {
    this.fillColor = c
    if (a !== undefined) this.fillAlpha = a
    return this.#log2('setFillStyle', c, a)
  }
  setAlpha(a: number): this {
    this.alpha = a
    return this.#log2('setAlpha', a)
  }
  setVisible(v: boolean): this {
    this.visible = v
    return this.#log2('setVisible', v)
  }
  setName(n: string): this {
    return this.#log2('setName', n)
  }
  setDepth(d: number): this {
    return this.#log2('setDepth', d)
  }

  // — Graphics —
  clear(): this {
    return this
  }
  fillStyle(c: number, a: number): this {
    this.fillColor = c
    this.fillAlpha = a
    return this
  }
  lineStyle(w: number, c: number, a: number): this {
    return this.#log2('lineStyle', w, c, a)
  }
  fillRect(x: number, y: number, w: number, h: number): this {
    return this.#log2('fillRect', x, y, w, h)
  }
  fillCircle(x: number, y: number, r: number): this {
    return this.#log2('fillCircle', x, y, r)
  }
  strokeCircle(x: number, y: number, r: number): this {
    return this.#log2('strokeCircle', x, y, r)
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, radius: number): this {
    return this.#log2('fillRoundedRect', x, y, w, h, radius)
  }
  strokeRoundedRect(x: number, y: number, w: number, h: number, radius: number): this {
    return this.#log2('strokeRoundedRect', x, y, w, h, radius)
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    return this.#log2('lineBetween', x1, y1, x2, y2)
  }

  #log2(op: string, ...args: unknown[]): this {
    this.#log(op, ...args)
    return this
  }
}

type FakeTween = {
  targets: FakeGO[]
  duration: number
  alpha: number | undefined
  ease: string
  stopped: boolean
  onComplete: (() => void) | null
}

type FakeScene = {
  added: FakeGO[]
  tweensAdded: FakeTween[]
  killed: FakeGO[]
  scene: Parameters<typeof createHud>[0]
}

function makeScene(): FakeScene {
  const added: FakeGO[] = []
  const tweensAdded: FakeTween[] = []
  const killed: FakeGO[] = []

  const track = (go: FakeGO): FakeGO => {
    added.push(go)
    return go
  }

  const scene = {
    add: {
      text: (_x: number, _y: number, text: string) => {
        const go = track(new FakeGO('text'))
        go.text = text
        return go
      },
      rectangle: (_x: number, _y: number, w: number, h: number, fillColor = 0, fillAlpha = 1) => {
        const go = track(new FakeGO('rectangle'))
        go.width = w
        go.height = h
        go.fillColor = fillColor
        go.fillAlpha = fillAlpha
        return go
      },
      graphics: () => track(new FakeGO('graphics')),
    },
    tweens: {
      add: (cfg: {
        targets: FakeGO | FakeGO[]
        duration: number
        alpha?: number
        ease?: string
        onComplete?: () => void
      }): FakeTween => {
        const tw: FakeTween = {
          targets: Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets],
          duration: cfg.duration,
          alpha: cfg.alpha,
          ease: cfg.ease ?? '',
          stopped: false,
          onComplete: cfg.onComplete ?? null,
        }
        tweensAdded.push(tw)
        return tw
      },
      killTweensOf: (target: FakeGO | FakeGO[]): void => {
        const list = Array.isArray(target) ? target : [target]
        killed.push(...list)
        for (const tw of tweensAdded) {
          if (tw.targets.some((t) => list.includes(t))) tw.stopped = true
        }
      },
    },
  }

  return {
    added,
    tweensAdded,
    killed,
    scene: scene as unknown as Parameters<typeof createHud>[0],
  }
}

const theme = buildTheme('light')
const layout320 = computeLayout(320, 568)
const layoutDesktop = computeLayout(1440, 900)

/** Text của badge `+N` MỚI NHẤT — badge cũ đã bị huỷ vẫn nằm trong `added`. */
function findBadge(s: FakeScene): FakeGO | undefined {
  return s.added.filter((o) => o.kind === 'text' && o.text.startsWith('+')).at(-1)
}

/** Ô chạm 44×44 trong suốt — bánh răng Settings hoặc nút đóng. */
function hitTargets(s: FakeScene): FakeGO[] {
  return s.added.filter((o) => o.kind === 'rectangle' && o.fillAlpha === 0 && o.width >= 44)
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

describe('createHud — thứ tự vẽ', () => {
  it('hai thẻ nền được add TRƯỚC bốn Text, nếu không thẻ phủ kín con số', () => {
    const s = makeScene()
    createHud(s.scene, theme, layout320, {
      getLocale: () => 'en',
      getStrings: () => en,
      onSettings: () => {},
    })

    const cardIdx = s.added
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => o.kind === 'rectangle' && o.fillColor === theme.board)
      .map(({ i }) => i)
    const textIdx = s.added.map((o, i) => ({ o, i })).filter(({ o }) => o.kind === 'text').map(({ i }) => i)

    expect(cardIdx).toHaveLength(2)
    expect(textIdx).toHaveLength(4)
    // Display list của Phaser vẽ theo thứ tự add: thẻ phải nằm TRƯỚC chữ.
    expect(Math.max(...cardIdx)).toBeLessThan(Math.min(...textIdx))
  })
})

describe('createHud — vòng đời badge', () => {
  function hud(s: FakeScene) {
    return createHud(s.scene, theme, layout320, {
      getLocale: () => 'en',
      getStrings: () => en,
      onSettings: () => {},
    })
  }

  it('delta dương tạo badge và tween đúng 600 ms (§B5 `--dur-badge`)', () => {
    const s = makeScene()
    hud(s).setScore(16, 4)
    const badge = findBadge(s)
    expect(badge).toBeDefined()
    expect(badge?.text).toBe('+4')
    expect(s.tweensAdded.at(-1)?.duration).toBe(600)
  })

  it('delta ≤ 0 hoặc null KHÔNG tạo badge', () => {
    const s = makeScene()
    const h = hud(s)
    const before = s.added.length
    h.setScore(16, 0)
    h.setScore(16, -4)
    h.setScore(16, null)
    expect(s.added.length).toBe(before)
  })

  it('setReducedMotion(true) huỷ badge đang bay', () => {
    const s = makeScene()
    const h = hud(s)
    h.setScore(16, 4)
    const badge = findBadge(s)
    expect(badge).toBeDefined()
    h.setReducedMotion(true)
    expect(badge?.destroyed).toBe(true)
    expect(s.killed).toContain(badge)
  })

  it('setReducedMotion(true) rồi thì không tạo badge nữa', () => {
    const s = makeScene()
    const h = hud(s)
    h.setReducedMotion(true)
    const before = s.added.length
    h.setScore(32, 16)
    expect(s.added.length).toBe(before)
  })

  it('relayout xoá badge đang bay vì tween của nó giữ toạ độ cũ', () => {
    const s = makeScene()
    const h = hud(s)
    h.setScore(16, 4)
    const badge = findBadge(s)
    expect(badge).toBeDefined()
    h.relayout(layoutDesktop)
    expect(badge?.destroyed).toBe(true)
  })

  it('badge thứ hai huỷ badge thứ nhất, không để tween cũ giết badge mới', () => {
    const s = makeScene()
    const h = hud(s)
    h.setScore(16, 4)
    const first = findBadge(s)
    h.setScore(32, 16)
    const second = findBadge(s)
    expect(first?.destroyed).toBe(true)
    expect(second).not.toBe(first)
    expect(second?.destroyed).toBe(false)
    // Tween cũ đã bị gỡ, nên `onComplete` của nó không thể chạy.
    expect(s.tweensAdded[0]?.stopped).toBe(true)
  })
})

describe('createHud — bánh răng Settings (§B8:222)', () => {
  it('có ô chạm 44×44 và gọi callback khi bấm', () => {
    const s = makeScene()
    const hits: number[] = []
    createHud(s.scene, theme, layout320, {
      getLocale: () => 'en',
      getStrings: () => en,
      onSettings: () => hits.push(1),
    })

    const gear = hitTargets(s)
    expect(gear).toHaveLength(1)
    expect(gear[0]?.width).toBe(GEAR_SIZE)
    expect(gear[0]?.height).toBe(GEAR_SIZE)
    expect(gear[0]?.input?.hitArea.width).toBe(GEAR_SIZE)

    gear[0]?.emit('pointerup')
    expect(hits).toEqual([1])
  })

  it('nằm ở cuối hàng HUD, không đè lên thẻ BEST', () => {
    const s = makeScene()
    createHud(s.scene, theme, layout320, {
      getLocale: () => 'en',
      getStrings: () => en,
      onSettings: () => {},
    })
    const gear = hitTargets(s)[0]
    const bestCard = s.added.filter((o) => o.kind === 'rectangle' && o.fillColor === theme.board)[1]
    expect(gear).toBeDefined()
    expect(bestCard).toBeDefined()
    const bestRight = (bestCard?.x ?? 0) + (bestCard?.width ?? 0) / 2
    const gearLeft = (gear?.x ?? 0) - (gear?.width ?? 0) / 2
    expect(gearLeft).toBeGreaterThanOrEqual(bestRight)
  })

  it('hudCardsWidth chừa đủ chỗ cho bánh răng, và không chừa thừa', () => {
    const room = hudCardsWidth(400)
    expect(room).toBeLessThanOrEqual(400 - GEAR_SIZE)
    expect(room).toBeGreaterThan(400 - GEAR_SIZE - 16)
    expect(hudCardsWidth(10)).toBe(0)
  })

  it('bánh răng vừa trong hàng HUD ở mọi viewport thử được', () => {
    for (let w = 280; w <= 1600; w += 37) {
      for (let h = 280; h <= 1200; h += 53) {
        const l = computeLayout(w, h)
        expect(l.boardY - l.hudY, `hàng HUD ${w}×${h}`).toBeGreaterThanOrEqual(GEAR_SIZE)
      }
    }
  })

  it('đổi layout thì bánh răng đi theo, vẫn nằm trong màn hình', () => {
    const s = makeScene()
    const hud = createHud(s.scene, theme, layout320, {
      getLocale: () => 'en',
      getStrings: () => en,
      onSettings: () => {},
    })
    const gear = hitTargets(s)[0]
    const at320 = gear?.x ?? 0
    hud.relayout(layoutDesktop)
    expect(gear?.x ?? 0).toBeGreaterThan(at320)
    expect((gear?.x ?? 0) + GEAR_SIZE / 2).toBeLessThanOrEqual(layoutDesktop.width)
  })
})

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function dialogs(s: FakeScene, at: Layout, actions: string[], reduced = false) {
  const d = createDialogs(s.scene, theme, at, {
    getStrings: () => en,
    getLocale: () => 'en',
    onAction: (a) => actions.push(a),
  })
  if (reduced) d.setReducedMotion(true)
  return d
}

/** Hai nút hành động — hình chữ nhật tô `--btn`. */
function actionButtons(s: FakeScene): FakeGO[] {
  return s.added.filter((o) => o.kind === 'rectangle' && o.fillColor === theme.btn)
}

describe('createDialogs — nút đóng (§B8:415 "Esc and the close button")', () => {
  it('có nút đóng 44×44 phát action `close`, không phải code chết', () => {
    const s = makeScene()
    const actions: string[] = []
    dialogs(s, layout320, actions).open('win', { score: 8, best: 8 })

    const close = hitTargets(s)
    expect(close).toHaveLength(1)
    expect(close[0]?.width).toBe(44)
    close[0]?.emit('pointerup')
    expect(actions).toEqual(['close'])
  })

  it('Esc (Task 13) và nút đóng dùng chung một action', () => {
    const s = makeScene()
    const actions: string[] = []
    const d = dialogs(s, layout320, actions)
    d.open('gameover', { score: 8, best: 8 })
    hitTargets(s)[0]?.emit('pointerup')
    expect(actions).toEqual(['close'])
    // Nơi gọi tự quyết định đóng; `close()` chỉ được gọi một lần.
    d.close()
    expect(d.isOpen).toBe(false)
  })
})

describe('createDialogs — hiệu ứng mờ vào (§B5:181, `--dur-overlay`)', () => {
  it('open() tween alpha 0→1 trong 800 ms', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [])
    d.open('win', { score: 8, best: 8 })
    const tw = s.tweensAdded.at(-1)
    expect(tw?.duration).toBe(800)
    expect(tw?.alpha).toBe(1)
    expect(tw?.targets.length).toBeGreaterThan(1)
  })

  it('giảm chuyển động rút còn 200 ms (§B11:300)', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [], true)
    d.open('win', { score: 8, best: 8 })
    expect(s.tweensAdded.at(-1)?.duration).toBe(200)
  })

  it('close() khi giảm chuyển động thì cắt thẳng, không tween', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [], true)
    d.open('win', { score: 8, best: 8 })
    const before = s.tweensAdded.length
    d.close()
    expect(s.tweensAdded.length).toBe(before)
    expect(s.added.every((o) => !o.visible)).toBe(true)
  })

  it('setReducedMotion(true) khi đang mở thì hiện ngay, không lửng lơ giữa chừng', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [])
    d.open('win', { score: 8, best: 8 })
    d.setReducedMotion(true)
    expect(s.added.every((o) => o.alpha === 1)).toBe(true)
    expect(d.isOpen).toBe(true)
  })

  it('destroy() gỡ tween của mọi target', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [])
    d.open('win', { score: 8, best: 8 })
    d.destroy()
    expect(s.killed.length).toBeGreaterThan(1)
  })
})

describe('createDialogs — card §B8:416 (radius 16, `--shadow-float`)', () => {
  it('card bo góc 16 px', () => {
    const s = makeScene()
    dialogs(s, layout320, [])
    const radius = s.added
      .filter((o) => o.kind === 'graphics')
      .map((o) => o.argOf('fillRoundedRect', 4))
      .find((r) => r === CARD_RADIUS)
    expect(CARD_RADIUS).toBe(16)
    expect(radius).toBe(16)
  })

  it('có lớp bóng phía sau card, lệch xuống theo `--shadow-float`', () => {
    const s = makeScene()
    dialogs(s, layout320, [])
    const graphics = s.added.filter((o) => o.kind === 'graphics')
    const withShadow = graphics.filter((o) => o.drew('fillRoundedRect'))
    expect(withShadow.length).toBeGreaterThanOrEqual(2) // bóng + card
    const [shadow, card] = withShadow
    // Quãng đổ xuống phải bằng đúng `0 8px` của token `--shadow-float`.
    expect(SHADOW_DY).toBe(8)
    // Display list vẽ theo thứ tự add: bóng phải TRƯỚC card mới nằm dưới.
    expect(s.added.indexOf(shadow!)).toBeLessThan(s.added.indexOf(card!))
    // Bóng đổ xuống: mép trên của nó thấp hơn mép trên card đúng `SHADOW_DY`.
    const shadowTop = shadow!.argOf('fillRoundedRect', 1) as number
    const cardTop = card!.argOf('fillRoundedRect', 1) as number
    expect(shadowTop).toBeCloseTo(cardTop + SHADOW_DY)
  })

  it('card có viền để giữ hình dạng khi mặt thẻ trùng màu nền (theme tương phản cao)', () => {
    const s = makeScene()
    dialogs(s, layout320, [])
    const stroked = s.added.filter((o) => o.kind === 'graphics' && o.drew('strokeRoundedRect'))
    expect(stroked).toHaveLength(1)
    expect(stroked[0]?.argOf('lineStyle', 0)).toBe(theme.hairlineWidth)
  })
})

describe('createDialogs — ô bấm nút hành động', () => {
  it('ô bấm rộng bằng bề ngang thật của nút ngay từ đầu', () => {
    const s = makeScene()
    dialogs(s, layout320, []).open('win', { score: 8, best: 8 })
    const btns = actionButtons(s)
    expect(btns).toHaveLength(2)
    for (const b of btns) {
      expect(b.input?.hitArea.width).toBe(b.width)
      expect(b.width).toBeCloseTo(Math.min(320 * 0.88, DIALOG_MAX_W) - 40)
    }
  })

  it('đổi layout thì ô bấm theo kịp bề ngang mới', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [])
    d.open('win', { score: 8, best: 8 })
    const btn = actionButtons(s)[0]
    const wide = btn?.input?.hitArea.width ?? 0
    expect(wide).toBeGreaterThan(0)

    // Không có `syncHitArea` thì ô bấm giữ nguyên bề ngang cũ và người chơi
    // bấm trượt ở hai mép nút.
    d.relayout(layoutDesktop)
    const after = actionButtons(s)[0]
    expect(after).toBe(btn)
    expect(after?.width).toBeCloseTo(DIALOG_MAX_W - 40)
    expect(after?.input?.hitArea.width).toBeCloseTo(DIALOG_MAX_W - 40)
    expect(after?.input?.hitArea.width).toBeGreaterThan(wide)
  })

  it('mỗi nút một hành động, không nút nào là thoát game', () => {
    const s = makeScene()
    const actions: string[] = []
    dialogs(s, layout320, actions).open('win', { score: 8, best: 8 })
    const btns = actionButtons(s)
    btns[0]?.emit('pointerup')
    btns[1]?.emit('pointerup')
    expect(actions).toEqual(['keep-playing', 'new-game'])
  })

  it('gameover chỉ có một nút hành động, cộng nút đóng', () => {
    const s = makeScene()
    dialogs(s, layout320, []).open('gameover', { score: 8, best: 8 })
    expect(actionButtons(s)).toHaveLength(1)
    expect(hitTargets(s)).toHaveLength(1)
  })
})

describe('createDialogs — vòng đời', () => {
  it('đóng lúc đầu, mở thì isOpen, close() thì thôi', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [])
    expect(d.isOpen).toBe(false)
    d.open('win', { score: 8, best: 8 })
    expect(d.isOpen).toBe(true)
    d.close()
    expect(d.isOpen).toBe(false)
  })

  it('mở lại thì dựng lại nút, không chồng nút cũ', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [])
    d.open('win', { score: 8, best: 8 })
    const first = actionButtons(s)
    d.close()
    d.open('gameover', { score: 8, best: 8 })
    expect(first.every((b) => b.destroyed)).toBe(true)
    expect(actionButtons(s).filter((b) => !b.destroyed)).toHaveLength(1)
  })

  it('destroy() dọn sạch mọi hình đã add', () => {
    const s = makeScene()
    const d = dialogs(s, layout320, [])
    d.open('win', { score: 8, best: 8 })
    d.destroy()
    expect(s.added.every((o) => o.destroyed)).toBe(true)
  })
})

describe('createDialogs — không phải bản DOM', () => {
  it('không tạo phần tử DOM nào; đây là hình vẽ trong canvas', () => {
    const s = makeScene()
    const before = document.body.childElementCount
    const d = dialogs(s, layout320, [])
    d.open('win', { score: 8, best: 8 })
    expect(document.body.childElementCount).toBe(before)
  })
})
