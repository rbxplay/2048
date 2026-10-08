// Composition root — Task 18.
//
// Tệp này CỐ Ý mỏng: nó chỉ ghép nối vòng đời và điều phối, mọi quyết định đã
// nằm ở nơi test được (`app/session.ts` luật ván, `app/ads.ts` chính sách quảng
// cáo, `app/overlay.ts` cặp overlay canvas–DOM, `platform/` SDK). Nhờ vậy thứ
// duy nhất phải kiểm bằng mắt là chính tệp này.
//
// Ba bất biến của tầng này:
//  1. DOM là bản CHIẾU chỉ đọc của canvas: mọi callback từ tầng a11y đi vào
//     đúng những hàm `onDir` / `applyAction` / `applySetting` mà canvas dùng —
//     không có đường thứ hai vào logic.
//  2. Overlay canvas và dialog DOM mở/đóng qua MỘT cửa duy nhất
//     (`OverlayPresenter`), kể cả ở `Esc`, `onPause` và `onResume`.
//  3. Input bị chặn theo STATE, không theo listener: gỡ listener bàn phím là
//     mất luôn đường `Esc` đóng dialog.

import Phaser from 'phaser'
// Thứ tự import CSS: token trước, rồi khung trang, rồi tầng a11y.
import './styles/tokens.css'
import './styles/app.css'
import './a11y/bridge.css'
import { createA11yBridge } from './a11y/bridge'
import { shouldRequestInterstitial } from './app/ads'
import { createHaptics } from './app/haptics'
import {
  createOverlayPresenter,
  overlayForStatus,
  type OverlayPresenter,
} from './app/overlay'
import {
  applyInput, createSession, keepPlaying, newGame, toSave,
  type SessionState, type Step,
} from './app/session'
import { createSfx } from './audio/sfx'
import { makeIdFactory } from './game/board'
import type { SaveData } from './game/persist'
import type { Dir, MoveContext } from './game/rules'
import { mulberry32 } from './game/rng'
import { normalizeLocale, stringsFor, type Locale, type Strings } from './i18n'
import { buildConfig } from './phaser/config'
import { attachKeyboardInput } from './phaser/input'
import { computeLayout } from './phaser/layout'
import type { BoardScene } from './phaser/scenes/Board'
import { applyThemeToDom, buildTheme, type ThemeName } from './phaser/theme'
import { createDialogs, type DialogAction } from './phaser/views/dialogs'
import { createDpad } from './phaser/views/dpad'
import { createHud } from './phaser/views/hud'
import { createSettings } from './phaser/views/settings'
import { selectPlatform } from './platform/select'
import type { GamePlatform } from './platform/types'

/**
 * Gỡ màn loading tĩnh khỏi mắt người chơi.
 *
 * Dùng `hidden` chứ không `remove()`: `styles/app.css` đã có luật
 * `#screen[hidden] { display: none }`, và luật đó chỉ có nghĩa nếu đường này
 * được dùng thật.
 */
function hideLoadingScreen(): void {
  const loading = document.getElementById('screen')
  if (loading !== null) loading.hidden = true
}

