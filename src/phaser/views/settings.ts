import type Phaser from 'phaser'
import type { SaveSettings, ThemeName } from '../../game/persist'
import type { Strings } from '../../i18n'
import { DARK_HEX, hexToInt } from '../../theme/palette'
import type { Layout } from '../layout'
import type { PhaserTheme } from '../theme'
import { crisp, drawFloatShadow, FONT_STACK, hexFromInt } from './canvas'
import {
  CARD_RADIUS,
  dialogCardWidth,
  OVERLAY_MS,
  OVERLAY_REDUCED_MS,
} from './dialogs'
import { hudLabelSize } from './hud'

/**
 * Bảng Settings vẽ trong canvas.
 *
 * §A9 / §B10 mục 2 / INT-09: **KHÔNG có nút tắt tiếng tổng**. Bảng chỉ có slider
 * âm lượng SFX. Đây là điều kiện certification của YouTube Playables, không phải
 * lựa chọn thiết kế — thêm một nút "tắt tiếng" cho tiện là làm hỏng điều kiện đó.
 * Bốn khoá cài đặt phát ra từ đây đúng bằng bốn khoá của `A11ySettingsPatch` ở
 * `a11y/bridge.ts`; không có khoá thứ năm.
 *
 * §B8 xếp Settings vào nhóm "Dialog / overlay", nên bảng dùng chung hình học với
 * `views/dialogs.ts`: scrim `rgba(23,22,26,.6)`, card `--page` trên `--shadow-float`,
 * bo góc 16 px, bề ngang `min(88vw, 420px)`, mờ vào theo `--dur-overlay`.
 *
 * Canvas là nguồn hiển thị; bản DOM cho screen reader đã có ở `a11y/bridge.ts`
 * (Task 14) và Task 18 nối hai bên. Tệp này KHÔNG dựng phần tử DOM nào.
 */

/** §12.1: ba lựa chọn loại trừ nhau — cùng thứ tự với `THEMES` của `a11y/bridge.ts`. */
const THEMES: readonly ThemeName[] = ['light', 'dark', 'contrast']
const THEME_LABEL: Record<ThemeName, keyof Strings> = {
  light: 'themeLight',
  dark: 'themeDark',
  contrast: 'themeContrast',
}

/** Bước làm tròn của slider: 1/20 ⇒ payload save gọn và giá trị lặp lại được. */
export const VOLUME_STEPS = 20
/** A11Y-07 / §12.3: ô chạm tối thiểu 44×44. */
export const TOGGLE_SIZE = 44
/** §B8/B6: container icon bo góc 8 px. Cũng là dấu nhận dạng hình toggle khi test. */
const TOGGLE_RADIUS = 8
/** §B6: nét icon 2 px. */
const CHECK_STROKE = 2

/** Lề trong card — trùng `CARD_PAD` của `dialogs.ts`. */
const PAD = 20
/** Khe tối thiểu giữa card và mép viewport. */
const MARGIN = 8
/** Dải tiêu đề phía trên hàng đầu. */
const HEAD = 40
/** Chiều cao hàng khi đủ chỗ. */
const ROW_H = 56
/** Sàn chiều cao hàng — A11Y-07 thắng cả khi card phải cao hơn viewport. */
const ROW_MIN = 44
/** Khe dọc giữa khối hàng và nút Close. */
const CLOSE_GAP = 12
/** §B8: nút cao ≥ 48 px trên thiết bị cảm ứng. */
const CLOSE_H = 48
/**
 * Bề ngang nút chọn theme. Cố định có chủ ý: `setInteractive()` chụp ô bấm ngay
 * lúc gọi, nên một hình vừa nhận input vừa đổi bề ngang theo layout sẽ có ô bấm
 * sai cỡ. Nút này đủ hẹp để lọt mọi viewport từ 280 px trở lên.
 */
const THEME_BTN_W = 120

/** Bề ngang tối đa của rãnh slider. */
const TRACK_W_MAX = 200
const TRACK_H = 6
const KNOB_R = 10
/**
 * Ô kéo của slider cao 44 px và RỘNG CỐ ĐỊNH (xem `THEME_BTN_W`). Rãnh vẽ có
 * thể hẹp hơn ở viewport rất hẹp; khi đó 20 px cuối của ô kéo vẫn ánh xạ về 1.0 —
 * đúng chỗ con trượt đang đứng, nên không sai lệch.
 */
const SLIDER_HIT_W = TRACK_W_MAX
const TAP_H = 44
/** Bốn hàng: âm lượng, rung, giảm chuyển động, giao diện. */
const ROW_COUNT = 4
/** §B8: scrim `rgba(23,22,26,.6)`. */
const SCRIM_ALPHA = 0.6

