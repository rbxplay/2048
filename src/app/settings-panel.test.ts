import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveSettings } from '../game/persist'
import type { DialogPhase } from '../phaser/views/dialogs'
import type { OverlayPhase } from './overlay'
import { createSettingsPresenter, settingsMayOpen } from './settings-panel'

/**
 * `settings-panel.ts` nhập `overlay.ts`, mà tệp đó nhập bảng nút của
 * `views/dialogs.ts` — tệp này nhập Phaser dạng giá trị. Mock rỗng là đủ.
 */
vi.mock('phaser', () => ({ default: {} }))

const SETTINGS: SaveSettings = {
  haptics: true,
  reducedMotion: false,
  dpad: 'auto',
  theme: 'dark',
  sfxVolume: 0.4,
}

/**
 * Bảng canvas giả — đúng máy trạng thái của `views/settings.ts`:
 * `open() → 'open'`, `close() → 'closing'` (chỉ từ `'open'`), tween xong →
 * `'closed'`. Nút Đóng của canvas tự đóng rồi mới gọi `onClose`.
 */
function fakePanel() {
  let phase: DialogPhase = 'closed'
  let onClose: (() => void) | null = null
  const opens: SaveSettings[] = []
  return {
    opens,
    open(current: SaveSettings, handler: () => void): void {
      opens.push(current)
      onClose = handler
      phase = 'open'
    },
    close(): void {
      if (phase === 'open') phase = 'closing'
    },
    finishFade(): void {
      if (phase === 'closing') phase = 'closed'
    },
    /** Người chơi bấm nút Đóng vẽ trên canvas. */
    pressCanvasClose(): void {
      if (phase !== 'open') return
      phase = 'closing'
      onClose?.()
    },
    get phase(): DialogPhase {
      return phase
    },
  }
}

let panel: ReturnType<typeof fakePanel>
/** Nhật ký theo thứ tự: mọi thứ presenter làm với thế giới bên ngoài. */
let log: string[]
let paused: boolean
let overlay: OverlayPhase

function presenter() {
  return createSettingsPresenter({
    settings: panel,
    bridge: { setSettingsOpen: (open) => log.push(`dom:${open ? 'open' : 'close'}`) },
    isPaused: () => paused,
    overlayPhase: () => overlay,
    getSettings: () => SETTINGS,
    onOpen: () => log.push('unlock'),
    // Ghi kèm phase lúc được gọi: hộp phải đọc SAU khi trạng thái đã đổi.
    place: () => log.push(`place@${panel.phase}`),
  })
}

beforeEach(() => {
  panel = fakePanel()
  log = []
  paused = false
  overlay = 'closed'
})

describe('settingsMayOpen — cổng chặn, hàm thuần', () => {
  const ok = { paused: false, overlay: 'closed', settings: 'closed' } as const

  it('không pause, không overlay, bảng đã đóng hẳn ⇒ được mở', () => {
    expect(settingsMayOpen(ok)).toBe(true)
  })

  it('pause ⇒ không', () => {
    expect(settingsMayOpen({ ...ok, paused: true })).toBe(false)
  })

  it("overlay 'open' hoặc 'closing' ⇒ không — card còn phơi trước mắt", () => {
    expect(settingsMayOpen({ ...ok, overlay: 'open' })).toBe(false)
    expect(settingsMayOpen({ ...ok, overlay: 'closing' })).toBe(false)
  })

  it("bảng 'open' hoặc 'closing' ⇒ không", () => {
    expect(settingsMayOpen({ ...ok, settings: 'open' })).toBe(false)
    expect(settingsMayOpen({ ...ok, settings: 'closing' })).toBe(false)
  })
})

describe('SettingsPresenter.open — hệ quả quan sát được', () => {
  it('mở ở cả hai tầng: canvas trước, DOM sau, rồi mới đặt chỗ', () => {
    presenter().open()
    expect(panel.phase).toBe('open')
    expect(panel.opens).toEqual([SETTINGS])
    expect(log).toEqual(['unlock', 'dom:open', 'place@open'])
  })

  it('đang PAUSE: không tầng nào mở, không mở khoá âm thanh, không dời nút DOM', () => {
    paused = true
    presenter().open()
    expect(panel.phase).toBe('closed')
    expect(log).toEqual([])
  })

  it('dialog đang MỞ (bánh răng canvas bấm xuyên lớp phủ): bảng không mở chồng lên', () => {
    overlay = 'open'
    presenter().open()
    expect(panel.phase).toBe('closed')
    expect(log).toEqual([])
  })

  it("dialog đang mờ dần ('closing'): vẫn không mở", () => {
    overlay = 'closing'
    presenter().open()
    expect(panel.opens).toEqual([])
    expect(log).toEqual([])
  })

  it('bảng đang mở mà mở nữa: KHÔNG gọi lại open() của canvas (không nháy alpha)', () => {
    const p = presenter()
    p.open()
    p.open()
    p.open()
    expect(panel.opens).toHaveLength(1)
    expect(log).toEqual(['unlock', 'dom:open', 'place@open'])
  })

  it("bảng đang mờ dần ('closing'): chưa mở lại được; mờ xong thì được", () => {
    const p = presenter()
    p.open()
    p.close()
    p.open()
    expect(panel.opens).toHaveLength(1)
    panel.finishFade()
    p.open()
    expect(panel.opens).toHaveLength(2)
  })
})

describe('SettingsPresenter.close — Esc, nút Đóng DOM, nút Đóng canvas', () => {
  it('close(): đóng cả hai tầng NGAY lúc vào closing, không đợi hết fade', () => {
    const p = presenter()
    p.open()
    log.length = 0
    p.close()
    expect(panel.phase).toBe('closing')
    // Tầng DOM (trả focus, rời thứ tự Tab) được báo khi tween CHƯA xong.
    expect(log).toEqual(['dom:close', 'place@closing'])
  })

  it('nút Đóng của CANVAS đi cùng đường: tầng DOM đóng theo, đúng một lần', () => {
    const p = presenter()
    p.open()
    log.length = 0
    panel.pressCanvasClose()
    expect(log).toEqual(['dom:close', 'place@closing'])
    // Esc bấm liền sau đó, trong lúc mờ dần, không đóng lần hai.
    p.close()
    expect(log).toEqual(['dom:close', 'place@closing'])
  })

  it('close() khi bảng không mở là no-op thật', () => {
    presenter().close()
    expect(log).toEqual([])
    expect(panel.phase).toBe('closed')
  })

  it('đóng được cả khi đang pause — pause chỉ chặn MỞ', () => {
    const p = presenter()
    p.open()
    paused = true
    log.length = 0
    p.close()
    expect(log).toEqual(['dom:close', 'place@closing'])
  })
})
