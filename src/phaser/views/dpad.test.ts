import { describe, expect, it } from 'vitest'
import { computeLayout, type Layout } from '../layout'
import { buildTheme, type PhaserTheme } from '../theme'
import { createDpad, DPAD_AUTOHIDE_MS, DPAD_BUTTON_PX, DPAD_OPACITY } from './dpad'

/**
 * `dpad.ts` chỉ chạm `scene.add`, `scene.time` và không cần giá trị runtime nào
 * của Phaser, nên tệp này chạy được mà không phải `vi.mock('phaser')` — không có
 * phép dò canvas nào của Phaser 4 bị kích hoạt.
 *
 * Nhưng vẫn theo đúng cách của `views/views.test.ts`: dùng một `scene` GIẢ ghi
 * lại đúng những gì factory gọi, để kiểm hành vi thật (vị trí, màu theo theme,
 * vòng đời timer, ô bấm) chứ không chỉ kiểm mấy hằng số.
 */

type Op = { op: string; args: unknown[] }

class FakeGO {
  x = 0
  y = 0
  width = 0
  height = 0
  alpha = 1
  visible = true
  fillColor = 0
  fillAlpha = 1
  destroyed = false
  input: { hitArea: { width: number; height: number } } | null = null
  readonly ops: Op[] = []
  readonly handlers = new Map<string, (() => void)[]>()

  constructor(readonly kind: string) {}

  #log(op: string, ...args: unknown[]): this {
    this.ops.push({ op, args })
    return this
  }

  argOf(op: string, index: number): unknown {
    return this.ops.find((o) => o.op === op)?.args[index]
  }

  /** Mọi lệnh `op` từng được gọi — dùng để đếm nét vẽ của icon. */
  allOf(op: string): Op[] {
    return this.ops.filter((o) => o.op === op)
  }

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this.#log('setPosition', x, y)
  }
  setInteractive(): this {
    this.input = { hitArea: { width: this.width, height: this.height } }
    return this.#log('setInteractive')
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
  setFillStyle(color: number, alpha?: number): this {
    this.fillColor = color
    if (alpha !== undefined) this.fillAlpha = alpha
    return this.#log('setFillStyle', color, alpha)
  }
  setAlpha(a: number): this {
    this.alpha = a
    return this.#log('setAlpha', a)
  }
  setVisible(v: boolean): this {
    this.visible = v
    return this.#log('setVisible', v)
  }
  destroy(): void {
    this.destroyed = true
    this.#log('destroy')
  }

  // — Graphics —
  clear(): this {
    return this.#log('clear')
  }
  lineStyle(w: number, c: number, a: number): this {
    return this.#log('lineStyle', w, c, a)
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    return this.#log('lineBetween', x1, y1, x2, y2)
  }
}

type FakeTimer = {
  ms: number
  delay: number
  cb: () => void
  removed: boolean
  remove(): void
  fire(): void
}

