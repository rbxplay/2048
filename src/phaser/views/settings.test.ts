import { describe, expect, it, vi } from 'vitest'
import type { SaveSettings, ThemeName } from '../../game/persist'
import * as i18n from '../../i18n'
import { computeLayout, type Layout } from '../layout'
import { buildTheme, type PhaserTheme } from '../theme'
import { hexFromInt } from './canvas'
import {
  createSettings,
  settingsCardBox,
  sliderRatio,
  snapVolume,
  TOGGLE_SIZE,
  type Settings,
} from './settings'

/**
 * Cùng cách xử như `views.test.ts`: bản ESM của Phaser 4 dò tính năng canvas
 * ngay lúc import nên không boot nổi trong jsdom. `settings.ts` chỉ dùng Phaser ở
 * vị trí KIỂU, nhưng nó nhập hằng số từ `dialogs.ts` — mà tệp đó
 * `import Phaser from 'phaser'` dạng giá trị. Nên vẫn phải thay engine bằng một
 * `scene` giả, y như `views.test.ts` làm cho HUD và dialogs.
 */
vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }))

type Op = { op: string; args: unknown[] }

/** `input.hitArea` của Phaser có `setSize`; `syncHitArea` dựa vào đúng điều đó. */
type FakeHitArea = {
  width: number
  height: number
  setSize(w: number, h: number): void
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
  resolution = 0
  // Phaser mặc định gốc ở TÂM cho `Text`, `Rectangle` và `Arc`; giả đúng như vậy,
  // nếu không thì bài kiểm về gốc toạ độ bên dưới là bài kiểm rỗng.
  originX = 0.5
  originY = 0.5
  fillColor = 0
  fillAlpha = 1
  destroyed = false
  input: { hitArea: FakeHitArea } | null = null
  readonly ops: Op[] = []
  readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>()

  constructor(readonly kind: string) {}

  #log(op: string, ...args: unknown[]): this {
    this.ops.push({ op, args })
    return this
  }

  /** Đếm số lần gọi `op` — dùng cho glyph tick của toggle. */
  countOf(op: string): number {
    return this.ops.filter((o) => o.op === op).length
  }

  argOf(op: string, index: number): unknown {
    return this.ops.find((o) => o.op === op)?.args[index]
  }

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this.#log('setPosition', x, y)
  }
  setSize(w: number, h: number): this {
    this.width = w
    this.height = h
    return this.#log('setSize', w, h)
  }
  setInteractive(): this {
    // `width`/`height` chụp TẠI ĐÂY, đúng như `InputPlugin.setHitAreaFromTexture`:
    // gọi `setSize()` sau đó chỉ đổi hình, không đụng ô bấm — trừ khi có
    // `syncHitArea` đồng bộ lại.
    const self = this
    this.input = {
      hitArea: {
        width: this.width,
        height: this.height,
        setSize(w: number, h: number): void {
          self.input!.hitArea.width = w
          self.input!.hitArea.height = h
        },
      },
    }
    return this.#log('setInteractive')
  }
  on(event: string, cb: (...args: unknown[]) => void): this {
    const list = this.handlers.get(event) ?? []
    list.push(cb)
    this.handlers.set(event, list)
    return this
  }
  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args)
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
    return this.#log('setFillStyle', c, a)
  }
  setAlpha(a: number): this {
    this.alpha = a
    return this.#log('setAlpha', a)
  }
  setVisible(v: boolean): this {
    this.visible = v
    return this.#log('setVisible', v)
  }

  // — Graphics —
  /** `Graphics.clear()` xoá sạch lệnh vẽ đã ghi; mô phỏng đúng như vậy. */
  clear(): this {
    this.ops.length = 0
    return this
  }
  fillStyle(c: number, a: number): this {
    this.fillColor = c
    this.fillAlpha = a
    return this
  }
  lineStyle(w: number, c: number, a: number): this {
    return this.#log('lineStyle', w, c, a)
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, radius: number): this {
    return this.#log('fillRoundedRect', x, y, w, h, radius)
  }
  strokeRoundedRect(x: number, y: number, w: number, h: number, radius: number): this {
    return this.#log('strokeRoundedRect', x, y, w, h, radius)
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    return this.#log('lineBetween', x1, y1, x2, y2)
  }
}

type FakeTween = {
  targets: FakeGO[]
  duration: number
  alpha: number | undefined
  stopped: boolean
  onComplete: (() => void) | null
  /** Chạy tween tới cuối: áp alpha đích rồi gọi `onComplete`. */
  fire(): void
}

