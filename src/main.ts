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
//  4. Nút DOM nằm ĐÚNG TRÊN nút canvas của nó (`placeControls`), và hình học chỉ
//     có một nguồn là các view — không có bản layout thứ hai cho tầng a11y.

import Phaser from 'phaser'
// Thứ tự import CSS: token trước, rồi khung trang, rồi tầng a11y.
import './styles/tokens.css'
import './styles/app.css'
import './a11y/bridge.css'
import { createA11yBridge } from './a11y/bridge'
import { createActionReceiver } from './app/actions'
import { createHaptics } from './app/haptics'
import {
  createOverlayPresenter,
  overlayCoversScreen,
  overlayForStatus,
  type OverlayPresenter,
} from './app/overlay'
import { placementFor } from './app/placement'
import { present, type PresentSinks } from './app/present'
import { createSettingsPresenter, type SettingsPresenter } from './app/settings-panel'
import { createSaveGate, PLAY_SAVE_MS } from './app/save-gate'
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
import { createDialogs } from './phaser/views/dialogs'
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
  let settingsPanel: SettingsPresenter | null = null

  /** Bắt đầu phiên chơi — mốc so cho chính sách quảng cáo 30 giây (§A8). */
  let sessionStartedAt = performance.now()
  /** Số lần GAME OVER đã xảy ra trong phiên. */
  let gameOvers = 0
  /** Kỷ lục đã gửi `sendScore` lần cuối, để không báo lại cùng một con số. */
  let lastReportedBest = state.best
  /**
   * Nền tảng đang pause (§9.5).
   *
   * CỐ Ý không dùng `state.status`: `status` là trạng thái VÁN (playing / won /
   * over) do `app/session.ts` sở hữu và có luật riêng (`applyInput` bỏ qua input
   * khi khác 'playing'); còn đây là trạng thái VÒNG ĐỜI do host quyết định. Nhét
   * pause vào `status` là để một cú pause của host ghi đè luật ván — và lúc
   * resume thì không còn biết trạng thái ván trước đó là gì.
   */
  let paused = false

  // Điều khiển DOM của §12.1 dựng ngay bây giờ: người dùng bàn phím có đường
  // vào game trước cả khi scene đầu tiên kịp vẽ.
  bridge.mountControls({
    onDir,
    onSettings: openSettings,
    onSettingsClose: closeSettings,
    onSettingsChange: applySetting,
    initial: state.settings,
  })

  // ---------- lưu (§9.4) ----------

  function nowIso(): string {
    return new Date().toISOString()
  }

  /**
   * Cổng chặn nhịp lưu (§9.4 "Debounce ≥ 1 s") — xem `app/save-gate.ts`.
   *
   * Đồng hồ ở ĐÂY, không ở `app/session.ts`: module luật ván phải thuần (không
   * timer, không `Date.now()`). `performance.now()` chứ không `Date.now()` để
   * cùng thang với `sessionStartedAt` và không nhảy khi đồng hồ hệ thống được
   * chỉnh.
   */
  const saveGate = createSaveGate({
    save: () => { void platform.save(toSave(state, nowIso())) },
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => { clearTimeout(h) },
  })

  /**
   * Lưu ở MỐC RỜI RẠC. §9.4: bắt đầu ván · win · game over · pause · mỗi 30 s
   * chơi · mỗi mốc 1000 điểm.
   *
   * Mốc đi thẳng qua `saveNow` (ghi NGAY) chứ không qua cửa sổ debounce: mốc là
   * sự kiện rời rạc, để nó xếp hàng sau cửa sổ là mất đúng cái khoảnh khắc §9.4
   * muốn ghi lại. Cửa sổ chỉ dành cho thay đổi LIÊN TỤC (thanh trượt SFX).
   */
  function saveIfNeeded(milestones: readonly string[]): void {
    if (milestones.length === 0) return
    saveGate.saveNow()
    // `sendScore` chỉ khi kỷ lục THẬT SỰ tăng: báo lại đúng con số cũ ở mỗi
    // milestone là cuộc gọi thừa, mà mỗi cuộc gọi có timeout 2 giây.
    if (state.best > lastReportedBest) {
      lastReportedBest = state.best
      void platform.reportScore(state.best)
    }
  }

  // ---------- chiếu state ra hai tầng ----------

  /**
   * Bộ chuyển `PresentSinks` → các view thật. Chỗ DUY NHẤT ánh xạ state sang
   * canvas và DOM.
   *
   * `hud`/`scene` còn `null` trong khoảng giữa boot và `create()` của scene
   * (người dùng bàn phím có đường vào game trước khi canvas vẽ xong), nên mọi
   * sink phải chịu được null.
   */
  const sinks: PresentSinks = {
    setScore: (score, delta) => { hud?.setScore(score, delta) },
    setBest: (best) => { hud?.setBest(best) },
    syncBoard: (board) => { bridge.syncBoard(board) },
    announceScore: (score, loc) => { bridge.announceScore(score, loc) },
    playOutcome: (move) => { scene?.playOutcome(move) },
    renderBoard: (board) => { scene?.renderBoard(board) },
  }

  /**
   * Bản DOM và bản canvas đọc từ CÙNG một nguồn — bất biến được GHIM ở
   * `app/present.ts` (một tham số board duy nhất), không phải bằng việc nhớ viết
   * đúng hai dòng ở đây.
   *
   * Review Focus mục 1 — cao nhất trong danh sách rủi ro review: không nhánh nào
   * được phép chỉ cập nhật một bên.
   */
  function syncAll(step: Step | null): void {
    present(sinks, state, step, locale)
  }

  /**
   * Đặt mọi điều khiển DOM lên nút canvas của nó — xem `app/placement.ts`.
   *
   * Gọi ở MỌI chỗ hình học hoặc trạng thái overlay đổi: resize, mở/đóng dialog,
   * mở/đóng Settings. Hộp lấy từ chính các view đang vẽ; khung canvas đọc từ DOM
   * thật chứ không giả định nó khớp 1:1 với trang.
   */
  function placeControls(): void {
    if (hud === null || dpad === null || dialogs === null || settings === null) return
    const box = game.canvas.getBoundingClientRect()
    bridge.placeControls(
      placementFor({
        frame: {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          gameWidth: game.scale.width,
          gameHeight: game.scale.height,
        },
        viewport: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
        dpad: dpad.buttonRects(),
        gear: hud.gearRect(),
        dialog: { phase: dialogs.phase, buttons: dialogs.buttonRects(), close: dialogs.closeRect() },
        settings: { phase: settings.phase, controls: settings.controlRects() },
      }),
    )
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

  /**
   * Mở/đóng bảng Settings ở cả hai tầng — cổng chặn và việc chuyển focus nằm ở
   * `app/settings-panel.ts`. Bánh răng canvas, nút Cài đặt DOM, nút Đóng DOM và
   * `Esc` đều tới hai hàm này.
   */
  function openSettings(): void {
    settingsPanel?.open()
  }

  function closeSettings(): void {
    settingsPanel?.close()
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
    // Và chiều ngược lại: ô nhập DOM nằm ngay trên slider / toggle / nút theme
    // của canvas, nên đổi bằng bàn phím thì hình vẽ bên dưới phải đổi theo.
    settings?.sync(state.settings)
    // Đường LIÊN TỤC duy nhất: `bridge.ts` phát một sự kiện `input` cho MỖI bước
    // kéo thanh trượt SFX. Ghi thẳng ở đây là mỗi bước một lời gọi SDK, mà SDK bị
    // rate-limit — nên đi qua cửa sổ ≥ 1 s của `saveGate`.
    saveGate.saveSoon()
  }

  // ---------- input ----------

  function onDir(dir: Dir): void {
    // §9.5 + PRD:452 — pause thì input chết theo D-pad. Cổng này đứng TRƯỚC mọi
    // thứ khác: vòng lặp đã ngủ nên không có gì để vẽ, mà một nước đi lúc này
    // còn đổi state sau lưng host đang tạm chiếm màn hình. `sfx.unlock()` cũng
    // phải nằm sau cổng: pause là lúc âm thanh đã bị cắt.
    if (paused) return
    sfx.unlock()

    // Cổng chặn đặt Ở ĐÂY, theo state — không phải bằng cách gỡ listener.
    // `input.ts` dùng CHUNG một listener cho `Esc` và các phím mũi tên, nên gỡ
    // nó khi overlay mở là mất luôn đường `Esc` đóng dialog (§A11).
    //
    // `overlayCoversScreen` chứ không phải `isOpen`: trong 800 ms mờ dần
    // (`'closing'`) tấm card VẪN đang phơi ra trước mắt người chơi, nên một cú
    // vuốt lúc đó không được làm board nhúc nhích phía sau nó. Dùng `isOpen` thì
    // đúng cửa sổ đó lọt input xuống bàn cờ.
    if (overlayCoversScreen(settings?.phase ?? 'closed')) return
    if (overlayCoversScreen(overlayView?.phase ?? 'closed')) return

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
   *
   * Bản thân logic — kể cả CỔNG CHẶN theo trạng thái overlay và chốt "một quảng
   * cáo cho một lần thua" — nằm ở `app/actions.ts`. Nó ở đó chứ không ở đây vì
   * tệp này không nhập được vào test (`void boot()` chạy ngay khi nạp), mà một
   * cổng chặn không có test thì lần refactor sau sẽ mất.
   */
  const { applyAction } = createActionReceiver({
    isPaused: () => paused,
    overlayPhase: () => overlayView?.phase ?? 'closed',
    closeOverlay,
    getState: () => state,
    setState: (next) => {
      state = next
    },
    keepPlaying: (s) => keepPlaying(s),
    newGame: (s) => newGame(s, ctx),
    syncAll,
    saveIfNeeded,
    showOverlay,
    noteLoss: () => {
      gameOvers += 1
      sfx.play('over')
    },
    ads: {
      state: () => ({ gameOvers, sessionStartedAt }),
      now: () => performance.now(),
      // MO-05: không có quảng cáo thì game chạy tiếp — quảng cáo không bao giờ
      // chặn lối chơi, nên promise này cố ý không được await.
      request: () => {
        void platform.requestInterstitial()
      },
    },
  })

  function handleEscape(): void {
    if (settings?.isOpen === true) {
      closeSettings()
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
    // SAU khi mọi view đã xếp lại: hộp đọc từ chính các hình vừa dời.
    placeControls()
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
    // D-pad dựng TRƯỚC dialog và settings: display list vẽ theo thứ tự thêm vào,
    // và ở viewport thấp D-pad nằm ngay vùng giữa màn — dựng sau thì nó vẽ đè lên
    // card của dialog.
    dpad = createDpad(sc, theme, layout, { onDir })
    dialogs = createDialogs(sc, theme, layout, {
      getStrings: () => strings,
      getLocale: () => locale,
      onAction: applyAction,
    })
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
      place: placeControls,
    })
    settingsPanel = createSettingsPresenter({
      settings,
      bridge,
      isPaused: () => paused,
      overlayPhase: () => overlayView?.phase ?? 'closed',
      getSettings: () => state.settings,
      onOpen: () => { sfx.unlock() },
      place: placeControls,
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

    /**
     * §9.4: "mỗi 30 s chơi" là một mốc lưu.
     *
     * Đồng hồ của SCENE chứ không `setInterval`: nó chạy theo vòng lặp game, nên
     * `onPause` gọi `game.loop.sleep()` là đồng hồ đứng luôn — đúng nghĩa "30 s
     * CHƠI", không phải 30 s đồng hồ treo tường. Đặt ở `main.ts` (tầng vòng đời)
     * chứ không ở `app/session.ts`: module luật ván phải thuần.
     */
    sc.time.addEvent({ delay: PLAY_SAVE_MS, loop: true, callback: () => { saveGate.saveNow() } })

    // Vẽ board và chiếu DOM từ cùng một nguồn, rồi mới báo sẵn sàng: gọi
    // `gameReady()` sớm hơn là hứa hão với người chơi (§9.2).
    sc.renderBoard(state.board)
    syncAll(null)

    // Overlay suy từ `status`, không từ một `Step` nào: nhánh này cũng chính là
    // nhánh khôi phục save đang ở trạng thái won/over.
    const initial = overlayForStatus(state.status)
    if (initial === 'over') gameOvers += 1
    if (initial !== null) showOverlay(initial)
    // Lần đặt đầu tiên: trước đó canvas chưa vẽ nút nào để nút DOM đứng lên.
    placeControls()

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
    // Theme đi cùng lời gọi `start` để `create()` vẽ lần đầu bằng đúng theme đã lưu.
    game.scene.start('Board', { theme })
  })

  // ---------- vòng đời nền tảng ----------

  sfx.setVolume(state.settings.sfxVolume)
  haptics.setEnabled(state.settings.haptics)
  sfx.setMuted(!platform.isAudioEnabled())

  platform.onAudioEnabledChange((enabled) => {
    sfx.setMuted(!enabled)
  })

  platform.onPause(() => {
    // §9.5: dừng vòng lặp, mute, flush save, ẨN D-PAD. Không có hình phạt theo
    // thời gian. Bốn việc — thiếu việc thứ tư thì D-pad vẫn nằm đó mời gọi bấm
    // trong khi `onDir` đã bị chặn, tức hai tầng nói hai chuyện khác nhau.
    paused = true
    game.loop.sleep()
    sfx.setMuted(true)
    // Đóng overlay ở CẢ HAI tầng: chỉ gọi `bridge.closeDialog()` là để lại
    // overlay trên canvas mà không còn nút nào cho bàn phím hay screen reader
    // (Review Focus mục 1).
    closeOverlay()
    // D-pad ở CẢ HAI tầng: canvas (`views/dpad.ts`) và DOM (`a11y/bridge.ts`).
    dpad?.setVisible(false)
    bridge.setDpadVisible(false)
    // `saveNow` chứ không `saveSoon`: pause là mốc RỜI RẠC của §9.4, phải có mặt
    // trong save ngay — kể cả khi không có thay đổi liên tục nào đang chờ.
    saveGate.saveNow()
  })

  platform.onResume(() => {
    paused = false
    game.loop.wake()
    sfx.setMuted(!platform.isAudioEnabled())
    // R1: mỗi lần resume là một lần thử unlock lại (context có thể đã bị treo).
    sfx.unlock()
    // Phiên chơi tính lại từ đây: §A8 cấm quảng cáo trong 30 giây đầu.
    sessionStartedAt = performance.now()
    // Hiện lại D-pad theo ĐÚNG cài đặt của người chơi: `dpad: 'off'` phải vẫn
    // tắt sau khi resume. Bản DOM không có khái niệm 'off' (nó là đường vào của
    // người dùng bàn phím), nên nó chỉ đi theo pause.
    dpad?.setVisible(state.settings.dpad !== 'off')
    bridge.setDpadVisible(true)
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