export type Settings = {
  open(current: SaveSettings, onClose: () => void): void
  close(): void
  readonly isOpen: boolean
  relayout(layout: Layout): void
  setTheme(theme: PhaserTheme): void
  /**
   * §B14:445 — token chuyển động ghi đè được bằng CẢ media query
   * `prefers-reduced-motion` lẫn công tắc trong game. Công tắc trong game đi
   * qua đây; tầng ghép nối gọi khi state đổi.
   */
  setReducedMotion(on: boolean): void
  destroy(): void
}

/**
 * Hộp bao card Settings: §B8 `min(88vw, 420px)`, cao vừa đủ bốn hàng.
 *
 * Sàn `ROW_MIN` thắng trần viewport: màn hình quá thấp thì card cao hơn màn hình
 * chứ không bóp hàng xuống dưới 44 px. HÀM THUẦN.
 */
export function settingsCardBox(layout: Layout): { w: number; h: number; rowH: number } {
  const w = dialogCardWidth(layout.width)
  const fixed = PAD * 2 + HEAD + CLOSE_GAP + CLOSE_H
  const natural = fixed + ROW_COUNT * ROW_H
  const floor = fixed + ROW_COUNT * ROW_MIN
  const cap = layout.height - 2 * MARGIN
  const h = Math.min(natural, Math.max(floor, cap))
  return { w, h, rowH: (h - fixed) / ROW_COUNT }
}

/**
 * Vị trí con trỏ → tỉ lệ 0..1 trên rãnh. Đầu vào hỏng (NaN, vô cực, rãnh rộng 0)
 * trả 0 chứ không trả NaN — giá trị này đi thẳng vào save. HÀM THUẦN.
 */
export function sliderRatio(x: number, trackLeft: number, trackWidth: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(trackLeft) || !Number.isFinite(trackWidth)) return 0
  if (trackWidth <= 0) return 0
  return Math.min(1, Math.max(0, (x - trackLeft) / trackWidth))
}

/**
 * Tỉ lệ → mức âm lượng đã kẹp `[0, 1]` và bám bước 1/20. HÀM THUẦN.
 *
 * `Math.round(r * 20) / 20` cho ra đúng giá trị double của literal (`14/20` là
 * cùng một double với `0.7`), nên payload save sạch chứ không đầy đuôi nhị phân.
 */
export function snapVolume(ratio: number): number {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  return Math.round(r * VOLUME_STEPS) / VOLUME_STEPS
}

/** `input.hitArea` của Phaser, tối thiểu những gì đường này cần. */
type HitArea = { setSize?: (w: number, h: number) => void; width?: number; height?: number }

/**
 * Phaser đo ô bấm NGAY LÚC `setInteractive()`; `setSize()` sau đó không cập nhật
 * `hitArea`. Nút Close rộng theo lòng card nên mỗi lần đổi layout phải đồng bộ
 * lại ô bấm, nếu không nút chỉ còn bấm trúng một điểm ảnh.
 */
function syncHitArea(go: Phaser.GameObjects.Rectangle, w: number, h: number): void {
  const hit: HitArea | undefined = go.input?.hitArea as HitArea | undefined
  if (hit === undefined) return
  if (typeof hit.setSize === 'function') hit.setSize(w, h)
  else {
    hit.width = w
    hit.height = h
  }
}

type Fadeable = Phaser.GameObjects.GameObject & {
  alpha: number
  setAlpha(value?: number): unknown
  setVisible(value: boolean): unknown
}