type FakeScene = {
  added: FakeGO[]
  tweensAdded: FakeTween[]
  killed: FakeGO[]
  draggable: { go: FakeGO; on: boolean }[]
  scene: Parameters<typeof createSettings>[0]
}

function makeScene(): FakeScene {
  const added: FakeGO[] = []
  const tweensAdded: FakeTween[] = []
  const killed: FakeGO[] = []
  const draggable: { go: FakeGO; on: boolean }[] = []

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
      circle: (_x: number, _y: number, radius: number, fillColor = 0) => {
        const go = track(new FakeGO('circle'))
        go.width = radius * 2
        go.height = radius * 2
        go.fillColor = fillColor
        return go
      },
      graphics: () => track(new FakeGO('graphics')),
    },
    tweens: {
      add: (cfg: {
        targets: FakeGO | FakeGO[]
        duration: number
        alpha?: number
        onComplete?: () => void
      }): FakeTween => {
        const tw: FakeTween = {
          targets: Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets],
          duration: cfg.duration,
          alpha: cfg.alpha,
          stopped: false,
          onComplete: cfg.onComplete ?? null,
          fire(): void {
            if (tw.stopped) return
            if (tw.alpha !== undefined) for (const target of tw.targets) target.setAlpha(tw.alpha)
            tw.onComplete?.()
          },
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
    input: {
      setDraggable: (go: FakeGO, on = true): void => {
        draggable.push({ go, on })
      },
    },
  }

  return {
    added,
    tweensAdded,
    killed,
    draggable,
    scene: scene as unknown as Parameters<typeof createSettings>[0],
  }
}

const layoutPhone = computeLayout(320, 568)
const layoutDesktop = computeLayout(1440, 900)

const baseSave: SaveSettings = {
  haptics: true,
  reducedMotion: false,
  dpad: 'auto',
  theme: 'light',
  sfxVolume: 0.7,
}

function makePanel(
  at: Layout = layoutPhone,
  strings: typeof i18n.en = i18n.en,
  theme: PhaserTheme = buildTheme('light'),
): { s: FakeScene; panel: Settings; patches: Partial<SaveSettings>[] } {
  const s = makeScene()
  const patches: Partial<SaveSettings>[] = []
  const panel = createSettings(s.scene, theme, at, {
    getStrings: () => strings,
    onChange: (p) => patches.push(p),
  })
  return { s, panel, patches }
}

/** Mọi hình đang nhận input — tức mọi thứ người chơi chạm được. */
function hitTargets(s: FakeScene): FakeGO[] {
  return s.added.filter((o) => o.input !== null)
}

/** Bề mặt toggle: `Graphics` duy nhất vẽ hình bo góc bán kính 8 (§B6 nút icon). */
function toggleFace(s: FakeScene): FakeGO | undefined {
  return s.added.filter((o) => o.kind === 'graphics').find((o) => o.argOf('fillRoundedRect', 4) === 8)
}

function textNamed(s: FakeScene, value: string): FakeGO | undefined {
  return s.added.filter((o) => o.kind === 'text').find((o) => o.text === value)
}

/** Ô chạm của hai toggle: đúng 44×44. Ô kéo slider rộng 200 nên không lọt lưới. */
function toggleHits(s: FakeScene): FakeGO[] {
  return hitTargets(s).filter((o) => o.width === TOGGLE_SIZE && o.height === TOGGLE_SIZE)
}

function themeButton(s: FakeScene): FakeGO | undefined {
  return hitTargets(s).find((o) => o.height === 48 && o.width < 200)
}

/** Ô kéo của slider: hình trong suốt cao 44, rộng hơn hẳn ô toggle. */
function sliderTrack(s: FakeScene): FakeGO | undefined {
  return hitTargets(s).find((o) => o.kind === 'rectangle' && o.height === 44 && o.width > TOGGLE_SIZE)
}

function closeButton(s: FakeScene): FakeGO | undefined {
  return hitTargets(s)
    .filter((o) => o.height === 48)
    .sort((a, b) => b.width - a.width)[0]
}

/** Mặt card: `Graphics` vẽ hình bo góc 16 ở alpha 1 (bóng cũng bo 16 nhưng alpha thấp). */
function cardFace(s: FakeScene): FakeGO | undefined {
  return s.added
    .filter((o) => o.kind === 'graphics')
    .find((o) => o.argOf('fillRoundedRect', 4) === 16 && o.fillAlpha === 1)
}

