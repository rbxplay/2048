import Phaser from 'phaser'
import { formatNumber, type Locale, type Strings } from '../../i18n'
import { DARK_HEX, hexToInt } from '../../theme/palette'
import type { Layout } from '../layout'
import type { PhaserTheme } from '../theme'

export type DialogKind = 'win' | 'gameover'
export type DialogAction = 'keep-playing' | 'retry' | 'new-game' | 'close'

export type Dialogs = {
  open(kind: DialogKind, info: { score: number; best: number }): void
  close(): void
  readonly isOpen: boolean
  relayout(layout: Layout): void
  setTheme(theme: PhaserTheme): void
  destroy(): void
}

type Spec = { action: DialogAction; labelKey: keyof Strings }
const BUTTONS: Record<DialogKind, Spec[]> = {
  win: [
    { action: 'keep-playing', labelKey: 'keepPlaying' },
    { action: 'new-game', labelKey: 'newGame' },
  ],
  gameover: [{ action: 'retry', labelKey: 'retry' }],
}
const TITLE_KEY: Record<DialogKind, keyof Strings> = { win: 'winTitle', gameover: 'gameOverTitle' }

/** §B8: chiều cao nút tối thiểu 48 px trên cảm ứng. */
const BTN_H = 48
/** Khe giữa hai nút. */
const BTN_GAP = 12
/** Lề trong card. */
const CARD_PAD = 20
/** §B8: `min(88vw, 420px)`. */
export const DIALOG_MAX_W = 420
/** Phần thân card trên khối nút: tiêu đề + dòng điểm. */
const CARD_HEAD = 180

/** §B2: chữ thân/dialog `clamp(14px, 3.2vmin, 18px)`. */
const BODY_MIN = 14
const BODY_PER_VMIN = 0.032
const BODY_MAX = 18
/**
 * Cỡ tiêu đề overlay. §B2 không có dòng nào cho tiêu đề dialog, nên giữ nguyên
 * giá trị brief đưa; card bị chặn ở 420 px nên chữ cố định bên trong nó vẫn nhất
 * quán, không như hàng HUD vốn giãn theo viewport.
 */
const TITLE_SIZE = 24

/** Stack §B2 — xem ghi chú ở `hud.ts`. */
const FONT_STACK = '"2048 Digits", system-ui, sans-serif'

/** `0xRRGGBB` → `#rrggbb` cho `TextStyle.color` của Phaser. */
function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/** Bắt buộc để nét ở DPI cao (§B2) — xem ghi chú ở `hud.ts`. */
function crisp(txt: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  return txt.setResolution(window.devicePixelRatio || 1)
}

/** Cỡ chữ thân dialog theo §B2. HÀM THUẦN. */
export function dialogBodySize(layout: Layout): number {
  return clamp(BODY_PER_VMIN * Math.min(layout.width, layout.height), BODY_MIN, BODY_MAX)
}

/** §B8: card rộng `min(88vw, 420px)`. HÀM THUẦN. */
export function dialogCardWidth(viewportWidth: number): number {
  const w = Number.isFinite(viewportWidth) ? viewportWidth : 0
  return Math.max(0, Math.min(w * 0.88, DIALOG_MAX_W))
}

/**
 * Nhãn hiển thị của các nút trong một dialog, theo đúng thứ tự vẽ.
 *
 * HÀM THUẦN, xuất ra cho tầng a11y ở Task 14 dùng lại: bản DOM phải phơi đúng
 * những nút mà canvas đang vẽ, và cách duy nhất để hai bên không lệch là cùng
 * đọc một bảng `BUTTONS`.
 */
export function buttonLabels(kind: DialogKind, strings: Strings): string[] {
  return BUTTONS[kind].map((spec) => strings[spec.labelKey])
}

