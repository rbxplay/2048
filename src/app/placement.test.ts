import { describe, expect, it } from 'vitest'
import type { Dir } from '../game/rules'
import { computeLayout, MIN_VIEWPORT_H, MIN_VIEWPORT_W } from '../phaser/layout'
import { buildTheme } from '../phaser/theme'
import type { Box } from '../phaser/views/canvas'
import { createDpad } from '../phaser/views/dpad'
import {
  fitRing,
  placementFor,
  RING_REACH,
  toPage,
  type CanvasFrame,
  type PlacementSources,
} from './placement'

const frame = (w: number, h: number, over: Partial<CanvasFrame> = {}): CanvasFrame => ({
  left: 0,
  top: 0,
  width: w,
  height: h,
  gameWidth: w,
  gameHeight: h,
  ...over,
})

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h })

function sources(over: Partial<PlacementSources> = {}): PlacementSources {
  return {
    frame: frame(1280, 720),
    viewport: { width: 1280, height: 720 },
    dpad: {
      up: box(616, 500, 48, 48),
      left: box(560, 556, 48, 48),
      right: box(672, 556, 48, 48),
      down: box(616, 612, 48, 48),
    },
    gear: box(876, 60, 44, 44),
    dialog: { phase: 'closed', buttons: [] },
    settings: {
      phase: 'closed',
      controls: {
        sfx: box(450, 250, 200, 44),
        haptics: box(766, 300, 44, 44),
        reducedMotion: box(766, 356, 44, 44),
        theme: box(690, 410, 120, 48),
      },
    },
    ...over,
  }
}