/**
 * Phát sự kiện `drag` ĐÚNG ngữ nghĩa Phaser.
 *
 * Tham số thứ hai của sự kiện `drag` **không phải** toạ độ con trỏ: nó là vị trí
 * của CHÍNH đối tượng đang bị kéo. `InputPlugin.processDragMoveEvent` chốt lúc
 * bắt đầu kéo `input.dragX = pointer.x - gameObject.x`, rồi mỗi lần di chuyển
 * phát ra `dragX = pointer.x - input.dragX`, tức
 * `gameObject.x + (pointer.x - downX)`.
 *
 * Bộ mô phỏng phải tái tạo đúng công thức đó, nếu không thì test sẽ mã hoá một
 * giả định sai và bảo vệ chính cái lỗi nó định bắt.
 */
function emitPhaserDrag(hit: FakeGO, pointerX: number, downX: number): void {
  hit.emit('drag', { x: pointerX }, hit.x + (pointerX - downX))
}

// ---------------------------------------------------------------------------
// Hàm thuần: quy đổi vị trí con trỏ → mức âm lượng
// ---------------------------------------------------------------------------

describe('sliderRatio — vị trí con trỏ thành tỉ lệ 0..1', () => {
  it('kẹp trong [0, 1] ở cả hai đầu và ngoài rãnh', () => {
    expect(sliderRatio(100, 100, 200)).toBe(0)
    expect(sliderRatio(300, 100, 200)).toBe(1)
    expect(sliderRatio(0, 100, 200)).toBe(0)
    expect(sliderRatio(9999, 100, 200)).toBe(1)
    expect(sliderRatio(200, 100, 200)).toBe(0.5)
  })

  it('đầu vào không hữu hạn hoặc rãnh rộng 0 trả 0, không trả NaN', () => {
    const cases: [number, number, number][] = [
      [Number.NaN, 100, 200],
      [Number.POSITIVE_INFINITY, 100, 200],
      [200, Number.NaN, 200],
      [200, 100, 0],
      [200, 100, -5],
    ]
    for (const [x, left, w] of cases) {
      const r = sliderRatio(x, left, w)
      expect(Number.isFinite(r), `${x}/${left}/${w}`).toBe(true)
      expect(r, `${x}/${left}/${w}`).toBe(0)
    }
  })
})