async function boot(): Promise<void> {
  const platform: GamePlatform = await selectPlatform()
  // Hợp đồng của `GamePlatform`: init() KHÔNG BAO GIỜ throw.
  await platform.init()

  // §10.3 / rủi ro R1: `AudioContext` tạo NGAY LÚC BOOT, không chờ user
  // gesture. Bỏ lần gọi này thì âm `spawn` của ván đầu câm vì context chưa có.
  const sfx = createSfx()
  sfx.unlock()
  const haptics = createHaptics()

  // §9.2: `firstFrameReady()` phải gọi khi màn loading còn hiện — màn tĩnh
  // trong index.html chính là frame đầu tiên.
  platform.notifyFirstFrame()

  let saved: SaveData | null = null
  try {
    saved = await platform.load()
  } catch {
    // Đọc save hỏng KHÔNG được chặn ván mới: chơi được là trên hết.
    saved = null
    platform.logError()
  }

  const locale: Locale = normalizeLocale(await platform.getLanguage())
  const strings: Strings = stringsFor(locale)

  // MỘT `ctx` cho cả ván. `resume` và mọi nước đi sau đó phải dùng chung bộ đếm
  // id, nếu không tile khôi phục từ save và tile sinh ra ở nước đầu tiên sẽ
  // trùng id — mà id là danh tính node của renderer (§6.1).
  const ctx: MoveContext = { rng: mulberry32(Date.now() >>> 0), nextId: makeIdFactory() }

  let state: SessionState = createSession({
    ctx,
    best: saved?.best ?? 0,
    // `exactOptionalPropertyTypes`: chỉ truyền khoá khi thật sự có giá trị.
    ...(saved === null ? {} : { stats: saved.stats, settings: saved.settings }),
    resume:
      saved === null
        ? null
        : {
            board: saved.board,
            score: saved.score,
            moves: saved.moves,
            won: saved.won,
            keepPlaying: saved.keepPlaying,
          },
  })

  let themeName: ThemeName = state.settings.theme
  let theme = buildTheme(themeName)
  applyThemeToDom(themeName)

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

  const bridge = createA11yBridge()
  // §12.1: nhãn phải có TRƯỚC khi dựng điều khiển — `mountControls` gọi
  // `relabel()` đúng một lần, nên gọi ngược thứ tự là mọi nút DOM sinh ra
  // không có tên.
  bridge.setStrings(strings)
  document.body.appendChild(bridge.root)

  const game = new Phaser.Game(buildConfig(theme.page))

  let scene: BoardScene | null = null
  let hud: ReturnType<typeof createHud> | null = null
  let dialogs: ReturnType<typeof createDialogs> | null = null
  let dpad: ReturnType<typeof createDpad> | null = null
  let settings: ReturnType<typeof createSettings> | null = null
  let overlayView: OverlayPresenter | null = null

  /** Bắt đầu phiên chơi — mốc so cho chính sách quảng cáo 30 giây (§A8). */
  let sessionStartedAt = performance.now()
  /** Số lần GAME OVER đã xảy ra trong phiên. */
  let gameOvers = 0
  /** Kỷ lục đã gửi `sendScore` lần cuối, để không báo lại cùng một con số. */
  let lastReportedBest = state.best

  // Điều khiển DOM của §12.1 dựng ngay bây giờ: người dùng bàn phím có đường
  // vào game trước cả khi scene đầu tiên kịp vẽ.
  bridge.mountControls({
    onDir,
    onSettings: openSettings,
    onSettingsChange: applySetting,
    initial: state.settings,
  })

  // ---------- lưu (§9.4) ----------

  function nowIso(): string {
    return new Date().toISOString()
  }

  /**
   * Lưu ở milestone. §9.4: bắt đầu ván · win · game over · pause · mỗi mốc
   * 1000 điểm. `pause` gọi thẳng `platform.save` vì nó không sinh `Step`.
   */
  function saveIfNeeded(milestones: readonly string[]): void {
    if (milestones.length === 0) return
    // Ghi save hỏng không được làm gián đoạn ván (hợp đồng GamePlatform), nên
    // promise này cố ý không được await trên đường chơi.
    void platform.save(toSave(state, nowIso()))
    // `sendScore` chỉ khi kỷ lục THẬT SỰ tăng: báo lại đúng con số cũ ở mỗi
    // milestone là cuộc gọi thừa, mà mỗi cuộc gọi có timeout 2 giây.
    if (state.best > lastReportedBest) {
      lastReportedBest = state.best
      void platform.reportScore(state.best)
    }
  }

  // ---------- chiếu state ra hai tầng ----------

  /**
   * Bản DOM và bản canvas đọc từ CÙNG một nguồn: `state` và `step.move`.
   *
   * Review Focus mục 1 — cao nhất trong danh sách rủi ro review: không nhánh
   * nào được phép chỉ cập nhật một bên.
   */
  function syncAll(step: Step | null): void {
    hud?.setScore(state.score, step?.move?.scoreDelta ?? null)
    hud?.setBest(state.best)
    bridge.syncBoard(state.board)
    bridge.announceScore(state.score, locale)
    if (scene === null) return
    if (step !== null && step.move !== null) scene.playOutcome(step.move)
    else scene.renderBoard(state.board)
  }

  /** Mở overlay ở CẢ HAI tầng — xem `app/overlay.ts`. */
  function showOverlay(kind: 'win' | 'over'): void {
    overlayView?.open(kind)
  }

  /** Đóng overlay ở cả hai tầng. Idempotent ở cả hai tầng. */
  function closeOverlay(): void {
    overlayView?.close()
  }

  // ---------- cài đặt ----------

  function openSettings(): void {
    sfx.unlock()
    settings?.open(state.settings, closeSettings)
  }

  function closeSettings(): void {
    // Đóng bảng không đổi state: mọi thay đổi đã đi qua `applySetting` ngay lúc
    // người chơi tác động, nên không còn gì để chốt.
  }

  /**
   * Giảm chuyển động khi state BẬT hoặc khi hệ điều hành yêu cầu.
   *
   * §B5/A11Y-06 và §B14: token chuyển động phải ghi đè được qua CẢ media query
   * LẪN công tắc trong game — chỉ nối một trong hai là mới làm được nửa yêu cầu.
   */
  function applyReducedMotion(): void {
    const on = state.settings.reducedMotion || motionQuery.matches
    scene?.setReducedMotion(on)
    hud?.setReducedMotion(on)
    dialogs?.setReducedMotion(on)
    settings?.setReducedMotion(on)
  }

  /**
   * Điểm vào DUY NHẤT cho mọi thay đổi cài đặt: bảng Settings trong canvas
   * (`onChange`) và bốn ô nhập DOM của §12.1 (`onSettingsChange`) cùng gọi hàm
   * này, nên DOM không phải đường thứ hai vào logic.
   *
   * Kiểu patch lấy thẳng từ state (`Partial<SaveData['settings']>`) chứ không
   * từ bản sao trong `a11y/bridge.ts`: hai định nghĩa song song là hai định
   * nghĩa sẽ lệch nhau.
   */
  function applySetting(patch: Partial<SaveData['settings']>): void {
    state = { ...state, settings: { ...state.settings, ...patch } }

    if (patch.reducedMotion !== undefined) applyReducedMotion()
    if (patch.theme !== undefined) {
      themeName = patch.theme
      theme = buildTheme(themeName)
      applyThemeToDom(themeName)
      scene?.setTheme(theme)
      hud?.setTheme(theme)
      dialogs?.setTheme(theme)
      dpad?.setTheme(theme)
      settings?.setTheme(theme)
    }
    if (patch.sfxVolume !== undefined) sfx.setVolume(patch.sfxVolume)
    if (patch.haptics !== undefined) haptics.setEnabled(patch.haptics)

    // Bản chiếu DOM phải theo state bất kể thay đổi đến từ canvas hay từ chính
    // nó: thiếu dòng này thì kéo thanh SFX trên canvas xong, ô nhập DOM vẫn ghi
    // giá trị cũ, và hai bản lệch nhau.
    bridge.syncControls(state.settings)
    void platform.save(toSave(state, nowIso()))
  }

  // ---------- input ----------

  function onDir(dir: Dir): void {
    sfx.unlock()

    // Cổng chặn đặt Ở ĐÂY, theo state — không phải bằng cách gỡ listener.
    // `input.ts` dùng CHUNG một listener cho `Esc` và các phím mũi tên, nên gỡ
    // nó khi overlay mở là mất luôn đường `Esc` đóng dialog (§A11).
    if (settings?.isOpen === true) return

    const step = applyInput(state, dir, ctx)
    // `move === null` nghĩa là input bị bỏ qua vì overlay đang mở — KHÁC hẳn
    // "nước đi không đổi gì" (`moved === false`). Hai ca này phải xử lý khác
    // nhau: ca sau phải có feedback, ca trước phải im lặng.
    if (step.move === null) return

    if (!step.move.moved) {
      // Im lặng khi nước đi không hợp lệ là lỗi rủi ro R7.
      sfx.play('invalid')
      haptics.invalid()
      return
    }

    state = step.state
    sfx.play('move')
    // Âm `spawn` đã tổng hợp ở Task 16; không phát ở đây thì nó là code chết.
    if (step.move.spawn !== null) sfx.play('spawn')
    const merged = step.move.merges[step.move.merges.length - 1]
    if (merged !== undefined) {
      sfx.playMerge(merged.value)
      haptics.merge(merged.value)
    }

    syncAll(step)
    saveIfNeeded(step.milestones)

    if (step.overlay === 'win') {
      sfx.play('win')
    } else if (step.overlay === 'over') {
      gameOvers += 1
      sfx.play('over')
    }
    if (step.overlay !== null) showOverlay(step.overlay)
  }

  /**
   * Điểm vào DUY NHẤT cho mọi action của dialog: nút trên canvas, nút THẬT
   * trong DOM (§12.1) và `Esc` đều tới đây qua `OverlayPresenter`.
   */
  function applyAction(action: DialogAction): void {
    // Đóng ở cả hai tầng trước khi làm gì khác — mở lại sau đó là đường duy
    // nhất không để lại overlay mồ côi.
    closeOverlay()

    if (action === 'close') {
      // Nút X trên canvas và `Esc`. KHÔNG có "đóng trần": state vẫn là 'won'
      // hay 'over' thì `applyInput` bỏ qua mọi nước đi, mà overlay thì đã biến
      // mất — người chơi kẹt trong một ván không bấm được gì. Nên "đóng" phải
      // dịch thành hành động có nghĩa.
      if (state.status === 'won') return applyAction('keep-playing')
      if (state.status === 'over') return applyAction('retry')
      return
    }

    if (action === 'keep-playing') {
      const step = keepPlaying(state)
      state = step.state
      syncAll(null)
      saveIfNeeded(step.milestones)
      if (step.overlay === 'over') {
        // Board hết nước thật: WIN vừa đóng thì GAME OVER phải mở ngay, không
        // thì người chơi đứng trước một board chết mà không có nút nào.
        gameOvers += 1
        sfx.play('over')
        showOverlay('over')
      }
      return
    }

    // 'retry' và 'new-game' đều là ván mới; kỷ lục và settings giữ nguyên (FR-09).
    const step = newGame(state, ctx)
    state = step.state
    syncAll(null)
    saveIfNeeded(step.milestones)

    if (
      action === 'retry' &&
      shouldRequestInterstitial({ gameOvers, sessionStartedAt }, performance.now())
    ) {
      // MO-05: không có quảng cáo thì game chạy tiếp — quảng cáo không bao giờ
      // chặn lối chơi, nên promise này cố ý không được await.
      void platform.requestInterstitial()
    }
  }

  function handleEscape(): void {
    if (settings?.isOpen === true) {
      settings.close()
      return
    }
    // `Esc` đóng overlay qua ĐÚNG action của nút X, nên hai tầng đóng cùng nhau
    // và state được chốt lại y như khi bấm nút.
    if (overlayView?.isOpen === true) applyAction('close')
  }

  // ---------- dựng view trong scene ----------

  function relayoutAll(): void {
    const next = computeLayout(game.scale.width, game.scale.height)
    hud?.relayout(next)
    dialogs?.relayout(next)
    dpad?.relayout(next)
    settings?.relayout(next)
  }

  /**
   * `create()` của scene đã chạy xong ⇒ giờ mới có chỗ để dựng view.
   *
   * BoardScene xử lý resize của chính nó; ở đây chỉ xếp lại các view phủ trên.
   */
  function startScene(sc: BoardScene): void {
    scene = sc
    const layout = computeLayout(game.scale.width, game.scale.height)

    hud = createHud(sc, theme, layout, {
      getLocale: () => locale,
      getStrings: () => strings,
      onSettings: openSettings,
    })
    dialogs = createDialogs(sc, theme, layout, {
      getStrings: () => strings,
      getLocale: () => locale,
      onAction: applyAction,
    })
    dpad = createDpad(sc, theme, layout, { onDir })
    settings = createSettings(sc, theme, layout, {
      getStrings: () => strings,
      onChange: applySetting,
    })

    // Cửa duy nhất giữ canvas và DOM đi cùng nhau.
    overlayView = createOverlayPresenter({
      dialogs,
      bridge,
      getStrings: () => strings,
      getInfo: () => ({ score: state.score, best: state.best }),
      onAction: applyAction,
    })

    sc.events.on('swipe', (dir: Dir) => {
      // Một cú vuốt hoàn chỉnh là bằng chứng người chơi biết dùng cử chỉ, nên
      // D-pad tự ẩn sau 3 giây (§B8). Chỉ ở chế độ 'auto': 'on' là giữ luôn.
      if (state.settings.dpad === 'auto') dpad?.noteDragUsed()
      onDir(dir)
    })
    attachKeyboardInput(sc, onDir, handleEscape)
    // Không giữ hàm huỷ: listener nằm trên `scene.input` và chết cùng scene, mà
    // app này không bao giờ khởi động lại scene.
    game.scale.on(Phaser.Scale.Events.RESIZE, relayoutAll)
    motionQuery.addEventListener('change', applyReducedMotion)

    applyReducedMotion()
    // `dpad: 'off'` là cài đặt có thật trong save schema — phải tôn trọng.
    dpad.setVisible(state.settings.dpad !== 'off')

    // Vẽ board và chiếu DOM từ cùng một nguồn, rồi mới báo sẵn sàng: gọi
    // `gameReady()` sớm hơn là hứa hão với người chơi (§9.2).
    sc.renderBoard(state.board)
    syncAll(null)

    // Overlay suy từ `status`, không từ một `Step` nào: nhánh này cũng chính là
    // nhánh khôi phục save đang ở trạng thái won/over.
    const initial = overlayForStatus(state.status)
    if (initial === 'over') gameOvers += 1
    if (initial !== null) showOverlay(initial)

    hideLoadingScreen()
    platform.notifyGameReady()
  }

  /**
   * Sau `READY`, Phaser đã tạo instance cho mọi scene trong config nhưng CHƯA
   * chạy scene nào ngoài scene đầu tiên: `SceneManager` đặt `autoStart: (i === 0)`,
   * mà scene đầu là `BootScene` — nó không có `create()` nên không tự chuyển
   * tiếp sang `Board`. Không gọi `start` tường minh thì không có gì được vẽ.
   */
  game.events.once(Phaser.Core.Events.READY, () => {
    const sc = game.scene.getScene('Board') as BoardScene | null
    if (sc === null) {
      platform.logError()
      return
    }
    // `create()` chạy SAU lời gọi `start` (trong `processQueue`, hoặc ngay
    // trong `start` khi scene không có `preload`), nên listener phải đăng ký
    // trước — đọc `scene.add` ngay sau `start` là chưa có gì để đọc.
    sc.events.once('create', () => startScene(sc))
    game.scene.start('Board')
  })

  // ---------- vòng đời nền tảng ----------

  sfx.setVolume(state.settings.sfxVolume)
  haptics.setEnabled(state.settings.haptics)
  sfx.setMuted(!platform.isAudioEnabled())

  platform.onAudioEnabledChange((enabled) => {
    sfx.setMuted(!enabled)
  })

  platform.onPause(() => {
    // §9.5: dừng vòng lặp, mute, flush save. Không có hình phạt theo thời gian.
    game.loop.sleep()
    sfx.setMuted(true)
    // Đóng overlay ở CẢ HAI tầng: chỉ gọi `bridge.closeDialog()` là để lại
    // overlay trên canvas mà không còn nút nào cho bàn phím hay screen reader
    // (Review Focus mục 1).
    closeOverlay()
    void platform.save(toSave(state, nowIso()))
  })

  platform.onResume(() => {
    game.loop.wake()
    sfx.setMuted(!platform.isAudioEnabled())
    // R1: mỗi lần resume là một lần thử unlock lại (context có thể đã bị treo).
    sfx.unlock()
    // Phiên chơi tính lại từ đây: §A8 cấm quảng cáo trong 30 giây đầu.
    sessionStartedAt = performance.now()
    // Mở lại đúng overlay mà `status` đòi. Bỏ bước này thì người chơi quay về
    // một board đã chết mà không có nút nào.
    const again = overlayForStatus(state.status)
    if (again !== null) showOverlay(again)
  })
}

// `boot()` tự nuốt mọi lỗi lường trước được (init/load/save đều có hợp đồng
// riêng). Lưới cuối này chỉ để một lỗi ngoài dự kiến không thành im lặng.
void boot().catch((e: unknown) => {
  console.error('[main] khởi động thất bại:', e)
})