export function createSettings(
  scene: Phaser.Scene,
  theme: PhaserTheme,
  layout: Layout,
  opts: { getStrings: () => Strings; onChange: (patch: Partial<SaveSettings>) => void },
): Settings {
  let t = theme
  let l = layout
  let isOpen = false
  let state: SaveSettings | null = null
  let themeIndex = 0
  let onClose: (() => void) | null = null
  let reducedMotion = false
  let fade: Phaser.Tweens.Tween | null = null
  /** Hình học rãnh slider của lần xếp layout gần nhất; con trỏ ánh xạ theo đây. */
  let trackLeft = 0
  let trackWidth = 0

  const text = (size: number, color: number, bold = false): Phaser.GameObjects.Text =>
    crisp(
      scene.add.text(0, 0, '', {
        fontFamily: FONT_STACK,
        fontSize: `${size}px`,
        color: hexFromInt(color),
        ...(bold ? { fontStyle: 'bold' } : {}),
      }),
    )

  // §B8: scrim `rgba(23,22,26,.6)` — đúng màu `--page` của theme tối ở alpha
  // 0.6, lấy từ token chứ không chép hex.
  const scrim = scene.add.rectangle(0, 0, 1, 1, hexToInt(DARK_HEX.page), SCRIM_ALPHA)
  // Bóng thêm TRƯỚC card để nằm dưới: display list vẽ theo thứ tự thêm vào.
  const shadow = scene.add.graphics()
  const card = scene.add.graphics()

  const title = text(20, t.text, true)
  // Gốc toạ độ phải khớp cách xếp bên dưới: nhãn canh MÉP TRÁI (0, 0.5), còn
  // nút và ô chạm canh TÂM (mặc định). `Rectangle`/`Text` của Phaser mặc định
  // gốc ở giữa, nên đặt nhãn tại `contentL` mà quên `setOrigin` là chữ thò ra
  // ngoài lề card mất một nửa.
  title.setOrigin(0, 0)
  // Nhãn lấy màu `--text` của theme. Màu chữ của theme sáng viết cứng sẽ là chữ
  // nâu đen trên card `--page` của theme tối và theme tương phản cao — vô hình.
  const soundLabel = text(hudLabelSize(l), t.text).setOrigin(0, 0.5)
  const hapticsLabel = text(hudLabelSize(l), t.text).setOrigin(0, 0.5)
  const motionLabel = text(hudLabelSize(l), t.text).setOrigin(0, 0.5)
  const themeRowLabel = text(hudLabelSize(l), t.text).setOrigin(0, 0.5)

  // Rãnh canh mép trái: `sliderRatio` và con trượt đều tính từ `trackLeft`.
  const track = scene.add.rectangle(0, 0, TRACK_W_MAX, TRACK_H, t.slot).setOrigin(0, 0.5)
  const knob = scene.add.circle(0, 0, KNOB_R, t.btn)

  // Ô kéo: trong suốt, cao 44 px, phủ cả rãnh. Con trượt chỉ để nhìn — bắt người
  // chơi kéo trúng đúng viên tròn 20 px là ô chạm 20 px, dưới sàn A11Y-07.
  const sliderHit = scene.add.rectangle(0, 0, SLIDER_HIT_W, TAP_H, 0, 0)
  sliderHit.setInteractive({ useHandCursor: true })
  scene.input.setDraggable(sliderHit)

  const toggleFace = scene.add.graphics()
  const makeToggleHit = (): Phaser.GameObjects.Rectangle => {
    const hit = scene.add.rectangle(0, 0, TOGGLE_SIZE, TOGGLE_SIZE, 0, 0)
    hit.setInteractive({ useHandCursor: true })
    return hit
  }
  const hapticsHit = makeToggleHit()
  const motionHit = makeToggleHit()

  const themeBtn = scene.add.rectangle(0, 0, THEME_BTN_W, CLOSE_H, t.btn)
  themeBtn.setInteractive({ useHandCursor: true })
  const themeLabel = text(hudLabelSize(l), t.textOnDark)
  themeLabel.setOrigin(0.5, 0.5)

  const closeBtn = scene.add.rectangle(0, 0, THEME_BTN_W, CLOSE_H, t.btn)
  closeBtn.setInteractive({ useHandCursor: true })
  const closeLabel = text(hudLabelSize(l), t.textOnDark)
  closeLabel.setOrigin(0.5, 0.5)

  const all: Phaser.GameObjects.GameObject[] = [
    scrim,
    shadow,
    card,
    title,
    soundLabel,
    hapticsLabel,
    motionLabel,
    themeRowLabel,
    track,
    knob,
    sliderHit,
    toggleFace,
    hapticsHit,
    motionHit,
    themeBtn,
    themeLabel,
    closeBtn,
    closeLabel,
  ]
  /** Chữ đặt trên nền `--page` ⇒ màu `--text`. Hai nhãn nút nằm trên `--btn`. */
  const onPage: Phaser.GameObjects.Text[] = [
    title,
    soundLabel,
    hapticsLabel,
    motionLabel,
    themeRowLabel,
  ]
  const onButton: Phaser.GameObjects.Text[] = [themeLabel, closeLabel]

  function currentTheme(): ThemeName {
    return THEMES[themeIndex] ?? 'light'
  }

  function cardBox(): { x: number; y: number; w: number; h: number } {
    const { w, h } = settingsCardBox(l)
    return { x: l.width / 2 - w / 2, y: l.height / 2 - h / 2, w, h }
  }

  /** Nội dung chữ. Màu không đụng tới — đó là việc của `paintColors`. */
  function paintText(): void {
    const s = opts.getStrings()
    title.setText(s.settings)
    soundLabel.setText(s.sound)
    hapticsLabel.setText(s.haptics)
    motionLabel.setText(s.reducedMotion)
    themeRowLabel.setText(s.theme)
    themeLabel.setText(s[THEME_LABEL[currentTheme()]])
    closeLabel.setText(s.close)
  }

  function paintColors(): void {
    for (const txt of onPage) txt.setColor(hexFromInt(t.text))
    for (const txt of onButton) txt.setColor(hexFromInt(t.textOnDark))
    track.setFillStyle(t.slot)
    knob.setFillStyle(t.btn)
    themeBtn.setFillStyle(t.btn)
    closeBtn.setFillStyle(t.btn)
  }

  function drawCard(): void {
    const box = cardBox()
    drawFloatShadow(shadow, box)
    card.clear()
    card.fillStyle(t.page, 1)
    card.fillRoundedRect(box.x, box.y, box.w, box.h, CARD_RADIUS)
    // §B1.5: ở theme tương phản cao, card `--page` nằm trên nền cùng màu đen nên
    // hình dạng phải do nét vẽ giữ, không phải do màu nền.
    card.lineStyle(t.hairlineWidth, t.text, 1)
    card.strokeRoundedRect(box.x, box.y, box.w, box.h, CARD_RADIUS)
  }

  /** Mặt hai toggle: nền + nét viền + glyph tick khi bật. */
  function drawToggles(): void {
    toggleFace.clear()
    const pairs: ReadonlyArray<[Phaser.GameObjects.Rectangle, boolean]> = [
      [hapticsHit, state?.haptics === true],
      [motionHit, state?.reducedMotion === true],
    ]
    for (const [hit, on] of pairs) {
      const x = hit.x - TOGGLE_SIZE / 2
      const y = hit.y - TOGGLE_SIZE / 2
      toggleFace.fillStyle(on ? t.btn : t.slot, 1)
      toggleFace.fillRoundedRect(x, y, TOGGLE_SIZE, TOGGLE_SIZE, TOGGLE_RADIUS)
      toggleFace.lineStyle(t.hairlineWidth, t.text, 1)
      toggleFace.strokeRoundedRect(x, y, TOGGLE_SIZE, TOGGLE_SIZE, TOGGLE_RADIUS)
      if (!on) continue
      // Trạng thái bật phải đọc được mà không cần phân biệt màu: dấu tick.
      const cx = hit.x
      const cy = hit.y
      toggleFace.lineStyle(CHECK_STROKE, t.textOnDark, 1)
      toggleFace.lineBetween(cx - 9, cy + 1, cx - 3, cy + 7)
      toggleFace.lineBetween(cx - 3, cy + 7, cx + 9, cy - 8)
    }
  }

  function setVolumeFromX(x: number): void {
    const volume = snapVolume(sliderRatio(x, trackLeft, trackWidth))
    if (state !== null) state = { ...state, sfxVolume: volume }
    knob.setPosition(trackLeft + volume * trackWidth, knob.y)
    opts.onChange({ sfxVolume: volume })
  }

  sliderHit.on('pointerdown', (p: Phaser.Input.Pointer) => setVolumeFromX(p.x))
  sliderHit.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => setVolumeFromX(dragX))

  hapticsHit.on('pointerup', () => {
    if (state === null) return
    state = { ...state, haptics: !state.haptics }
    drawToggles()
    opts.onChange({ haptics: state.haptics })
  })

  motionHit.on('pointerup', () => {
    if (state === null) return
    state = { ...state, reducedMotion: !state.reducedMotion }
    drawToggles()
    opts.onChange({ reducedMotion: state.reducedMotion })
  })

  themeBtn.on('pointerup', () => {
    themeIndex = (themeIndex + 1) % THEMES.length
    const next = currentTheme()
    if (state !== null) state = { ...state, theme: next }
    paintText()
    opts.onChange({ theme: next })
  })

  closeBtn.on('pointerup', () => {
    close()
    onClose?.()
  })

  function relayoutAll(): void {
    const { w, h, rowH } = settingsCardBox(l)
    const cx = l.width / 2
    const cy = l.height / 2
    const left = cx - w / 2
    const top = cy - h / 2
    const contentL = left + PAD
    const contentR = left + w - PAD
    const inner = w - PAD * 2

    scrim.setPosition(cx, cy).setSize(l.width, l.height)
    drawCard()

    const titleSize = Math.min(24, Math.max(18, 0.05 * Math.min(l.width, l.height)))
    title.setFontSize(titleSize).setPosition(contentL, top + PAD)

    const rowsTop = top + PAD + HEAD
    const rowTop = (i: number): number => rowsTop + i * rowH
    const rowCy = (i: number): number => rowTop(i) + rowH / 2
    const labelSize = hudLabelSize(l)

    // Hàng 0 — âm lượng. Nhãn đứng RIÊNG một dòng, rãnh nằm dưới và rộng bằng cả
    // lòng card: nhãn "Giảm chuyển động" của tiếng Việt ở cỡ tối thiểu đã chiếm
    // gần 100 px, xếp rãnh cùng dòng là hai bên chồng lên nhau ở viewport hẹp.
    trackWidth = Math.min(TRACK_W_MAX, inner)
    trackLeft = contentL
    const trackY = rowTop(0) + Math.min(40, rowH - 10)
    soundLabel.setFontSize(labelSize).setPosition(contentL, rowTop(0) + 6)
    track.setPosition(trackLeft, trackY).setSize(trackWidth, TRACK_H)
    knob.setPosition(trackLeft + (state?.sfxVolume ?? 0) * trackWidth, trackY)
    // Ô kéo rộng cố định nên KHÔNG gọi `setSize` — ô bấm đã chụp đúng cỡ lúc dựng.
    sliderHit.setPosition(trackLeft + SLIDER_HIT_W / 2, trackY)

    // Hàng 1, 2 — hai toggle.
    const toggleX = contentR - TOGGLE_SIZE / 2
    hapticsLabel.setFontSize(labelSize).setPosition(contentL, rowCy(1))
    hapticsHit.setPosition(toggleX, rowCy(1))
    motionLabel.setFontSize(labelSize).setPosition(contentL, rowCy(2))
    motionHit.setPosition(toggleX, rowCy(2))
    drawToggles()

    // Hàng 3 — chọn theme.
    themeRowLabel.setFontSize(labelSize).setPosition(contentL, rowCy(3))
    const themeCx = contentR - THEME_BTN_W / 2
    themeBtn.setPosition(themeCx, rowCy(3))
    themeLabel.setFontSize(labelSize).setPosition(themeCx, rowCy(3))

    // Nút Close rộng theo lòng card ⇒ phải đồng bộ lại ô bấm mỗi lần đổi layout.
    const closeCy = top + h - PAD - CLOSE_H / 2
    closeBtn.setPosition(cx, closeCy).setSize(inner, CLOSE_H)
    syncHitArea(closeBtn, inner, CLOSE_H)
    closeLabel.setFontSize(labelSize).setPosition(cx, closeCy)
  }

  function fadeTargets(): Fadeable[] {
    return all as unknown as Fadeable[]
  }

  function fadeMs(): number {
    return reducedMotion ? OVERLAY_REDUCED_MS : OVERLAY_MS
  }

  function stopFade(): void {
    if (fade === null) return
    scene.tweens.killTweensOf(fadeTargets())
    fade = null
  }

  function applyVisibility(visible: boolean): void {
    for (const o of fadeTargets()) o.setVisible(visible)
  }

  function close(): void {
    isOpen = false
    if (reducedMotion) {
      stopFade()
      applyVisibility(false)
      return
    }
    fade = scene.tweens.add({
      targets: fadeTargets(),
      alpha: 0,
      duration: fadeMs(),
      ease: 'Sine.easeIn',
      onComplete: () => applyVisibility(false),
    })
  }

  applyVisibility(false)
  paintText()
  paintColors()
  relayoutAll()

  return {
    open(current, handler) {
      stopFade()
      isOpen = true
      state = { ...current }
      themeIndex = Math.max(0, THEMES.indexOf(current.theme))
      onClose = handler
      paintText()
      paintColors()
      relayoutAll()
      for (const o of fadeTargets()) {
        o.setVisible(true)
        o.setAlpha(0)
      }
      fade = scene.tweens.add({
        targets: fadeTargets(),
        alpha: 1,
        duration: fadeMs(),
        ease: 'Sine.easeOut',
      })
    },
    close,
    get isOpen() {
      return isOpen
    },
    relayout(next) {
      l = next
      relayoutAll()
    },
    setTheme(next) {
      t = next
      paintColors()
      drawCard()
      drawToggles()
    },
    setReducedMotion(on) {
      reducedMotion = on
      if (!on) return
      // Đang mở mà bật giảm chuyển động thì hiện thẳng, không để panel lửng lơ
      // giữa chừng mờ.
      stopFade()
      if (isOpen) for (const o of fadeTargets()) o.setAlpha(1)
    },
    destroy() {
      stopFade()
      scene.input.setDraggable(sliderHit, false)
      for (const o of all) o.destroy()
    },
  }
}