describe('snapVolume — bám bước 0.05 và không rời khỏi [0, 1]', () => {
  it('bám về bước 1/20', () => {
    expect(snapVolume(0.7)).toBe(0.7)
    expect(snapVolume(0.73)).toBe(0.75)
    expect(snapVolume(0.72)).toBe(0.7)
    expect(snapVolume(0)).toBe(0)
    expect(snapVolume(1)).toBe(1)
  })

  it('kẹp giá trị ngoài khoảng và đầu vào hỏng', () => {
    expect(snapVolume(-3)).toBe(0)
    expect(snapVolume(4)).toBe(1)
    expect(snapVolume(Number.NaN)).toBe(0)
  })

  it('mọi bước đều nằm trong [0, 1] — giá trị đi thẳng vào save', () => {
    for (let i = -40; i <= 40; i++) {
      const v = snapVolume(i / 40)
      expect(v, `i=${i}`).toBeGreaterThanOrEqual(0)
      expect(v, `i=${i}`).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Bố cục — hàm thuần
// ---------------------------------------------------------------------------

describe('settingsCardBox — card không bao giờ rộng hơn viewport (§B8)', () => {
  it('bề ngang theo §B8 `min(88vw, 420px)`, không phải một hằng số', () => {
    expect(settingsCardBox(computeLayout(320, 568)).w).toBeCloseTo(320 * 0.88)
    expect(settingsCardBox(computeLayout(1440, 900)).w).toBe(420)
  })

  it('quét toàn bộ viewport: card vừa bề ngang, hàng không thấp hơn 44 px', () => {
    for (let w = 280; w <= 1600; w += 29) {
      for (let h = 280; h <= 1200; h += 47) {
        const l = computeLayout(w, h)
        const box = settingsCardBox(l)
        expect(box.w, `rộng ${w}×${h}`).toBeLessThanOrEqual(l.width)
        // A11Y-07 — sàn ô chạm thắng, kể cả khi card phải cao hơn viewport.
        expect(box.rowH, `hàng ${w}×${h}`).toBeGreaterThanOrEqual(44)
        expect(box.h, `cao ${w}×${h}`).toBeGreaterThanOrEqual(box.rowH * 4)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Vòng đời
// ---------------------------------------------------------------------------

describe('createSettings — vòng đời', () => {
  it('đóng và ẩn ngay lúc dựng, chưa vẽ gì lên màn hình', () => {
    const { s, panel } = makePanel()
    expect(panel.isOpen).toBe(false)
    expect(s.added.length).toBeGreaterThan(0)
    expect(s.added.every((o) => !o.visible)).toBe(true)
  })

  it('open() thì isOpen và mọi hình hiện ra; close() mờ dần rồi ẩn', () => {
    const { s, panel } = makePanel()
    panel.open(baseSave, () => {})
    expect(panel.isOpen).toBe(true)
    expect(s.added.every((o) => o.visible)).toBe(true)

    panel.close()
    expect(panel.isOpen).toBe(false)
    // §B8 xếp Settings vào nhóm dialog/overlay: đóng bằng cách mờ dần theo
    // `--dur-overlay`, ẩn hẳn khi tween chạy xong.
    const fade = s.tweensAdded.at(-1)
    expect(fade?.alpha).toBe(0)
    expect(fade?.duration).toBe(800)
    fade?.fire()
    expect(s.added.every((o) => !o.visible)).toBe(true)
  })

  it('nút Close đóng panel và gọi onClose', () => {
    const { s, panel } = makePanel()
    let closed = 0
    panel.open(baseSave, () => {
      closed += 1
    })
    const close = closeButton(s)
    expect(close).toBeDefined()
    close?.emit('pointerup')
    expect(closed).toBe(1)
    expect(panel.isOpen).toBe(false)
  })

  it('destroy() huỷ mọi hình và nhả ô kéo của slider', () => {
    const { s, panel } = makePanel()
    panel.open(baseSave, () => {})
    panel.destroy()
    expect(s.added.every((o) => o.destroyed)).toBe(true)
    expect(s.draggable.at(-1)?.on).toBe(false)
  })

  it('không dựng phần tử DOM nào — đây là hình vẽ trong canvas', () => {
    const before = document.body.childElementCount
    const { panel } = makePanel()
    panel.open(baseSave, () => {})
    expect(document.body.childElementCount).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// A11Y-07 — ô chạm ≥ 44×44
// ---------------------------------------------------------------------------

describe('createSettings — ô chạm ≥ 44×44 (A11Y-07, §12.3)', () => {
  it('mọi hình nhận input đều đạt 44 px ở CẢ HAI chiều, ô bấm khớp hình', () => {
    const { s, panel } = makePanel()
    panel.open(baseSave, () => {})
    const hits = hitTargets(s)
    expect(hits.length).toBeGreaterThanOrEqual(5)
    for (const h of hits) {
      expect(h.width, `${h.kind} rộng`).toBeGreaterThanOrEqual(44)
      expect(h.height, `${h.kind} cao`).toBeGreaterThanOrEqual(44)
      // Ô bấm của Phaser đo lúc `setInteractive`; lệch khỏi hình là bấm trượt.
      expect(h.input?.hitArea.width, `${h.kind} hitArea rộng`).toBe(h.width)
      expect(h.input?.hitArea.height, `${h.kind} hitArea cao`).toBe(h.height)
    }
  })

  it('ô chạm của hai toggle đúng 44×44, và vẫn đạt sau khi đổi layout', () => {
    const { s, panel } = makePanel(layoutDesktop)
    panel.open(baseSave, () => {})
    expect(toggleHits(s)).toHaveLength(2)
    panel.relayout(layoutPhone)
    for (const h of toggleHits(s)) {
      expect(h.width).toBe(TOGGLE_SIZE)
      expect(h.height).toBe(TOGGLE_SIZE)
      expect(h.input?.hitArea.width).toBe(TOGGLE_SIZE)
      expect(h.input?.hitArea.height).toBe(TOGGLE_SIZE)
    }
  })

  it('nút Close rộng theo lòng card: đổi layout thì hình VÀ ô bấm cùng đổi', () => {
    const { s, panel } = makePanel(layoutDesktop)
    panel.open(baseSave, () => {})
    const close = closeButton(s)
    const wide = close?.width ?? 0
    expect(wide).toBeGreaterThan(0)

    panel.relayout(layoutPhone)
    expect(close?.width).toBeLessThan(wide)
    // Không đồng bộ lại `hitArea` thì nút chỉ còn bấm trúng một điểm ảnh.
    expect(close?.input?.hitArea.width).toBe(close?.width)
    expect(close?.input?.hitArea.height).toBe(close?.height)
  })

  it('mọi Text đều gọi setResolution theo devicePixelRatio', () => {
    const { s, panel } = makePanel()
    panel.open(baseSave, () => {})
    const texts = s.added.filter((o) => o.kind === 'text')
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) expect(t.resolution).toBe(window.devicePixelRatio || 1)
  })

  it('không chữ nào nhỏ hơn sàn 11 px của §B2', () => {
    const { s, panel } = makePanel(computeLayout(280, 400))
    panel.open(baseSave, () => {})
    for (const t of s.added.filter((o) => o.kind === 'text')) {
      expect(t.fontSize, t.text).toBeGreaterThanOrEqual(11)
    }
  })
})

// ---------------------------------------------------------------------------
// Slider SFX
// ---------------------------------------------------------------------------

describe('createSettings — slider SFX (§A9: chỉ có slider, không mute tổng)', () => {
  it('chạm/kéo sang trái rãnh cho 0, sang phải cho 1', () => {
    const { s, panel, patches } = makePanel()
    panel.open(baseSave, () => {})
    const hit = sliderTrack(s)
    expect(hit).toBeDefined()
    const left = (hit?.x ?? 0) - (hit?.width ?? 0) / 2

    hit?.emit('pointerdown', { x: left - 500 })
    expect(patches.at(-1)).toEqual({ sfxVolume: 0 })

    hit?.emit('pointerdown', { x: left + (hit?.width ?? 0) + 500 })
    expect(patches.at(-1)).toEqual({ sfxVolume: 1 })
  })

  it('drag cũng bị kẹp trong [0, 1] và bám bước 0.05', () => {
    const { s, panel, patches } = makePanel()
    panel.open(baseSave, () => {})
    const hit = sliderTrack(s)
    const left = (hit?.x ?? 0) - (hit?.width ?? 0) / 2
    const w = hit?.width ?? 0

    emitPhaserDrag(hit!, left + w * 0.33, left + w * 0.3)
    expect(patches.at(-1)?.sfxVolume).toBe(0.35)

    emitPhaserDrag(hit!, left - 500, left)
    expect(patches.at(-1)?.sfxVolume).toBe(0)

    emitPhaserDrag(hit!, left + w + 500, left)
    expect(patches.at(-1)?.sfxVolume).toBe(1)

    hit?.emit('drag', { x: Number.NaN }, Number.NaN)
    expect(patches.at(-1)?.sfxVolume).toBe(0)
  })

  it('lần di chuyển ĐẦU không nhảy: bám vị trí con trỏ, không bám dragX', () => {
    const { s, panel, patches } = makePanel()
    panel.open({ ...baseSave, sfxVolume: 0 }, () => {})
    const hit = sliderTrack(s)
    const left = (hit?.x ?? 0) - (hit?.width ?? 0) / 2
    const w = hit?.width ?? 0
    const knob = (): FakeGO | undefined => s.added.find((o) => o.kind === 'circle')

    // Bấm ở một điểm bất kỳ trên dải rồi kéo. Ô kéo nằm GIỮA dải (x = left + 100),
    // nên nếu ai lấy thẳng `dragX` làm toạ độ tuyệt đối thì mọi ca dưới đây đều
    // cho ~0.5 — âm lượng nhảy về giữa rãnh ngay lần di chuyển đầu.
    const cases: ReadonlyArray<readonly [number, number]> = [
      [0.05, 0.05],
      [0.2, 0.25],
      [0.8, 0.85],
      [1, 1],
    ]
    for (const [down, move] of cases) {
      hit?.emit('pointerdown', { x: left + w * down })
      expect(patches.at(-1)?.sfxVolume, `bấm ở ${down}`).toBe(down)

      emitPhaserDrag(hit!, left + w * move, left + w * down)
      expect(patches.at(-1)?.sfxVolume, `bấm ${down} kéo tới ${move}`).toBe(move)
      expect(knob()?.x, `con trượt ở ${move}`).toBeCloseTo(left + w * move)
    }
  })

  it('open() đặt con trượt đúng theo sfxVolume hiện tại', () => {
    const { s, panel } = makePanel()
    const knob = (): FakeGO | undefined => s.added.find((o) => o.kind === 'circle')
    panel.open({ ...baseSave, sfxVolume: 0 }, () => {})
    const at0 = knob()?.x ?? 0
    panel.open({ ...baseSave, sfxVolume: 1 }, () => {})
    expect(knob()?.x ?? 0).toBeGreaterThan(at0)

    // Con trượt không được rời khỏi bề ngang màn hình ở mọi mức âm lượng.
    for (const v of [0, 0.33, 0.7, 1]) {
      panel.open({ ...baseSave, sfxVolume: v }, () => {})
      const x = knob()?.x ?? -1
      expect(x, `mức ${v}`).toBeGreaterThanOrEqual(0)
      expect(x, `mức ${v}`).toBeLessThanOrEqual(layoutPhone.width)
    }
  })

  it('không phát ra khoá nào ngoài bốn khoá cài đặt — không có mute tổng', () => {
    const { s, panel, patches } = makePanel()
    panel.open(baseSave, () => {})
    sliderTrack(s)?.emit('pointerdown', { x: 0 })
    for (const t of toggleHits(s)) t.emit('pointerup')
    themeButton(s)?.emit('pointerup')

    expect(patches.length).toBeGreaterThan(0)
    const allowed = new Set(['sfxVolume', 'haptics', 'reducedMotion', 'theme'])
    for (const p of patches) {
      for (const key of Object.keys(p)) expect(allowed.has(key), key).toBe(true)
    }
    expect(patches.flatMap((p) => Object.keys(p))).not.toContain('muted')
  })
})

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

describe('createSettings — hai toggle (haptics, reduced motion)', () => {
  it('chạm toggle đầu đảo haptics và phát đúng patch', () => {
    const { s, panel, patches } = makePanel()
    panel.open({ ...baseSave, haptics: true }, () => {})
    const [hapticsHit] = toggleHits(s)
    hapticsHit?.emit('pointerup')
    expect(patches.at(-1)).toEqual({ haptics: false })
    hapticsHit?.emit('pointerup')
    expect(patches.at(-1)).toEqual({ haptics: true })
  })

  it('chạm toggle thứ hai đảo reducedMotion, không đụng haptics', () => {
    const { s, panel, patches } = makePanel()
    panel.open({ ...baseSave, reducedMotion: false }, () => {})
    toggleHits(s)[1]?.emit('pointerup')
    expect(patches.at(-1)).toEqual({ reducedMotion: true })
  })

  it('trạng thái bật hiện bằng glyph tick, không chỉ bằng màu', () => {
    const off = makePanel()
    off.panel.open({ ...baseSave, haptics: false, reducedMotion: false }, () => {})
    expect(toggleFace(off.s)?.countOf('lineBetween')).toBe(0)

    const on = makePanel()
    on.panel.open({ ...baseSave, haptics: true, reducedMotion: true }, () => {})
    expect(toggleFace(on.s)?.countOf('lineBetween')).toBe(4)

    const one = makePanel()
    one.panel.open({ ...baseSave, haptics: true, reducedMotion: false }, () => {})
    expect(toggleFace(one.s)?.countOf('lineBetween')).toBe(2)
  })

  it('chưa open() thì toggle không phát gì — state còn null', () => {
    const { s, panel, patches } = makePanel()
    for (const t of toggleHits(s)) t.emit('pointerup')
    expect(patches).toEqual([])
    expect(panel.isOpen).toBe(false)
  })

  it('mặt toggle giữ được hình dạng bằng nét viền của theme (§B1.5)', () => {
    const { s, panel } = makePanel()
    panel.open(baseSave, () => {})
    expect(toggleFace(s)?.countOf('strokeRoundedRect')).toBe(2)
    expect(toggleFace(s)?.argOf('lineStyle', 0)).toBe(buildTheme('light').hairlineWidth)
  })
})

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

describe('createSettings — chọn theme', () => {
  it('xoay vòng light → dark → contrast → light, phát đúng ThemeName', () => {
    const { s, panel, patches } = makePanel()
    panel.open({ ...baseSave, theme: 'light' }, () => {})
    const btn = themeButton(s)
    expect(btn).toBeDefined()

    const seen: (ThemeName | undefined)[] = []
    for (let i = 0; i < 4; i++) {
      btn?.emit('pointerup')
      seen.push(patches.at(-1)?.theme)
    }
    expect(seen).toEqual(['dark', 'contrast', 'light', 'dark'])
  })

  it('mở với theme đang dùng thì vòng xoay bắt đầu từ đó', () => {
    const { s, panel, patches } = makePanel()
    panel.open({ ...baseSave, theme: 'dark' }, () => {})
    themeButton(s)?.emit('pointerup')
    expect(patches.at(-1)?.theme).toBe('contrast')
  })

  it('nhãn nút theme đọc đúng chuỗi của theme hiện tại', () => {
    const { s, panel } = makePanel(layoutPhone, i18n.vi)
    panel.open({ ...baseSave, theme: 'light' }, () => {})
    expect(textNamed(s, i18n.vi.themeLight)).toBeDefined()
    themeButton(s)?.emit('pointerup')
    expect(textNamed(s, i18n.vi.themeDark)).toBeDefined()
  })

  it('nhãn hàng và tiêu đề lấy từ Strings, không viết cứng', () => {
    const { s, panel } = makePanel(layoutPhone, i18n.vi)
    panel.open(baseSave, () => {})
    const keys = ['settings', 'sound', 'haptics', 'reducedMotion', 'theme', 'close'] as const
    for (const key of keys) expect(textNamed(s, i18n.vi[key]), key).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Màu theo theme — bài kiểm quét hex của theme.test.ts cấm literal màu
// ---------------------------------------------------------------------------

describe('createSettings — màu lấy từ PhaserTheme, không viết cứng', () => {
  it('đổi theme thì màu chữ đổi theo — chữ nâu đen trên card tối là vô hình', () => {
    const light = buildTheme('light')
    const dark = buildTheme('dark')
    const { s, panel } = makePanel(layoutPhone, i18n.en, light)
    panel.open(baseSave, () => {})
    const title = textNamed(s, i18n.en.settings)
    expect(title?.color).toBe(hexFromInt(light.text))

    panel.setTheme(dark)
    expect(title?.color).toBe(hexFromInt(dark.text))
    expect(title?.color).not.toBe(hexFromInt(light.text))
  })

  it('card, rãnh slider và hai nút đổi theo theme', () => {
    const dark = buildTheme('dark')
    const { s, panel } = makePanel(layoutPhone, i18n.en, buildTheme('light'))
    panel.open(baseSave, () => {})
    panel.setTheme(dark)

    expect(cardFace(s)?.fillColor).toBe(dark.page)

    const track = s.added.filter(
      (o) => o.kind === 'rectangle' && o.fillAlpha === 1 && o.height === 6,
    )
    expect(track.length).toBeGreaterThan(0)
    for (const t of track) expect(t.fillColor).toBe(dark.slot)

    const buttons = s.added.filter(
      (o) => o.kind === 'rectangle' && o.height === 48 && o.fillAlpha === 1,
    )
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    for (const b of buttons) expect(b.fillColor).toBe(dark.btn)
  })

  it('theme tương phản cao giữ hình card bằng nét viền, không bằng màu nền', () => {
    const contrast = buildTheme('contrast')
    const { s, panel } = makePanel(layoutPhone, i18n.en, contrast)
    panel.open(baseSave, () => {})

    const face = cardFace(s)
    const stroke = face?.ops.find((o) => o.op === 'strokeRoundedRect')
    expect(stroke).toBeDefined()
    expect(stroke?.args[4]).toBe(16)
    expect(
      face?.ops.some((o) => o.op === 'lineStyle' && o.args[0] === contrast.hairlineWidth),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Giảm chuyển động — hai đường (§B14:445)
// ---------------------------------------------------------------------------

describe('createSettings — giảm chuyển động ghi đè được qua cả hai đường (§B14:445)', () => {
  it('open() tween mờ vào 800 ms (`--dur-overlay`), 200 ms khi đã giảm chuyển động', () => {
    const normal = makePanel()
    normal.panel.open(baseSave, () => {})
    expect(normal.s.tweensAdded.at(-1)?.duration).toBe(800)
    expect(normal.s.tweensAdded.at(-1)?.alpha).toBe(1)

    const reduced = makePanel()
    reduced.panel.setReducedMotion(true)
    reduced.panel.open(baseSave, () => {})
    expect(reduced.s.tweensAdded.at(-1)?.duration).toBe(200)
  })

  it('close() khi giảm chuyển động thì cắt thẳng, không tween', () => {
    const { s, panel } = makePanel()
    panel.setReducedMotion(true)
    panel.open(baseSave, () => {})
    const before = s.tweensAdded.length
    panel.close()
    expect(s.tweensAdded.length).toBe(before)
    expect(s.added.every((o) => !o.visible)).toBe(true)
  })

  it('bật giảm chuyển động lúc đang mở thì hiện ngay, không lửng lơ giữa chừng', () => {
    const { s, panel } = makePanel()
    panel.open(baseSave, () => {})
    panel.setReducedMotion(true)
    expect(s.added.every((o) => o.alpha === 1)).toBe(true)
    expect(panel.isOpen).toBe(true)
  })

  it('tắt lại giảm chuyển động thì trở về nhịp 800 ms', () => {
    const { s, panel } = makePanel()
    panel.setReducedMotion(true)
    panel.setReducedMotion(false)
    panel.open(baseSave, () => {})
    expect(s.tweensAdded.at(-1)?.duration).toBe(800)
  })

  it('destroy() gỡ tween trước khi huỷ hình', () => {
    const { s, panel } = makePanel()
    panel.open(baseSave, () => {})
    panel.destroy()
    expect(s.killed.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Bố cục thật
// ---------------------------------------------------------------------------

describe('createSettings — relayout theo viewport', () => {
  it('gốc toạ độ khớp cách xếp: nhãn canh mép trái, nút canh tâm', () => {
    const { s, panel } = makePanel(layoutPhone, i18n.en)
    panel.open(baseSave, () => {})

    // Tiêu đề và nhãn hàng được đặt tại `contentL` và tính là MÉP TRÁI. Phaser
    // mặc định gốc ở tâm, nên thiếu `setOrigin` là chữ thò ra ngoài lề card.
    const title = textNamed(s, i18n.en.settings)
    expect([title?.originX, title?.originY]).toEqual([0, 0])
    for (const key of ['sound', 'haptics', 'reducedMotion', 'theme'] as const) {
      const label = textNamed(s, i18n.en[key])
      expect([label?.originX, label?.originY], key).toEqual([0, 0.5])
    }

    // Nhãn trên nút canh giữa nút.
    for (const key of ['themeLight', 'close'] as const) {
      const label = textNamed(s, i18n.en[key])
      expect([label?.originX, label?.originY], key).toEqual([0.5, 0.5])
    }

    // Rãnh slider canh mép trái: `sliderRatio` và con trượt tính từ `trackLeft`.
    const track = s.added.find((o) => o.kind === 'rectangle' && o.height === 6)
    expect([track?.originX, track?.originY]).toEqual([0, 0.5])

    // Ô chạm và con trượt thì canh TÂM — vị trí của chúng là tâm, không phải mép.
    const centred: FakeGO[] = [...hitTargets(s), ...s.added.filter((o) => o.kind === 'circle')]
    for (const o of centred) {
      expect([o.originX, o.originY], `${o.kind} ${o.text}`).toEqual([0.5, 0.5])
    }
  })

  it('đổi layout thì card và mọi ô chạm đi theo, vẫn nằm trong màn hình', () => {
    const { s, panel } = makePanel(layoutDesktop)
    panel.open(baseSave, () => {})
    const close = closeButton(s)
    const wide = close?.width ?? 0

    panel.relayout(layoutPhone)
    expect(close?.width ?? 0).toBeLessThan(wide)
    for (const h of hitTargets(s)) {
      expect(h.x - h.width / 2, `${h.kind} mép trái`).toBeGreaterThanOrEqual(0)
      expect(h.x + h.width / 2, `${h.kind} mép phải`).toBeLessThanOrEqual(layoutPhone.width)
    }
  })

  it('viewport hẹp: nhãn hàng không lấn vào ô điều khiển cùng dòng', () => {
    // Canvas không đo được bề ngang chữ khi chưa có renderer thật, nên đây là
    // ƯỚC LƯỢNG trên ngân sách bố cục: 0.6 em mỗi ký tự là mức rộng rãi cho font
    // sans. Nó bắt lỗi sắp xếp (nhãn chồng ô điều khiển), không phải lỗi font.
    const EM = 0.6
    const narrow = computeLayout(280, 568)
    for (const strings of [i18n.en, i18n.vi]) {
      const { s, panel } = makePanel(narrow, strings)
      panel.open(baseSave, () => {})
      const boxes = toggleHits(s)
      const btn = themeButton(s)
      expect(btn).toBeDefined()
      const rows: [string, FakeGO | undefined, FakeGO | undefined][] = [
        [strings.haptics, textNamed(s, strings.haptics), boxes[0]],
        [strings.reducedMotion, textNamed(s, strings.reducedMotion), boxes[1]],
        [strings.theme, textNamed(s, strings.theme), btn],
      ]
      for (const [name, label, control] of rows) {
        expect(label, name).toBeDefined()
        expect(control, name).toBeDefined()
        if (label === undefined || control === undefined) continue
        expect(Math.abs(control.y - label.y), `${name}: lệch hàng`).toBeLessThanOrEqual(20)
        const estimated = label.text.length * label.fontSize * EM
        expect(label.x + estimated, `${name}: nhãn lấn ô điều khiển`).toBeLessThanOrEqual(
          control.x - control.width / 2,
        )
      }

      // Nhãn DÀI NHẤT của nút theme cũng phải lọt trong nút.
      const longest = Math.max(
        ...(['themeLight', 'themeDark', 'themeContrast'] as const).map((k) => strings[k].length),
      )
      const labelSize = textNamed(s, strings.themeLight)?.fontSize ?? 11
      expect(longest * labelSize * EM + 16).toBeLessThanOrEqual(btn?.width ?? 0)
    }
  })
})
