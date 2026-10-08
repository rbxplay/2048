import Phaser from 'phaser'
import { formatNumber, type Locale, type Strings } from '../../i18n'
import { DARK_HEX, hexToInt, SHADOW_BASE_HEX } from '../../theme/palette'
import type { Layout } from '../layout'
import type { PhaserTheme } from '../theme'
import { CARD_RADIUS, FONT_STACK, SHADOW_DY } from './canvas'

export type DialogKind = 'win' | 'gameover'
/**
 * `'close'` KHÔNG phải code chết: nút đóng trong card phát ra nó, và `Esc`
 * (Task 13) cũng sẽ phát chính action này — người dùng cảm ứng không có `Esc`.
 */
export type DialogAction = 'keep-playing' | 'retry' | 'new-game' | 'close'

export type Dialogs = {
  open(kind: DialogKind, info: { score: number; best: number }): void
  close(): void
  readonly isOpen: boolean
  relayout(layout: Layout): void
  setTheme(theme: PhaserTheme): void
  /**
   * §B14:445 — token chuyển động phải ghi đè được qua CẢ media query LẪN toggle
   * trong game. `Hud` đã có hook này; overlay cần đúng một đường như vậy, nếu
   * không thì `--dur-overlay` chỉ có một nửa.
   */
  setReducedMotion(on: boolean): void
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

const BTN_H = 48
const BTN_GAP = 12
const CARD_PAD = 20
export const DIALOG_MAX_W = 420

/**
 * §B11:285 `--radius-card:16px` và §B11:291 `--shadow-float: 0 8px 28px
 * rgba(0,0,0,.28)` — quãng đổ xuống. Hai hằng này nay định nghĩa ở `canvas.ts`
 * (module lá dùng chung); ở đây chỉ nhập lại và xuất tiếp, giữ nguyên đường dẫn
 * nhập cũ cho `views.test.ts`. Hành vi của tệp này không đổi.
 */
export { CARD_RADIUS, SHADOW_DY }
/**
 * `Graphics` không vẽ được bóng nhoè, nên `0 8px 28px` được XẤP XỈ bằng ba vòng
 * cùng tâm, nở dần và nhạt dần. Tổng alpha ở lõi ≈ 0.28, đúng độ đậm của token.
 * Đây là xấp xỉ có chủ ý: bóng thật cần blur, mà blur cần filter/shader.
 */
const SHADOW_RINGS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.12],
  [6, 0.09],
  [12, 0.07],
]

/** §B8 — ô chạm tối thiểu 44×44 cho nút icon. */
export const CLOSE_SIZE = 44
const CLOSE_MARGIN = 2
/** §B8/B6 — nét icon 2 px, glyph ~22 px optical, container bo góc 8 px. */
const ICON_STROKE = 2
const ICON_RADIUS = 8

/** Dải trên cùng của card dành cho nút đóng; tiêu đề bắt đầu DƯỚI dải này. */
const CLOSE_STRIP = CLOSE_SIZE
/** Khe tiêu đề → thân. */
const TITLE_BODY_GAP = 42
const CARD_HEAD = 180

/**
 * §B11 `--dur-overlay:800ms` / §B11:300 rút còn 200 ms khi giảm chuyển động.
 * Xuất ra để test khẳng định đúng hai con số của token.
 */
export const OVERLAY_MS = 800
export const OVERLAY_REDUCED_MS = 200

/** Cỡ chữ thân dialog §B2: `clamp(14px, 3.2vmin, 18px)`. HÀM THUẦN. */
export function dialogBodySize(layout: Layout): number {
  return clamp(0.032 * Math.min(layout.width, layout.height), 14, 18)
}

/** §B8: bề ngang card `min(88vw, 420px)`. HÀM THUẦN. */
export function dialogCardWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(viewportWidth * 0.88, DIALOG_MAX_W))
}

/**
 * Nhãn của các nút hành động, theo thứ tự hiện ra. HÀM THUẦN — tầng a11y ở
 * Task 14 đọc lại đúng danh sách này để phơi ra cho screen reader.
 */
export function buttonLabels(kind: DialogKind, strings: Strings): string[] {
  return BUTTONS[kind].map((spec) => strings[spec.labelKey])
}

/**
 * Hành động của từng nút, CÙNG thứ tự với `buttonLabels`. HÀM THUẦN.
 *
 * Tồn tại để tầng ghép nối ánh xạ chỉ số nút → action mà KHÔNG chép lại bảng
 * `BUTTONS`: hai bảng song song thì sớm muộn lệch nhau, và lệch ở đây nghĩa là
 * bấm "Chơi tiếp" lại ra "Ván mới".
 */
export function buttonActions(kind: DialogKind): DialogAction[] {
  return BUTTONS[kind].map((spec) => spec.action)
}

/** `0xRRGGBB` → `#rrggbb`, dạng mà `TextStyle.color` nhận. */
function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/** Bắt buộc để nét ở DPI cao (§B2) — mọi `Text` đều phải gọi. */
function crisp(txt: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  return txt.setResolution(window.devicePixelRatio || 1)
}