export function createDialogs(
  scene: Phaser.Scene,
  theme: PhaserTheme,
  layout: Layout,
  opts: {
    getStrings: () => Strings
    getLocale: () => Locale
    onAction: (action: DialogAction) => void
  },
): Dialogs {
  let t = theme
  let l = layout
  let current: DialogKind | null = null

  // §B8: scrim `rgba(23,22,26,.6)` — đúng màu `--page` của theme tối ở alpha
  // 0.6. Lấy từ token chứ không chép hex (§8.4).
  const scrim = scene.add.rectangle(0, 0, 1, 1, hexToInt(DARK_HEX.page), 0.6)
  const card = scene.add.rectangle(0, 0, 1, 1, t.page)
  // Màu chữ theo theme: màu chữ chính của theme sáng viết cứng sẽ là chữ nâu đen
  // trên card `--page` của theme tối và theme tương phản cao — vô hình.
  const title = crisp(scene.add.text(0, 0, '', {
    fontFamily: FONT_STACK,
    fontSize: `${TITLE_SIZE}px`,
    color: hex(t.text),
    fontStyle: 'bold',
  }))
  const body = crisp(scene.add.text(0, 0, '', {
    fontFamily: FONT_STACK,
    fontSize: `${dialogBodySize(l)}px`,
    color: hex(t.text),
  }))
  // Canh giữa theo chiều ngang: brief đặt gốc (0,0) ngay tại tâm card, nghĩa là
  // mép TRÁI của tiêu đề nằm ở giữa card và chữ tràn hẳn sang phải.
  title.setOrigin(0.5, 0)
  body.setOrigin(0.5, 0)

  const buttons: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; spec: Spec }[] = []

  /**
   * Phaser đo ô bấm NGAY LÚC gọi `setInteractive()`: `setHitAreaFromTexture` đọc
   * `gameObject.width`, mà lúc đó hình chữ nhật vừa dựng với bề ngang 1. Gọi
   * `setSize()` sau đó KHÔNG cập nhật `hitArea`, nên nút sẽ chỉ bấm trúng đúng
   * một điểm ảnh. Vì vậy nút được dựng thẳng với bề ngang thật, và mỗi lần đổi
   * layout phải đồng bộ lại ô bấm.
   */
  function syncHitArea(bg: Phaser.GameObjects.Rectangle, width: number): void {
    const hit: unknown = bg.input?.hitArea
    if (hit instanceof Phaser.Geom.Rectangle) hit.setSize(width, BTN_H)
  }

  function buttonWidth(): number {
    return Math.max(0, dialogCardWidth(l.width) - CARD_PAD * 2)
  }

  function relayoutAll(): void {
    scrim.setPosition(l.width / 2, l.height / 2).setSize(l.width, l.height)
    const cw = dialogCardWidth(l.width)
    const ch = CARD_HEAD + buttons.length * (BTN_H + BTN_GAP)
    const cx = l.width / 2
    const cy = l.height / 2
    card.setPosition(cx, cy).setSize(cw, ch)
    // Cỡ chữ thân bám `vmin` (§B2) nên phải đặt lại mỗi lần đổi layout, và DPI
    // có thể đổi khi người chơi kéo cửa sổ sang màn hình khác.
    body.setFontSize(dialogBodySize(l))
    crisp(title)
    crisp(body)
    title.setPosition(cx, cy - ch / 2 + CARD_PAD)
    body.setPosition(cx, cy - ch / 2 + CARD_PAD + 42)
    const bw = buttonWidth()
    buttons.forEach((b, i) => {
      const y = cy + ch / 2 - CARD_PAD - BTN_H - i * (BTN_H + BTN_GAP)
      b.bg.setPosition(cx, y + BTN_H / 2).setSize(bw, BTN_H)
      syncHitArea(b.bg, bw)
      // Nhãn canh giữa nút; brief canh trái bằng lề 16 px rồi tự bù dọc bằng một
      // hằng số `- 9` — dấu hiệu của ý định canh giữa làm dở.
      // Cỡ chữ bám `vmin` (§B2) nên phải đặt lại mỗi lần đổi layout, và DPI có
      // thể đổi khi người chơi kéo cửa sổ sang màn hình khác.
      b.label.setOrigin(0.5, 0.5).setPosition(cx, y + BTN_H / 2)
      b.label.setFontSize(dialogBodySize(l))
      crisp(b.label)
    })
  }

  function rebuildButtons(kind: DialogKind): void {
    for (const b of buttons.splice(0)) {
      b.bg.destroy()
      b.label.destroy()
    }
    const s = opts.getStrings()
    const bw = buttonWidth()
    for (const spec of BUTTONS[kind]) {
      // Dựng thẳng với bề ngang thật để `setInteractive` đo đúng — xem
      // `syncHitArea`.
      const bg = scene.add.rectangle(0, 0, bw, BTN_H, t.btn)
      bg.setInteractive({ useHandCursor: true })
      const label = crisp(scene.add.text(0, 0, s[spec.labelKey], {
        fontFamily: FONT_STACK,
        fontSize: `${dialogBodySize(l)}px`,
        // §B8: nhãn trắng trên `--btn` (6.62:1 với trắng tuyệt đối). Dùng token
        // `--text-on-dark` cho 6.28:1 — vẫn qua AA và không phải chép hex.
        color: hex(t.textOnDark),
      }))
      bg.on('pointerup', () => opts.onAction(spec.action))
      buttons.push({ bg, label, spec })
    }
    relayoutAll()
  }

  function setVisible(v: boolean): void {
    scrim.setVisible(v)
    card.setVisible(v)
    title.setVisible(v)
    body.setVisible(v)
    for (const b of buttons) {
      b.bg.setVisible(v)
      b.label.setVisible(v)
    }
  }

  function open(kind: DialogKind, info: { score: number; best: number }): void {
    const s = opts.getStrings()
    const locale = opts.getLocale()
    current = kind
    title.setText(s[TITLE_KEY[kind]])
    body.setText(
      `${s.score.toUpperCase()}: ${formatNumber(info.score, locale)}   ` +
      `${s.best.toUpperCase()}: ${formatNumber(info.best, locale)}`,
    )
    rebuildButtons(kind)
    setVisible(true)
  }

  function close(): void {
    current = null
    setVisible(false)
  }

  setVisible(false)

  return {
    open,
    close,
    get isOpen() {
      return current !== null
    },
    relayout(next) {
      l = next
      relayoutAll()
    },
    setTheme(next) {
      t = next
      card.setFillStyle(t.page)
      title.setColor(hex(t.text))
      body.setColor(hex(t.text))
      for (const b of buttons) {
        b.bg.setFillStyle(t.btn)
        b.label.setColor(hex(t.textOnDark))
      }
    },
    destroy() {
      for (const b of buttons.splice(0)) {
        b.bg.destroy()
        b.label.destroy()
      }
      for (const o of [scrim, card, title, body]) o.destroy()
    },
  }
}
