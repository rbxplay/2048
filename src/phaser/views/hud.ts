import Phaser from 'phaser'
import { formatNumber, type Locale, type Strings } from '../../i18n'
import type { Layout } from '../layout'
import type { PhaserTheme } from '../theme'
import { FONT_STACK } from './canvas'

/** Chiều cao TỐI THIỂU của thẻ điểm; thẻ cao thêm nếu cỡ chữ §B2 đòi. */
const CARD_H = 40
/** §B5 `--dur-badge`: badge `+N` bay lên rồi mờ đi trong 600 ms. */
const BADGE_MS = 600
/** §B5 "rise + fade" — quãng bay của badge. */
const BADGE_RISE = 28
/** Lề trong thẻ. */
const CARD_PAD_X = 8
const CARD_PAD_TOP = 4
const CARD_PAD_BOTTOM = 4
/** Khe giữa nhãn và số. */
const LABEL_GAP = 1

/** §B2: số điểm/kỷ lục `clamp(18px, 4.5vmin, 30px)`, bold 700. */
const NUM_MIN = 18
const NUM_PER_VMIN = 0.045
const NUM_MAX = 30
/** §B2: nhãn `clamp(11px, 2.4vmin, 14px)`, sàn tuyệt đối 11 px. */
const LABEL_MIN = 11
const LABEL_PER_VMIN = 0.024
const LABEL_MAX = 14

/** §B8:222 — hàng HUD có "Settings gear at the right, 44×44". */
export const GEAR_SIZE = 44
/** Khe giữa thẻ BEST và bánh răng. */
const GEAR_GAP = 8
/** §B8 — container nút icon bo góc 8 px. */
const ICON_RADIUS = 8
/** §B6 — "stroke-width: 2". */
const ICON_STROKE = 2

/** `0xRRGGBB` → `#rrggbb`, dạng màu mà `TextStyle.color` nhận. */
function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/** Cạnh NGẮN của viewport — `vmin` của CSS, thứ mà mọi `clamp` ở §B2 dùng. */
function vmin(layout: Layout): number {
  return Math.min(layout.width, layout.height)
}

/**
 * Bắt buộc để nét ở DPI cao (§B2). Gom vào một chỗ vì ràng buộc là "MỌI `Text`
 * hiển thị số đều phải gọi" — quên một chỗ là chữ nhoè đúng ở chỗ đó.
 */
function crisp(txt: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  return txt.setResolution(window.devicePixelRatio || 1)
}

/**
 * Nhãn HUD hiện bằng CHỮ HOA.
 *
 * §B2 quy định "uppercase for labels like SCORE/BEST"; ở tầng DOM việc đó do
 * `text-transform: uppercase` lo. Canvas không có CSS nên phải tự làm. Chuỗi
 * trong `i18n` vẫn giữ dạng gốc ('Score') để tầng a11y đọc lên không bị shout.
 */
function upper(text: string): string {
  return text.toUpperCase()
}

export function badgeLabel(delta: number, locale: Locale): string {
  return `+${formatNumber(delta, locale)}`
}

export function hudCardWidth(boardSide: number, gap: number): number {
  return Math.max(0, (boardSide - gap) / 2)
}

/**
 * Bề ngang còn lại cho hai thẻ điểm sau khi chừa chỗ bánh răng Settings ở cuối
 * hàng (§B8:222). HÀM THUẦN.
 */
export function hudCardsWidth(boardSide: number): number {
  return Math.max(0, boardSide - GEAR_SIZE - GEAR_GAP)
}

/** Cỡ số điểm/kỷ lục theo §B2. HÀM THUẦN — test được không cần Phaser. */
export function hudNumberSize(layout: Layout): number {
  return clamp(NUM_PER_VMIN * vmin(layout), NUM_MIN, NUM_MAX)
}

/** Cỡ nhãn SCORE/BEST theo §B2. HÀM THUẦN. */
export function hudLabelSize(layout: Layout): number {
  return clamp(LABEL_PER_VMIN * vmin(layout), LABEL_MIN, LABEL_MAX)
}

/**
 * Bề cao thẻ điểm, đủ chứa nhãn + số ở cỡ §B2.
 *
 * Thẻ cứng 40 px chỉ đúng ở viewport nhỏ: cỡ số chạy tới 30 px, cộng lề trên và
 * nhãn là con số thò ra ngoài mặt thẻ. Thẻ cao lên theo chữ, và vẫn phải nằm gọn
 * trong hàng HUD (`hudHeight` = `boardY - hudY`, §B3:144) — bất biến đó được
 * kiểm bằng một test quét toàn bộ viewport chứ không bằng niềm tin. HÀM THUẦN.
 */