/** Thứ có `alpha`/`setVisible` để tween mờ được. `Graphics`/`Rectangle`/`Text` đều khớp. */
type Fadeable = Phaser.GameObjects.GameObject & {
  alpha: number
  setAlpha(value?: number): unknown
  setVisible(value: boolean): unknown
}

/** Cỡ tiêu đề overlay. §B2 không có dòng riêng cho tiêu đề overlay; card bị chặn
 * trần 420 px nên cỡ cố định ở đây là hợp lý. */
const TITLE_SIZE = 24

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
  let reducedMotion = false
  let fade: Phaser.Tweens.Tween | null = null

  // §B8: scrim `rgba(23,22,26,.6)` — đúng màu `--page` của theme tối ở alpha
  // 0.6. Lấy từ token chứ không chép hex (§8.4).
  const scrim = scene.add.rectangle(0, 0, 1, 1, hexToInt(DARK_HEX.page), 0.6)
  // Bóng add TRƯỚC card để nằm dưới; display list vẽ theo thứ tự thêm vào.
  const shadow = scene.add.graphics()
  const card = scene.add.graphics()
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
  // Canh giữa theo chiều ngang: gốc (0,0) đặt ngay tại tâm card nghĩa là mép
  // TRÁI của tiêu đề nằm ở giữa card và chữ tràn hẳn sang phải.
  title.setOrigin(0.5, 0)
  body.setOrigin(0.5, 0)

  // Nút đóng: hình vẽ bằng `Graphics`, ô chạm là `Rectangle` trong suốt 44×44.
  // Không tính vào nhóm nút hành động — §B8:415 nói "1–2 buttons" về nút hành
  // động, còn §B8:415 vẫn đòi "closable with Esc and with the close button".
  const closeG = scene.add.graphics()
  const closeHit = scene.add.rectangle(0, 0, CLOSE_SIZE, CLOSE_SIZE, 0, 0)
  closeHit.setInteractive({ useHandCursor: true })
  closeHit.on('pointerup', () => opts.onAction('close'))

  const buttons: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; spec: Spec }[] = []

  /**
   * Phaser đo ô bấm NGAY LÚC gọi `setInteractive()`: `setHitAreaFromTexture` đọc
   * `gameObject.width`, mà lúc đó hình chữ nhật vừa dựng. Gọi `setSize()` sau đó
   * KHÔNG cập nhật `hitArea`, nên nút sẽ chỉ bấm trúng đúng một điểm ảnh. Vì vậy
   * nút được dựng thẳng với bề ngang thật, và mỗi lần đổi layout phải đồng bộ
   * lại ô bấm.
   */
  function syncHitArea(bg: Phaser.GameObjects.Rectangle, width: number): void {
    const hit: unknown = bg.input?.hitArea
    if (hit instanceof Phaser.Geom.Rectangle) hit.setSize(width, BTN_H)
  }

  function buttonWidth(): number {
    return Math.max(0, dialogCardWidth(l.width) - CARD_PAD * 2)
  }

  function cardHeight(): number {
    return CARD_HEAD + buttons.length * (BTN_H + BTN_GAP)
  }

  function cardBox(): { x: number; y: number; w: number; h: number } {
    const w = dialogCardWidth(l.width)
    const h = cardHeight()
    return { x: l.width / 2 - w / 2, y: l.height / 2 - h / 2, w, h }
  }

  function drawCard(): void {
    const { x, y, w, h } = cardBox()
    shadow.clear()
    for (const [spread, alpha] of SHADOW_RINGS) {
      shadow.fillStyle(hexToInt(SHADOW_BASE_HEX), alpha)
      shadow.fillRoundedRect(
        x - spread,
        y - spread + SHADOW_DY,
        w + spread * 2,
        h + spread * 2,
        CARD_RADIUS + spread,
      )
    }
    card.clear()
    card.fillStyle(t.page, 1)
    card.fillRoundedRect(x, y, w, h, CARD_RADIUS)
    // §B1.5: ở theme tương phản cao card `--page` nằm trên page cùng màu đen,
    // nên hình dạng phải giữ bằng viền. Độ dày lấy từ theme (`hairlineWidth`),
    // không viết cứng; màu lấy `--text` cho 21:1 ở theme đó.
    card.lineStyle(t.hairlineWidth, t.text, 1)
    card.strokeRoundedRect(x, y, w, h, CARD_RADIUS)
  }

  function closeCenter(): { x: number; y: number } {
    const { x, y, w } = cardBox()
    return {
      x: x + w - CLOSE_MARGIN - CLOSE_SIZE / 2,
      y: y + CLOSE_MARGIN + CLOSE_SIZE / 2,
    }
  }

  function drawClose(): void {
    const { x: cx, y: cy } = closeCenter()
    const d = CLOSE_SIZE * 0.25
    closeG.clear()
    // §B8 nút icon: container bo góc 8 px, ô chạm tối thiểu 44×44 (ô chạm là
    // `closeHit`, còn đây chỉ là mặt nhìn thấy).
    closeG.fillStyle(t.slot, 1)
    closeG.fillRoundedRect(cx - CLOSE_SIZE / 2, cy - CLOSE_SIZE / 2, CLOSE_SIZE, CLOSE_SIZE, ICON_RADIUS)
    closeG.lineStyle(ICON_STROKE, t.text, 1)
    closeG.lineBetween(cx - d, cy - d, cx + d, cy + d)
    closeG.lineBetween(cx + d, cy - d, cx - d, cy + d)
    closeHit.setPosition(cx, cy)
  }

  function fadeTargets(): Fadeable[] {
    const list: Fadeable[] = [scrim, shadow, card, title, body, closeG, closeHit]
    for (const b of buttons) list.push(b.bg, b.label)
    return list
  }

  /** Gỡ tween mờ đang chạy. Phải gọi TRƯỚC khi huỷ hình, không thì tween giữ
   * tham chiếu tới hình đã chết. */
  function stopFade(): void {
    if (fade === null) return
    scene.tweens.killTweensOf(fadeTargets())
    fade = null
  }

  function fadeMs(): number {
    return reducedMotion ? OVERLAY_REDUCED_MS : OVERLAY_MS
  }

  function relayoutAll(): void {
    scrim.setPosition(l.width / 2, l.height / 2).setSize(l.width, l.height)
    const { y, h } = cardBox()
    const cx = l.width / 2
    // Cỡ chữ thân bám `vmin` (§B2) nên phải đặt lại mỗi lần đổi layout, và DPI
    // có thể đổi khi người chơi kéo cửa sổ sang màn hình khác.
    body.setFontSize(dialogBodySize(l))
    crisp(title)
    crisp(body)
    title.setPosition(cx, y + CARD_PAD + CLOSE_STRIP)
    body.setPosition(cx, y + CARD_PAD + CLOSE_STRIP + TITLE_BODY_GAP)
    const bw = buttonWidth()
    buttons.forEach((b, i) => {
      const by = y + h - CARD_PAD - BTN_H - i * (BTN_H + BTN_GAP)
      b.bg.setPosition(cx, by + BTN_H / 2).setSize(bw, BTN_H)
      syncHitArea(b.bg, bw)
      // Nhãn canh giữa nút; canh trái kèm một hằng số bù dọc là ý định canh giữa
      // làm dở. Cỡ chữ bám `vmin` nên cũng phải đặt lại mỗi lần đổi layout.
      b.label.setOrigin(0.5, 0.5).setPosition(cx, by + BTN_H / 2)
      b.label.setFontSize(dialogBodySize(l))
      crisp(b.label)
    })
    drawCard()
    drawClose()
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
    for (const o of fadeTargets()) o.setVisible(v)
  }

  function open(kind: DialogKind, info: { score: number; best: number }): void {
    // Cắt hiệu ứng cũ TRƯỚC khi dựng lại nút, không thì tween cũ giữ tham chiếu
    // tới những nút vừa bị huỷ.
    stopFade()
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
    const targets = fadeTargets()
    for (const o of targets) o.setAlpha(0)
    // §B5:181 "Win/over message — fade-in 800ms". Không tween nếu giảm chuyển
    // động vẫn phải hiện đủ alpha 1, nên tween 200 ms vẫn chạy — chỉ ngắn hơn.
    const tw = scene.tweens.add({
      targets,
      alpha: 1,
      duration: fadeMs(),
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (fade === tw) fade = null
      },
    })
    fade = tw
  }

  function close(): void {
    current = null
    if (reducedMotion) {
      stopFade()
      setVisible(false)
      return
    }
    const targets = fadeTargets()
    stopFade()
    const tw = scene.tweens.add({
      targets,
      alpha: 0,
      duration: fadeMs(),
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (fade !== tw) return
        fade = null
        setVisible(false)
      },
    })
    fade = tw
  }

  // Vẽ và đặt vị trí ngay lúc dựng: chỉ `open()` mới gọi `rebuildButtons()` →
  // `relayoutAll()`, nên nếu không vẽ ở đây thì card/bóng/nút đóng nằm trống cho
  // tới lần mở đầu tiên — và một `relayout`/`setTheme` chạy trước đó (đường
  // resize) sẽ tác động lên những hình chưa từng được vẽ.
  relayoutAll()
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
      for (const b of buttons) {
        b.bg.setFillStyle(t.btn)
        b.label.setColor(hex(t.textOnDark))
      }
      title.setColor(hex(t.text))
      body.setColor(hex(t.text))
      drawCard()
      drawClose()
    },
    setReducedMotion(on) {
      reducedMotion = on
      if (!on) return
      // Đang mở thì hiện ngay; đang đóng thì ẩn ngay — không để overlay lửng lơ
      // nửa trong suốt khi người chơi vừa bật giảm chuyển động.
      stopFade()
      if (current !== null) {
        for (const o of fadeTargets()) o.setAlpha(1)
      } else {
        setVisible(false)
      }
    },
    destroy() {
      // Gỡ tween trước khi huỷ hình.
      scene.tweens.killTweensOf(fadeTargets())
      fade = null
      for (const b of buttons.splice(0)) {
        b.bg.destroy()
        b.label.destroy()
      }
      for (const o of [scrim, shadow, card, title, body, closeG, closeHit]) o.destroy()
    },
  }
}