function makeScene() {
  const added: FakeGO[] = []
  const timers: FakeTimer[] = []
  const track = (go: FakeGO): FakeGO => {
    added.push(go)
    return go
  }

  const scene = {
    add: {
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
    time: {
      delayedCall: (ms: number, cb: () => void): FakeTimer => {
        const t: FakeTimer = {
          ms,
          delay: 0,
          cb,
          removed: false,
          remove(): void {
            t.removed = true
          },
          fire(): void {
            if (!t.removed) cb()
          },
        }
        timers.push(t)
        return t
      },
    },
  }

  return {
    added,
    timers,
    buttons: (): FakeGO[] => added.filter((o) => o.kind === 'rectangle'),
    icons: (): FakeGO[] => added.filter((o) => o.kind === 'graphics'),
    scene: scene as unknown as Parameters<typeof createDpad>[0],
  }
}

const theme = buildTheme('light')
const layout320 = computeLayout(320, 568)

function dpad(s: ReturnType<typeof makeScene>, at: Layout = layout320, dirs: string[] = []) {
  return createDpad(s.scene, theme, at, {
    onDir: (d) => dirs.push(d),
  })
}

describe('createDpad — §B8: 4 nút 48 px, khe 8 px, hình chữ thập', () => {
  it('đúng bốn nút, mỗi nút 48×48 với ô bấm 48×48', () => {
    const s = makeScene()
    dpad(s)

    const btns = s.buttons()
    expect(btns).toHaveLength(4)
    for (const b of btns) {
      expect(b.width).toBe(DPAD_BUTTON_PX)
      expect(b.height).toBe(DPAD_BUTTON_PX)
      // Ô bấm chụp tại `setInteractive`, mà nút đã đúng cỡ ngay từ đầu.
      expect(b.input?.hitArea.width).toBe(DPAD_BUTTON_PX)
      expect(b.input?.hitArea.height).toBe(DPAD_BUTTON_PX)
      expect(DPAD_BUTTON_PX).toBeGreaterThanOrEqual(48) // A11Y-07
    }
  })

  it('khe giữa hai nút kề nhau đúng 8 px', () => {
    const s = makeScene()
    dpad(s)
    const [up, left] = s.buttons()
    // `up` và `left` là hai nút KỀ nhau trong chữ thập, lệch nhau một bước theo
    // mỗi trục; bước = cạnh nút + khe.
    const dx = Math.abs((up?.x ?? 0) - (left?.x ?? 0))
    const dy = Math.abs((up?.y ?? 0) - (left?.y ?? 0))
    expect(dx - DPAD_BUTTON_PX).toBe(8)
    expect(dy - DPAD_BUTTON_PX).toBe(8)
  })

  it('nằm cân trong khối D-pad của layout và KHÔNG đè lên board ở mọi viewport thử được', () => {
    for (let w = 160; w <= 1600; w += 41) {
      for (let h = 240; h <= 1200; h += 67) {
        const l = computeLayout(w, h)
        const s = makeScene()
        dpad(s, l)
        const btns = s.buttons()
        expect(btns).toHaveLength(4)

        // Trung bình cộng bốn tâm chính là tâm chữ thập ⇒ đúng giữa khối 160 px
        // mà layout chừa. Khối đó ở giữa bề ngang khi xếp dọc, và ở bên phải
        // board khi xếp ngang (A11Y-10) — nên mốc là `dpadX`, không phải `width / 2`.
        const cx = btns.reduce((a, b) => a + b.x, 0) / 4
        expect(cx, `tâm ngang ${w}×${h}`).toBeCloseTo(l.dpadX + 80)

        // §B3: `dpadX`/`dpadY` là góc TRÊN-TRÁI khối D-pad, và khối đó nằm hẳn
        // dưới hoặc hẳn bên phải board. Nút ngoài cùng phải nằm TRONG khối.
        // Dung sai 1e-9 px chỉ để bỏ qua sai số dấu phẩy động của `computeLayout`
        // (dpadY ở đây lệch 6e-14 so với số nguyên) — nhỏ hơn một pixel rất nhiều
        // nên không nới lỏng bất biến.
        const top = Math.min(...btns.map((b) => b.y - b.height / 2))
        expect(top, `nút trên cùng ${w}×${h}`).toBeGreaterThanOrEqual(l.dpadY - 1e-9)

        // Cả chữ thập lọt bề ngang màn hình ở mọi cỡ máy thật.
        const left = Math.min(...btns.map((b) => b.x - b.width / 2))
        const right = Math.max(...btns.map((b) => b.x + b.width / 2))
        expect(left, `mép trái khối ${w}×${h}`).toBeGreaterThanOrEqual(l.dpadX - 1e-9)
        expect(
          top >= l.boardY + l.boardSide - 1e-9 || left >= l.boardX + l.boardSide - 1e-9,
          `không đè board ${w}×${h}`,
        ).toBe(true)
        expect(left, `mép trái ${w}×${h}`).toBeGreaterThanOrEqual(-1e-9)
        expect(right, `mép phải ${w}×${h}`).toBeLessThanOrEqual(l.width + 1e-9)
      }
    }
  })

  it('bấm nút phát đúng Dir', () => {
    const s = makeScene()
    const dirs: string[] = []
    dpad(s, layout320, dirs)

    for (const b of s.buttons()) b.emit('pointerup')
    expect(dirs.sort()).toEqual(['down', 'left', 'right', 'up'])
  })
})

describe('createDpad — §B8: 70 % opacity, icon nét 2 px', () => {
  it('nút và icon đều 70 % opacity', () => {
    const s = makeScene()
    dpad(s)
    expect(DPAD_OPACITY).toBe(0.7)
    for (const o of [...s.buttons(), ...s.icons()]) expect(o.alpha).toBe(DPAD_OPACITY)
  })

  it('icon là nét vẽ theo theme, không phải hex cứng: 2 px, màu `--text-on-dark`', () => {
    const s = makeScene()
    dpad(s)
    for (const icon of s.icons()) {
      // §B6: `stroke-width: 2`, mũi tên ~24 px optical ⇒ hai đoạn nét.
      expect(icon.allOf('lineBetween')).toHaveLength(2)
      expect(icon.argOf('lineStyle', 0)).toBe(2)
      expect(icon.argOf('lineStyle', 1)).toBe(theme.textOnDark)
    }
  })

  it('setTheme sơn lại nút và icon theo theme MỚI, không giữ màu cũ', () => {
    const s = makeScene()
    const d = dpad(s)
    const next: PhaserTheme = { ...theme, btn: 0x123456, textOnDark: 0x654321 }

    d.setTheme(next)
    for (const b of s.buttons()) expect(b.fillColor).toBe(0x123456)
    for (const icon of s.icons()) {
      expect(icon.allOf('lineStyle').at(-1)?.args[1]).toBe(0x654321)
    }
  })
})

describe('createDpad — §B8: ẩn/hiện và tự ẩn sau 3 s dùng drag', () => {
  it('ẩn lúc dựng, hiện khi được gọi', () => {
    const s = makeScene()
    const d = dpad(s)
    expect([...s.buttons(), ...s.icons()].every((o) => !o.visible)).toBe(true)

    d.setVisible(true)
    expect([...s.buttons(), ...s.icons()].every((o) => o.visible)).toBe(true)
  })

  it('noteDragUsed hẹn tự ẩn sau ĐÚNG 3000 ms', () => {
    const s = makeScene()
    const d = dpad(s)
    d.setVisible(true)

    d.noteDragUsed()
    expect(DPAD_AUTOHIDE_MS).toBe(3000)
    expect(s.timers).toHaveLength(1)
    expect(s.timers[0]?.ms).toBe(DPAD_AUTOHIDE_MS)

    s.timers[0]?.fire()
    expect([...s.buttons(), ...s.icons()].every((o) => !o.visible)).toBe(true)
  })

  it('drag liên tiếp dời hạn, không chồng timer cũ', () => {
    const s = makeScene()
    const d = dpad(s)
    d.setVisible(true)

    d.noteDragUsed()
    d.noteDragUsed()
    expect(s.timers[0]?.removed).toBe(true)
    // Timer cũ đã gỡ thì nó không thể ẩn D-pad sớm.
    s.timers[0]?.fire()
    expect([...s.buttons()].every((o) => o.visible)).toBe(true)
    expect(s.timers[1]?.removed).toBe(false)
  })

  it('D-pad đang ẩn thì drag không hẹn giờ, không tự hiện', () => {
    const s = makeScene()
    const d = dpad(s)
    d.noteDragUsed()
    expect(s.timers).toHaveLength(0)
    expect([...s.buttons()].every((o) => !o.visible)).toBe(true)
  })
})

describe('createDpad — vòng đời', () => {
  it('relayout đặt lại vị trí theo layout mới', () => {
    const s = makeScene()
    const d = dpad(s, layout320)
    const before = s.buttons()[0]?.x ?? 0
    const wide = computeLayout(900, 700)

    d.relayout(wide)
    expect(s.buttons()[0]?.x).not.toBe(before)
    const cx = s.buttons().reduce((a, b) => a + b.x, 0) / 4
    expect(cx).toBeCloseTo(wide.width / 2)
    const top = Math.min(...s.buttons().map((b) => b.y - b.height / 2))
    expect(top).toBeGreaterThanOrEqual(wide.dpadY)
  })

  it('destroy gỡ timer và huỷ mọi hình', () => {
    const s = makeScene()
    const d = dpad(s)
    d.setVisible(true)
    d.noteDragUsed()

    d.destroy()
    expect(s.timers[0]?.removed).toBe(true)
    expect(s.added.every((o) => o.destroyed)).toBe(true)
  })

  it('không tạo phần tử DOM nào; đây là hình vẽ trong canvas', () => {
    const s = makeScene()
    const before = document.body.childElementCount
    const d = dpad(s)
    d.setVisible(true)
    expect(s.added.length).toBeGreaterThan(0)
    expect(document.body.childElementCount).toBe(before)
  })
})