export function hudCardHeight(layout: Layout): number {
  const needed = CARD_PAD_TOP + hudLabelSize(layout) + LABEL_GAP + hudNumberSize(layout) + CARD_PAD_BOTTOM
  return Math.max(CARD_H, needed)
}

export type Hud = {
  setScore(score: number, delta: number | null): void
  setBest(best: number): void
  relayout(layout: Layout): void
  setTheme(theme: PhaserTheme): void
  setReducedMotion(on: boolean): void
  destroy(): void
}

export function createHud(
  scene: Phaser.Scene,
  theme: PhaserTheme,
  layout: Layout,
  opts: {
    getLocale: () => Locale
    getStrings: () => Strings
    /**
     * §B8:222 — bánh răng Settings ở cuối hàng HUD. Task 12 chỉ dựng nút và gọi
     * callback; nối vào panel thật là việc của task settings.
     */
    onSettings: () => void
  },
): Hud {
  let t = theme
  let l = layout
  let reducedMotion = false
  let badge: Phaser.GameObjects.Text | null = null

  // Thẻ vẽ TRƯỚC chữ. Display list của Phaser vẽ theo thứ tự thêm vào, nên thẻ
  // tạo sau sẽ phủ kín con số vừa đặt lên nó — HUD sẽ trắng trơn.
  const cards = [
    scene.add.rectangle(0, 0, 1, CARD_H, t.board),
    scene.add.rectangle(0, 0, 1, CARD_H, t.board),
  ]

  // Màu chữ lấy từ theme, KHÔNG viết cứng: chữ kem `--text-on-dark` trên
  // `--surface-board` của theme sáng chỉ 2.20:1 — dưới cả ngưỡng 3:1, chứ chưa
  // nói 4.5:1 (§B1.3). `--text` cho 7.18:1 ở theme sáng, 12.6:1 ở theme tối và
  // 21:1 ở theme tương phản cao, nên một màu chạy đúng cả ba theme.
  const scoreLabel = crisp(scene.add.text(0, 0, '', {
    fontFamily: FONT_STACK,
    fontSize: `${hudLabelSize(l)}px`,
    color: hex(t.text),
  }))
  const scoreValue = crisp(scene.add.text(0, 0, '0', {
    fontFamily: FONT_STACK,
    fontSize: `${hudNumberSize(l)}px`,
    color: hex(t.text),
    fontStyle: 'bold',
  }))
  const bestLabel = crisp(scene.add.text(0, 0, '', {
    fontFamily: FONT_STACK,
    fontSize: `${hudLabelSize(l)}px`,
    color: hex(t.text),
  }))
  const bestValue = crisp(scene.add.text(0, 0, '0', {
    fontFamily: FONT_STACK,
    fontSize: `${hudNumberSize(l)}px`,
    color: hex(t.text),
    fontStyle: 'bold',
  }))

  const texts = [scoreLabel, scoreValue, bestLabel, bestValue]

  // Bánh răng Settings: hình do `Graphics` vẽ, còn ô chạm là một `Rectangle`
  // trong suốt 44×44. Không gắn `setInteractive()` lên chính `Graphics` được —
  // `Graphics` không có `width`, nên ô bấm sẽ rộng 0 và nút không bấm trúng.
  const gear = scene.add.graphics()
  const gearHit = scene.add.rectangle(0, 0, GEAR_SIZE, GEAR_SIZE, 0, 0)
  gearHit.setInteractive({ useHandCursor: true })
  gearHit.on('pointerup', () => opts.onSettings())

  function gearCenter(): { x: number; y: number } {
    return {
      x: l.hudX + l.hudWidth - GEAR_SIZE / 2,
      // Giữa hàng HUD. `Layout` không có trường `hudHeight` — nó là khoảng cách
      // giữa `hudY` và `boardY`.
      y: l.hudY + (l.boardY - l.hudY) / 2,
    }
  }

  function drawGear(): void {
    const { x: cx, y: cy } = gearCenter()
    gear.clear()
    gear.fillStyle(t.slot, 1)
    gear.fillRoundedRect(cx - GEAR_SIZE / 2, cy - GEAR_SIZE / 2, GEAR_SIZE, GEAR_SIZE, ICON_RADIUS)
    // §B6: icon 24 px optical, nét 2 px. Bánh răng = vành + 8 răng + trục; ở
    // cỡ này ba thứ đó là đủ để đọc ra "cài đặt" mà không cần glyph của font
    // (font có thể thiếu ký tự, còn hình vẽ thì luôn có).
    const r = GEAR_SIZE * 0.26
    gear.lineStyle(ICON_STROKE, t.text, 1)
    gear.strokeCircle(cx, cy, r * 0.72)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      gear.lineBetween(
        cx + Math.cos(a) * r * 0.62,
        cy + Math.sin(a) * r * 0.62,
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r,
      )
    }
    gear.fillStyle(t.text, 1)
    gear.fillCircle(cx, cy, r * 0.3)
    gearHit.setPosition(cx, cy)
  }

  function layoutTexts(): void {
    const s = opts.getStrings()
    const labelSize = hudLabelSize(l)
    const numSize = hudNumberSize(l)
    scoreLabel.setText(upper(s.score))
    bestLabel.setText(upper(s.best))
    // Cỡ chữ bám `vmin` (§B2) nên phải tính lại mỗi lần đổi layout, và DPI có
    // thể đổi khi người chơi kéo cửa sổ sang màn hình khác.
    for (const txt of texts) crisp(txt)
    scoreLabel.setFontSize(labelSize)
    bestLabel.setFontSize(labelSize)
    scoreValue.setFontSize(numSize)
    bestValue.setFontSize(numSize)

    const cardsW = hudCardsWidth(l.hudWidth)
    const half = hudCardWidth(cardsW, l.gap)
    const cardH = hudCardHeight(l)
    const y = l.hudY
    // Mép trên của số: nhãn + khe. Ở cỡ nhỏ nhất (11 px nhãn) ra đúng 16 px như
    // hình học gốc; lớn hơn thì giãn theo, không thì số đè lên nhãn.
    const valueTop = CARD_PAD_TOP + labelSize + LABEL_GAP

    cards[0]!.setPosition(l.hudX + half / 2, y + cardH / 2).setSize(half, cardH)
    cards[1]!.setPosition(l.hudX + cardsW - half / 2, y + cardH / 2).setSize(half, cardH)

    scoreLabel.setPosition(l.hudX + CARD_PAD_X, y + CARD_PAD_TOP)
    scoreValue.setPosition(l.hudX + CARD_PAD_X, y + valueTop)
    bestLabel.setPosition(l.hudX + cardsW - half + CARD_PAD_X, y + CARD_PAD_TOP)
    bestValue.setPosition(l.hudX + cardsW - half + CARD_PAD_X, y + valueTop)

    drawGear()
  }

  function clearBadge(): void {
    if (badge === null) return
    scene.tweens.killTweensOf(badge)
    badge.destroy()
    badge = null
  }

  function showBadge(delta: number): void {
    // Badge cũ phải chết TRƯỚC khi badge mới ra đời: `onComplete` của tween cũ
    // đóng trên biến `badge` dùng chung, nên nếu để nó sống thì cú merge sau sẽ
    // bị chính tween của cú merge trước huỷ mất badge.
    clearBadge()
    const b = crisp(scene.add.text(0, 0, badgeLabel(delta, opts.getLocale()), {
      fontFamily: FONT_STACK,
      fontSize: `${hudLabelSize(l)}px`,
      color: hex(t.text),
      fontStyle: 'bold',
    }))
    b.setPosition(scoreValue.x + scoreValue.width + 6, scoreValue.y)
    badge = b
    scene.tweens.add({
      targets: b,
      y: b.y - BADGE_RISE,
      alpha: 0,
      duration: BADGE_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (badge !== b) return
        badge = null
        b.destroy()
      },
    })
  }

  layoutTexts()

  return {
    setScore(score, delta) {
      scoreValue.setText(formatNumber(score, opts.getLocale()))
      if (delta !== null && delta > 0 && !reducedMotion) showBadge(delta)
    },
    setBest(best) {
      bestValue.setText(formatNumber(best, opts.getLocale()))
    },
    relayout(next) {
      l = next
      // Badge đang bay được tween theo toạ độ CŨ, đổi layout là nó đáp sai chỗ.
      // Nó chỉ sống 600 ms nên bỏ hẳn rẻ hơn là tính lại đường bay.
      clearBadge()
      layoutTexts()
    },
    setTheme(next) {
      t = next
      for (const card of cards) card.setFillStyle(t.board)
      for (const txt of texts) txt.setColor(hex(t.text))
      if (badge !== null) badge.setColor(hex(t.text))
      drawGear()
    },
    setReducedMotion(on) {
      reducedMotion = on
      // §B5: giảm chuyển động ⇒ `--dur-badge: 0ms`. Badge chỉ có một dạng là
      // "bay lên rồi mờ đi", nên không bay nữa thì nó vô hình — bỏ luôn.
      if (on) clearBadge()
    },
    destroy() {
      clearBadge()
      for (const o of [...cards, ...texts, gear, gearHit]) o.destroy()
    },
  }
}
