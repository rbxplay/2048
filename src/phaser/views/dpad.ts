import type Phaser from 'phaser'
import type { Dir } from '../../game/rules'
import type { Strings } from '../../i18n'
import type { Layout } from '../layout'
import type { PhaserTheme } from '../theme'

/**
 * D-pad vẽ trong canvas — 4 nút cảm ứng ở đáy màn hình.
 *
 * §B8: "4 buttons (48 px, 8 px gap) in a cross, bottom-centre, 70 % opacity,
 * auto-hide after 3 s of drag use, reappears on tap of the board."
 *
 * Hình học bám `Layout.dpadY`: đó là MÉP TRÊN của khối D-pad, không phải tâm.
 * Chữ thập được đặt cân trong khối đó nên mép trên của nút trên cùng rơi ĐÚNG
 * `dpadY` — không tràn lên đè board, giữ đúng bất biến `dpadY >= boardY +
 * boardSide` của §B3.
 */

/** §B8 / A11Y-07: nút D-pad ≥ 48 px. */
export const DPAD_BUTTON_PX = 48
/** §B8: tự ẩn sau 3 giây kể từ lần dùng drag gần nhất. */
export const DPAD_AUTOHIDE_MS = 3000
/** §B8: "semi-transparent 70 %". */
export const DPAD_OPACITY = 0.7

/** §B8: "8 px gap". Bước giữa hai nút kề nhau = cạnh nút + khe. */
const GAP = 8
/**
 * Bề rộng/chiều cao cả chữ thập: 3 ô nút và 2 khe = 160 px. Con số này bằng
 * đúng `DPAD_BLOCK` của `layout.ts` — đó không phải trùng hợp mà là hợp đồng:
 * `dpadY` chừa đúng chỗ này, nên đặt lệch đi là tràn ra ngoài khe dành cho nó.
 */
const CROSS_SPAN = 3 * DPAD_BUTTON_PX + 2 * GAP
/** §B6: "Sizes: 24 px optical ... stroke-width: 2, round caps". */
const ARROW_SIZE = 24
const ARROW_STROKE = 2

export type Dpad = {
  setVisible(visible: boolean): void
  /** Báo có một cú drag vừa dùng — dời hạn tự ẩn thêm 3 giây. */
  noteDragUsed(): void
  relayout(layout: Layout): void
  setTheme(theme: PhaserTheme): void
  destroy(): void
}

type Spec = { dir: Dir; labelKey: keyof Strings; dx: number; dy: number }

/** Thứ tự này cũng là thứ tự nhãn mà tầng a11y đọc lên: lên, trái, phải, xuống. */
const SPECS: Spec[] = [
  { dir: 'up', labelKey: 'moveUp', dx: 0, dy: -1 },
  { dir: 'left', labelKey: 'moveLeft', dx: -1, dy: 0 },
  { dir: 'right', labelKey: 'moveRight', dx: 1, dy: 0 },
  { dir: 'down', labelKey: 'moveDown', dx: 0, dy: 1 },
]

type Node = {
  spec: Spec
  bg: Phaser.GameObjects.Rectangle
  icon: Phaser.GameObjects.Graphics
}

/**
 * Hai đoạn nét của mũi tên hình chữ V, dạng `[x1, y1, x2, y2]`.
 *
 * Vẽ bằng `Graphics` chứ không bằng ký tự: §B6 đòi icon là nét `stroke-width: 2`
 * với đầu nét tròn, và Phaser vẽ `Graphics` mặc định `lineCap = 'round'` — đúng
 * thứ đó. Ký tự kiểu `'‹'`/`'ˇ'` là dấu câu và dấu phụ, không phải mũi tên, và
 * bề dày nét của chúng đổi theo font hệ thống của từng máy.
 */