describe('toPage — toạ độ game sang toạ độ trang', () => {
  it('canvas khớp 1:1 với trang thì là phép đồng nhất', () => {
    expect(toPage(box(10, 20, 30, 40), frame(320, 568))).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('canvas lệch gốc thì hộp lệch theo', () => {
    const f = frame(320, 568, { left: 12, top: 34 })
    expect(toPage(box(10, 20, 30, 40), f)).toEqual({ x: 22, y: 54, w: 30, h: 40 })
  })

  it('canvas bị co giãn thì cả vị trí lẫn cỡ co giãn theo từng trục', () => {
    // Game 640×360 vẽ trong hộp 320×90: nửa bề ngang, một phần tư chiều cao.
    const f = frame(320, 90, { gameWidth: 640, gameHeight: 360 })
    expect(toPage(box(100, 200, 48, 48), f)).toEqual({ x: 50, y: 50, w: 24, h: 12 })
  })

  it('kích thước game bằng 0 không sinh NaN hay vô cực', () => {
    const r = toPage(box(10, 20, 30, 40), frame(320, 568, { gameWidth: 0, gameHeight: 0 }))
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('fitRing — focus ring nằm trọn trong viewport', () => {
  const vp = { width: 320, height: 568 }

  it('hộp cách mọi mép ≥ 5 px thì giữ nguyên', () => {
    const r = { x: 5, y: 5, w: 310, h: 558 }
    expect(fitRing(r, vp)).toEqual(r)
  })

  it('hộp dán đáy viewport: chỉ cạnh dưới lùi vào 5 px', () => {
    expect(fitRing({ x: 136, y: 520, w: 48, h: 48 }, vp)).toEqual({ x: 136, y: 520, w: 48, h: 43 })
  })

  it('hộp sát mép phải 4 px: chỉ cạnh phải lùi 1 px', () => {
    expect(fitRing({ x: 272, y: 20, w: 44, h: 44 }, vp)).toEqual({ x: 272, y: 20, w: 43, h: 44 })
  })

  it('hộp sát mép trái và mép trên: gốc dời vào, cạnh đối diện đứng yên', () => {
    expect(fitRing({ x: 0, y: 2, w: 48, h: 48 }, vp)).toEqual({ x: 5, y: 5, w: 43, h: 45 })
  })

  it('hộp nằm hẳn ngoài viewport không sinh cỡ âm', () => {
    const r = fitRing({ x: 400, y: 700, w: 48, h: 48 }, vp)
    expect(r.w).toBe(0)
    expect(r.h).toBe(0)
  })
})

describe('placementFor — điều khiển nào đứng ở đâu, theo trạng thái', () => {
  it('lúc chơi: D-pad theo hướng, nút Settings trên bánh răng, không nút dialog', () => {
    const src = sources()
    const p = placementFor(src)
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      expect(p.dpad[dir], dir).toEqual({
        x: src.dpad[dir].x, y: src.dpad[dir].y, w: 48, h: 48,
      })
    }
    expect(p.settingsButton).toEqual({ x: 876, y: 60, w: 44, h: 44 })
    expect(p.dialogButtons).toEqual([])
  })

  it('Settings ĐÓNG: bốn ô nhập đứng trên bánh răng — canvas không vẽ chúng ở đâu khác', () => {
    const p = placementFor(sources())
    for (const key of ['sfx', 'haptics', 'reducedMotion', 'theme'] as const) {
      expect(p[key], key).toEqual(p.settingsButton)
    }
  })

  it('Settings MỞ: mỗi ô nhập lên đúng điều khiển canvas của nó', () => {
    const src = sources()
    const p = placementFor({ ...src, settings: { ...src.settings, phase: 'open' } })
    expect(p.sfx).toEqual({ x: 450, y: 250, w: 200, h: 44 })
    expect(p.haptics).toEqual({ x: 766, y: 300, w: 44, h: 44 })
    expect(p.reducedMotion).toEqual({ x: 766, y: 356, w: 44, h: 44 })
    expect(p.theme).toEqual({ x: 690, y: 410, w: 120, h: 48 })
  })

  it("Settings 'closing' (card đang mờ) đã hết hiệu lực: ô nhập về bánh răng ngay", () => {
    const src = sources()
    const p = placementFor({ ...src, settings: { ...src.settings, phase: 'closing' } })
    expect(p.sfx).toEqual(p.settingsButton)
    expect(p.theme).toEqual(p.settingsButton)
  })

  it('dialog MỞ: nút thứ i lên hộp thứ i, giữ đúng thứ tự', () => {
    const buttons = [box(450, 420, 380, 48), box(450, 360, 380, 48)]
    const p = placementFor(sources({ dialog: { phase: 'open', buttons } }))
    expect(p.dialogButtons).toEqual([
      { x: 450, y: 420, w: 380, h: 48 },
      { x: 450, y: 360, w: 380, h: 48 },
    ])
  })

  it("dialog 'closing' / 'closed': không nút dialog nào được đặt, dù view còn giữ hình", () => {
    const buttons = [box(450, 420, 380, 48)]
    for (const phase of ['closing', 'closed'] as const) {
      expect(placementFor(sources({ dialog: { phase, buttons } })).dialogButtons, phase).toEqual([])
    }
  })

  it('mọi hộp đều qua khung canvas: canvas lệch gốc thì MỌI điều khiển lệch theo', () => {
    const src = sources({ dialog: { phase: 'open', buttons: [box(450, 420, 380, 48)] } })
    const open = { ...src, settings: { ...src.settings, phase: 'open' as const } }
    const base = placementFor(open)
    const moved = placementFor({ ...open, frame: frame(1280, 720, { left: 7, top: 9 }) })
    const all = (p: typeof base) => [
      ...Object.values(p.dpad), p.settingsButton, p.sfx, p.haptics, p.reducedMotion, p.theme,
      ...p.dialogButtons,
    ]
    all(moved).forEach((r, i) => {
      expect(r.x).toBe(all(base)[i]!.x + 7)
      expect(r.y).toBe(all(base)[i]!.y + 9)
    })
  })

  it('ring của mọi điều khiển nằm trong viewport, kể cả nút dán mép', () => {
    const src = sources({
      viewport: { width: 1280, height: 660 },
      frame: frame(1280, 660),
    })
    // Nút "xuống" ở y 612..660 — dán đúng đáy viewport 660.
    const p = placementFor(src)
    expect(p.dpad.down).toEqual({ x: 616, y: 612, w: 48, h: 43 })
    expect(p.dpad.down.y + p.dpad.down.h + RING_REACH).toBeLessThanOrEqual(660)
  })
})

/**
 * A11Y-07 từ NGUỒN: cỡ nút DOM nay là cỡ nút canvas, nên sàn 48 px của D-pad phải
 * được kiểm trên hộp mà view thật trả ra, ở mọi viewport bố cục cam kết — không
 * phải bằng một `min-height` trong CSS. Lùi vào vì ring là phần DUY NHẤT được
 * phép làm hộp DOM nhỏ hơn hộp canvas, và không bao giờ quá 5 px một cạnh.
 */
describe('D-pad thật qua mọi viewport ≥ 260×360', () => {
  type Go = { x: number; y: number; width: number; height: number }
  function fakeScene() {
    const go = (w = 0, h = 0) => {
      const o: Record<string, unknown> & Go = { x: 0, y: 0, width: w, height: h }
      for (const m of [
        'setAlpha', 'setInteractive', 'on', 'setVisible', 'clear', 'lineStyle', 'lineBetween',
      ]) o[m] = () => o
      o['setPosition'] = (x: number, y: number) => {
        o.x = x
        o.y = y
        return o
      }
      return o
    }
    return {
      add: {
        rectangle: (_x: number, _y: number, w: number, h: number) => go(w, h),
        graphics: () => go(),
      },
      time: { delayedCall: () => ({ remove: () => {} }) },
    } as unknown as Parameters<typeof createDpad>[0]
  }

  it('hộp canvas luôn 48×48; hộp DOM chỉ nhỏ hơn ở cạnh dán mép, ≤ 5 px', () => {
    const dirs: Dir[] = ['up', 'down', 'left', 'right']
    let shrunk = 0
    for (let w = MIN_VIEWPORT_W; w <= 1400; w += 60) {
      for (let h = MIN_VIEWPORT_H; h <= 1000; h += 40) {
        const dpad = createDpad(fakeScene(), buildTheme('light'), computeLayout(w, h), {
          onDir: () => {},
        })
        const rects = dpad.buttonRects()
        const src = sources({ frame: frame(w, h), viewport: { width: w, height: h }, dpad: rects })
        const placed = placementFor(src).dpad
        for (const dir of dirs) {
          const at = `${w}×${h} ${dir}`
          expect(rects[dir].w, at).toBe(48)
          expect(rects[dir].h, at).toBe(48)
          // Nằm trọn trong viewport: bất biến của `computeLayout` (A11Y-10).
          expect(rects[dir].x, at).toBeGreaterThanOrEqual(0)
          expect(rects[dir].y + 48, at).toBeLessThanOrEqual(h)
          expect(placed[dir].w, at).toBeGreaterThanOrEqual(48 - RING_REACH)
          expect(placed[dir].h, at).toBeGreaterThanOrEqual(48 - RING_REACH)
          if (placed[dir].w < 48 || placed[dir].h < 48) shrunk += 1
        }
      }
    }
    // Ca dán mép là CÓ THẬT (nút "xuống" ở bố cục xếp dọc), không phải giả định.
    expect(shrunk).toBeGreaterThan(0)
  })
})