function chevron(dir: Dir, cx: number, cy: number): [number, number, number, number][] {
  const hw = ARROW_SIZE / 2
  const hh = ARROW_SIZE / 4
  switch (dir) {
    case 'up':
      return [
        [cx - hw, cy + hh, cx, cy - hh],
        [cx, cy - hh, cx + hw, cy + hh],
      ]
    case 'down':
      return [
        [cx - hw, cy - hh, cx, cy + hh],
        [cx, cy + hh, cx + hw, cy - hh],
      ]
    case 'left':
      return [
        [cx + hw, cy - hh, cx - hw, cy],
        [cx - hw, cy, cx + hw, cy + hh],
      ]
    case 'right':
      return [
        [cx - hw, cy - hh, cx + hw, cy],
        [cx + hw, cy, cx - hw, cy + hh],
      ]
  }
}

export function createDpad(
  scene: Phaser.Scene,
  theme: PhaserTheme,
  layout: Layout,
  opts: { getStrings: () => Strings; onDir: (dir: Dir) => void },
): Dpad {
  let t = theme
  let l = layout
  let hidden = true
  let hideTimer: Phaser.Time.TimerEvent | null = null

  const nodes: Node[] = SPECS.map((spec) => {
    // Dựng thẳng với cỡ thật rồi mới `setInteractive`: Phaser đo ô bấm NGAY lúc
    // gọi, nên `setSize()` sau đó sẽ để lại một ô bấm sai cỡ.
    const bg = scene.add.rectangle(0, 0, DPAD_BUTTON_PX, DPAD_BUTTON_PX, t.btn)
    bg.setAlpha(DPAD_OPACITY)
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerup', () => opts.onDir(spec.dir))
    const icon = scene.add.graphics()
    icon.setAlpha(DPAD_OPACITY)
    return { spec, bg, icon }
  })

  function drawIcon(node: Node, x: number, y: number): void {
    node.icon.clear()
    node.icon.lineStyle(ARROW_STROKE, t.textOnDark, 1)
    for (const [x1, y1, x2, y2] of chevron(node.spec.dir, x, y)) {
      node.icon.lineBetween(x1, y1, x2, y2)
    }
  }

  /** Nhãn cho screen reader (§B8: "labelled Move up/down/left/right"). */
  function labelAll(): void {
    const s = opts.getStrings()
    for (const n of nodes) n.bg.setData('ariaLabel', s[n.spec.labelKey])
  }

  function applyVisibility(visible: boolean): void {
    hidden = !visible
    for (const n of nodes) {
      n.bg.setVisible(visible)
      n.icon.setVisible(visible)
    }
  }

  function relayoutAll(): void {
    const step = DPAD_BUTTON_PX + GAP
    const cx = l.width / 2
    // Tâm chữ thập ở giữa khối `[dpadY, dpadY + CROSS_SPAN]`, không phải ở
    // `dpadY + step`: đặt sai chỗ đó thì nút trên cùng tràn lên trên `dpadY` và
    // đè board — đúng thứ bất biến của §B3 cấm.
    const cy = l.dpadY + CROSS_SPAN / 2
    for (const n of nodes) {
      const x = cx + n.spec.dx * step
      const y = cy + n.spec.dy * step
      n.bg.setPosition(x, y)
      // Icon là `Graphics` toạ độ tuyệt đối nên phải vẽ lại, không chỉ dời.
      drawIcon(n, x, y)
    }
  }

  function clearTimer(): void {
    hideTimer?.remove()
    hideTimer = null
  }

  applyVisibility(false)
  labelAll()
  relayoutAll()

  return {
    setVisible(visible) {
      clearTimer()
      applyVisibility(visible)
      // Nhãn đặt lại ở đây để đổi ngôn ngữ lúc đang chơi vẫn ăn: `getStrings` là
      // getter, không phải ảnh chụp lúc dựng.
      labelAll()
    },
    noteDragUsed() {
      if (hidden) return
      clearTimer()
      hideTimer = scene.time.delayedCall(DPAD_AUTOHIDE_MS, () => {
        hideTimer = null
        applyVisibility(false)
      })
    },
    relayout(next) {
      l = next
      relayoutAll()
    },
    setTheme(next) {
      t = next
      for (const n of nodes) {
        n.bg.setFillStyle(t.btn)
        drawIcon(n, n.bg.x, n.bg.y)
      }
    },
    destroy() {
      clearTimer()
      for (const n of nodes) {
        n.bg.destroy()
        n.icon.destroy()
      }
    },
  }
}
