import { SIZE, type Board, type Tile } from '../game/board'
// Hai dòng dưới chỉ nhập KIỂU. `verbatimModuleSyntax` xoá sạch chúng lúc biên
// dịch, nên tầng này vẫn không có đường chạy nào vào logic game. Nhập từ nguồn sự
// thật chứ không chép lại hình dạng cài đặt — chép tay thì sớm muộn hai bên lệch.
import type { ThemeName } from '../game/persist'
import type { Dir } from '../game/rules'
import { formatNumber, type Locale, type Strings } from '../i18n'

/** 16 nhãn cho lưới, theo thứ tự hàng rồi cột. HÀM THUẦN. */
export function gridLabels(board: Board, strings: Strings): string[] {
  const out: string[] = []
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const tile: Tile | null = board[row]![col] ?? null
      out.push(tile === null ? strings.empty : String(tile.value))
    }
  }
  return out
}

/** Tham số mở dialog — §B8. */
export type OpenDialogOptions = {
  /** Tiêu đề THẬT của dialog; `aria-labelledby` trỏ vào chính phần tử này. */
  heading: string
  /** Nhãn các nút hành động, theo thứ tự hiện ra. */
  labels: string[]
  onActivate: (index: number) => void
  /**
   * Phần tử đã mở dialog. §B8: "focus restored to the invoking element on
   * close". Bỏ trống thì lấy `document.activeElement` lúc mở — đúng phần tử đã
   * kích hoạt, khi đường vào là một điều khiển DOM.
   */
  restoreFocusTo?: HTMLElement
}

/** Bốn khoá cài đặt mà §12.1 bắt phải có ô nhập DOM thật. */
export type A11ySettingsState = {
  sfxVolume: number
  haptics: boolean
  reducedMotion: boolean
  theme: ThemeName
}

/**
 * Thay đổi cài đặt do người dùng tác động vào ô nhập DOM.
 *
 * Đây KHÔNG phải đường thứ hai vào logic: nó phát đúng hình dạng patch mà
 * overlay Settings trong canvas phát ra, và tầng ghép nối đưa cả hai vào cùng
 * một `applyAction`. Tầng này vẫn không giữ state — nó chỉ báo "người dùng vừa
 * đổi cái này"; giá trị đúng luôn quay lại qua `syncControls`.
 */
export type A11ySettingsPatch = {
  sfxVolume?: number
  haptics?: boolean
  reducedMotion?: boolean
  theme?: ThemeName
}

/** Hộp bao trên TRANG, CSS px, gốc ở góc trên-trái viewport. */
export type A11yRect = { x: number; y: number; w: number; h: number }

/**
 * Chỗ đặt từng điều khiển DOM — đúng trên nút canvas tương ứng.
 *
 * Tầng này KHÔNG tự tính hình học và không biết canvas nằm ở đâu: nó chỉ đặt
 * phần tử vào hộp được đưa cho. Ai tính hộp thì xem `app/placement.ts`.
 */
export type A11yPlacement = {
  dpad: Record<Dir, A11yRect>
  settingsButton: A11yRect
  sfx: A11yRect
  haptics: A11yRect
  reducedMotion: A11yRect
  theme: A11yRect
  /** Nút Đóng của bảng Settings. */
  settingsClose: A11yRect
  /** Theo thứ tự nút của dialog đang mở; rỗng khi không có dialog. */
  dialogButtons: readonly A11yRect[]
}

export type MountControlsOptions = {
  onDir: (dir: Dir) => void
  onSettings: () => void
  /**
   * Nút Đóng của bảng Settings — cùng đường với nút Đóng trên canvas và `Esc`.
   * Người dùng trình đọc màn hình cảm ứng không có `Esc`; thiếu nút này thì họ
   * vào được bảng mà không ra được.
   */
  onSettingsClose: () => void
  onSettingsChange: (patch: A11ySettingsPatch) => void
  /** Giá trị ban đầu, đọc từ state — tầng này không tự bịa giá trị mặc định. */
  initial: A11ySettingsState
}

export type A11yBridge = {
  readonly root: HTMLElement
  syncBoard(board: Board): void
  announceScore(score: number, locale: Locale): void
  announceOutcome(kind: 'win' | 'gameover', strings: Strings): void
  openDialog(opts: OpenDialogOptions): void
  closeDialog(): void
  mountControls(opts: MountControlsOptions): void
  syncControls(state: A11ySettingsState): void
  /**
   * Đặt mọi điều khiển lên nút canvas của nó. Gọi lại mỗi khi hình học hoặc
   * trạng thái đổi (resize, mở/đóng dialog, mở/đóng Settings).
   */
  placeControls(placement: A11yPlacement): void
  /**
   * Bảng Settings của canvas vừa mở / vừa bắt đầu đóng.
   *
   * Mở: bốn ô nhập và nút Đóng vào thứ tự Tab, nền bị `inert` (cùng cơ chế với
   * dialog), focus vào điều khiển đầu của bảng. Đóng: chúng rời thứ tự Tab —
   * bốn ô nhập VẪN ở trong cây accessibility (§12.1) — và focus đang nằm trong
   * bảng thì về nút Cài đặt. Idempotent.
   */
  setSettingsOpen(open: boolean): void
  /**
   * §9.5 + PRD:452 — khi nền tảng pause, D-pad biến mất. Bản DOM phải đi cùng
   * bản canvas, nếu không thì hai tầng nói hai chuyện khác nhau.
   */
  setDpadVisible(visible: boolean): void
  setStrings(strings: Strings): void
  destroy(): void
}

/** A11Y-05: tối đa một thông báo điểm mỗi 2 giây. */
const ANNOUNCE_MS = 2000

/**
 * Thứ tự chữ thập của §B8: lên · trái · phải · xuống — GIỐNG `SPECS` của
 * `views/dpad.ts`, để hai bản D-pad đọc ra cùng một thứ tự.
 */
const DIRS: readonly Dir[] = ['up', 'left', 'right', 'down']

/**
 * Nhãn D-pad lấy từ `Strings`. KHÔNG lấy từ `setData` của canvas: dữ liệu bên
 * canvas không có đường đọc nào từ tầng này, và nhãn đúng luôn là chuỗi i18n.
 */
const DIR_LABEL: Record<Dir, keyof Strings> = {
  up: 'moveUp',
  down: 'moveDown',
  left: 'moveLeft',
  right: 'moveRight',
}

/** §12.1: "chọn theme" — ba lựa chọn loại trừ nhau nên dùng `<select>`. */
const THEMES: readonly ThemeName[] = ['light', 'dark', 'contrast']
const THEME_LABEL: Record<ThemeName, keyof Strings> = {
  light: 'themeLight',
  dark: 'themeDark',
  contrast: 'themeContrast',
}

/**
 * Bộ đếm id toàn module. `id` phải duy nhất trên cả trang, mà mỗi lần dựng cầu
 * nối lại sinh thêm id mới — đếm theo từng instance là chưa đủ.
 */
let uid = 0
function nextId(prefix: string): string {
  uid += 1
  return `a11y-${prefix}-${uid}`
}

/** `value` của `<select>` là chuỗi tự do; ép về đúng ba giá trị hợp lệ. */
function readTheme(value: string): ThemeName {
  return value === 'dark' || value === 'contrast' ? value : 'light'
}

/** Class của mọi điều khiển được đặt lên canvas — khớp `bridge.css`. */
const CTL_CLASS = 'a11y-ctl'
/** Class của chữ chỉ dành cho screen reader (tiêu đề dialog, chữ của nhãn). */
const SR_CLASS = 'a11y-sr'

/**
 * Đặt một điều khiển vào hộp của nó, hoặc gỡ chỗ (`null`).
 *
 * `data-placed` là thứ CSS dựa vào: điều khiển chưa có chỗ thì bị cắt còn 1 px
 * (khoảng giữa boot và lúc scene dựng xong), có chỗ rồi mới bỏ cắt để focus
 * ring vẽ ra được.
 */
function place(el: HTMLElement, rect: A11yRect | null): void {
  if (rect === null) {
    el.removeAttribute('data-placed')
    for (const prop of ['left', 'top', 'width', 'height']) el.style.removeProperty(prop)
    return
  }
  el.setAttribute('data-placed', '')
  el.style.left = `${rect.x}px`
  el.style.top = `${rect.y}px`
  el.style.width = `${rect.w}px`
  el.style.height = `${rect.h}px`
}

type Controls = {
  buttons: HTMLButtonElement[]
  /** Vỏ bọc bốn nút mũi tên — cần giữ để ẩn/hiện cả cụm (§9.5). */
  dpad: HTMLDivElement
  settingsButton: HTMLButtonElement
  /** Vỏ bọc bốn ô nhập + nút Đóng: thứ duy nhất KHÔNG bị `inert` khi bảng mở. */
  panel: HTMLDivElement
  closeButton: HTMLButtonElement
  sfx: HTMLInputElement
  haptics: HTMLInputElement
  reducedMotion: HTMLInputElement
  theme: HTMLSelectElement
  themeOptions: HTMLOptionElement[]
  texts: Record<'sfx' | 'haptics' | 'reducedMotion' | 'theme', HTMLSpanElement>
}

export function createA11yBridge(): A11yBridge {
  const root = document.createElement('div')
  root.className = 'a11y-root'

  // Hai gốc con, KHÔNG phải một. Lý do ở `bridge.css`: gốc bàn cờ bị cắt vĩnh
  // viễn, còn gốc điều khiển thì KHÔNG được cắt — điều khiển của nó nằm trong
  // suốt trên nút canvas, và cha mà cắt là focus ring mất theo.
  const boardRoot = document.createElement('div')
  boardRoot.className = 'a11y-root-board'
  const controlsRoot = document.createElement('div')
  controlsRoot.className = 'a11y-root-controls'

  const grid = document.createElement('div')
  grid.setAttribute('role', 'grid')
  grid.setAttribute('aria-rowcount', String(SIZE))
  grid.setAttribute('aria-colcount', String(SIZE))

  // 16 gridcell nằm trong 4 `role="row"` thật, không phải dồn vào một hàng.
  // `aria-rowcount`/`aria-colcount` khai lưới 4×4, nên nhét 16 cell vào một
  // hàng là tự mâu thuẫn: screen reader sẽ đọc "hàng 1, cột 7" cho ô mà mắt
  // thấy là hàng 2 cột 3. Cả tầng này tồn tại để nói đúng cái canvas đang vẽ,
  // nên cấu trúc phải khớp con số đã khai. Thứ tự cell vẫn là hàng rồi cột.
  const cells: HTMLElement[] = []
  for (let row = 0; row < SIZE; row++) {
    const gridRow = document.createElement('div')
    gridRow.setAttribute('role', 'row')
    for (let col = 0; col < SIZE; col++) {
      const cell = document.createElement('div')
      cell.setAttribute('role', 'gridcell')
      gridRow.appendChild(cell)
      cells.push(cell)
    }
    grid.appendChild(gridRow)
  }

  const scoreLive = document.createElement('div')
  scoreLive.setAttribute('aria-live', 'polite')
  scoreLive.setAttribute('aria-atomic', 'true')

  const outcomeLive = document.createElement('div')
  outcomeLive.setAttribute('aria-live', 'assertive')
  outcomeLive.setAttribute('aria-atomic', 'true')

  // Dialog nằm trong gốc ĐIỀU KHIỂN: nút trong dialog là nút thật và focus ring
  // của nó phải thấy được. Đặt nó vào gốc bàn cờ (bị cắt vĩnh viễn) là lặp lại
  // đúng lỗi cũ.
  const dialogHost = document.createElement('div')
  dialogHost.className = 'a11y-dialog-host'

  boardRoot.append(grid, scoreLive, outcomeLive)
  root.append(boardRoot, controlsRoot)
  // Dialog đứng TRƯỚC các điều khiển trong thứ tự tài liệu: khi nó đang mở, đó
  // là thứ đầu tiên screen reader đọc tới.
  controlsRoot.append(dialogHost)

  let currentStrings: Strings | null = null
  let announceTimer: ReturnType<typeof setTimeout> | null = null
  let pending: string | null = null
  let controls: Controls | null = null
  let dialogEl: HTMLElement | null = null
  /** Nút của dialog đang mở, theo thứ tự hiện ra — đích của `placeControls`. */
  let dialogButtons: HTMLButtonElement[] = []
  /** Bảng Settings của canvas đang mở — do tầng ghép nối báo, không tự suy. */
  let settingsOpen = false
  let restoreFocusTo: HTMLElement | null = null

  function syncBoard(board: Board): void {
    const labels = currentStrings === null ? null : gridLabels(board, currentStrings)
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!
      const text = labels === null ? '' : labels[i]!
      if (cell.textContent !== text) cell.textContent = text
      cell.setAttribute('aria-label', text)
    }
  }

  function emit(text: string): void {
    scoreLive.textContent = text
  }

  /**
   * Mở một cửa sổ throttle mới, hết hạn thì công bố giá trị đang chờ (nếu có)
   * rồi mở tiếp cửa sổ kế.
   *
   * Tách khỏi `announceScore` là cố ý: lần mở lại sau khi cửa sổ cũ hết hạn
   * KHÔNG được công bố thêm gì. Gọi `announceScore(0, …)` ở đây — cách làm
   * tưởng như tương đương — sẽ ghi đè đúng giá trị vừa công bố bằng `'0'`, và
   * screen reader đọc số 0 ngay sau khi vừa đọc điểm thật.
   */
  function openWindow(): void {
    announceTimer = setTimeout(() => {
      announceTimer = null
      const next = pending
      pending = null
      // Không có gì chờ thì cửa sổ đóng hẳn: lần đổi điểm sau công bố ngay,
      // không phải chờ hết 2 giây.
      if (next === null) return
      emit(next)
      openWindow()
    }, ANNOUNCE_MS)
  }

  function announceScore(score: number, locale: Locale): void {
    const text = formatNumber(score, locale)
    if (announceTimer !== null) {
      // Đang trong cửa sổ throttle: chỉ ghi đè giá trị chờ, KHÔNG hẹn timer mới
      // — nhờ vậy nhịp công bố luôn đúng 2 giây dù người chơi bấm nhanh cỡ nào.
      pending = text
      return
    }
    emit(text)
    openWindow()
  }

  function announceOutcome(kind: 'win' | 'gameover', strings: Strings): void {
    outcomeLive.textContent = kind === 'win' ? strings.winTitle : strings.gameOverTitle
  }

  /**
   * Giữ focus trong dialog khi mở (§B8: "focus trapped while open").
   *
   * Nghe trên CHÍNH dialog chứ không trên `document`: đây là hành vi của một
   * phần tử, không phải một đường vận chuyển sự kiện toàn cục. `Tab` được
   * `preventDefault()` — hợp lệ; lệnh MUST NOT của §A11 chỉ áp cho `Esc`, và ở
   * đây `Esc` không được đụng tới.
   */
  function onDialogKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Tab' || dialogEl === null) return
    const focusables = Array.from(
      dialogEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (first === undefined || last === undefined) return
    const active = document.activeElement
    const inside = active !== null && dialogEl.contains(active)
    if (!inside || active === (ev.shiftKey ? first : last)) {
      ev.preventDefault()
      ;(ev.shiftKey ? last : first).focus()
    }
  }

  /**
   * Khoá tầng nền trong lúc có một lớp phủ: dialog, hoặc bảng Settings.
   *
   * `aria-modal="true"` chỉ *nói* với trình đọc màn hình rằng phần còn lại là nền;
   * nó KHÔNG chặn được chuột và bàn phím. `inert` mới chặn thật: phần tử `inert`
   * không nhận focus, không nhận click, và bị loại khỏi cây accessibility. Thiếu
   * nó thì nút D-pad và slider SFX phía sau dialog vẫn bấm được.
   *
   * MỘT hàm cho cả hai lớp phủ, suy từ trạng thái chứ không bật/tắt theo lời
   * gọi: thứ duy nhất còn sống là lớp phủ trên cùng — dialog nếu có (nó phủ lên
   * cả bảng Settings), không thì bảng Settings. Hai hàm song song cho hai lớp
   * phủ là hai chỗ để quên gỡ `inert` khi lớp kia vẫn còn.
   *
   * TUYỆT ĐỐI không đụng tới `#game-container`: overlay của canvas nằm trong đó,
   * mà `inert` chặn luôn pointer event — bật lên là nút "Chơi tiếp" trên canvas
   * không bấm được nữa, đúng thứ Review Focus mục 1 cấm.
   */
  function syncInert(): void {
    const alive: Element | null =
      dialogEl !== null ? dialogHost : settingsOpen && controls !== null ? controls.panel : null
    const targets: Element[] = [boardRoot, ...Array.from(controlsRoot.children)]
    for (const el of targets) {
      if (alive !== null && el !== alive) el.setAttribute('inert', '')
      else el.removeAttribute('inert')
    }
  }

  function openDialog(opts: OpenDialogOptions): void {
    // Chụp phần tử đã kích hoạt TRƯỚC khi `closeDialog()` kịp dời focus. `body`
    // không tính: nó không phải "phần tử đã mở dialog", chỉ là chỗ focus rơi về.
    const invokedFrom =
      opts.restoreFocusTo ??
      (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null)
    closeDialog()
    const headingId = nextId('heading')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', headingId)

    const heading = document.createElement('h2')
    heading.className = SR_CLASS
    heading.id = headingId
    heading.textContent = opts.heading
    dialog.appendChild(heading)

    dialogButtons = opts.labels.map((label, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = CTL_CLASS
      button.textContent = label
      button.addEventListener('click', () => opts.onActivate(index))
      dialog.appendChild(button)
      return button
    })

    dialog.addEventListener('keydown', onDialogKeydown)
    dialogHost.appendChild(dialog)
    dialogEl = dialog
    restoreFocusTo = invokedFrom
    syncInert()

    const first = dialog.querySelector('button')
    if (first !== null) first.focus()
  }

  /**
   * Idempotent: gọi lúc không có dialog là no-op thật, gọi hai lần liên tiếp
   * cũng vậy. Tầng ghép nối gọi hàm này từ state (lúc `Esc`, lúc `onPause`), nên
   * nó phải chịu được cả hai.
   */
  function closeDialog(): void {
    const dialog = dialogEl
    if (dialog === null) return
    dialogEl = null
    dialogButtons = []
    const back = restoreFocusTo
    restoreFocusTo = null

    dialog.removeEventListener('keydown', onDialogKeydown)
    dialog.remove()
    syncInert()

    // Xoá vùng assertive. NVDA/JAWS so NỘI DUNG vùng live: gán lại đúng chuỗi
    // cũ — thua, bấm Retry, thua lần nữa — thì lần thứ hai bị im lặng. Xoá lúc
    // đóng để lần công bố sau chắc chắn là một thay đổi.
    outcomeLive.textContent = ''

    // Chỉ focus khi phần tử còn trong cây: focus một nút đã bị gỡ là cú focus
    // rơi vào hư không, còn tệ hơn là để focus về `body`.
    if (back !== null && back.isConnected) back.focus()
  }

  /** Đặt lại mọi nhãn lấy từ `Strings` — dùng chung cho lúc dựng và lúc đổi ngôn ngữ. */
  function relabel(): void {
    const c = controls
    const s = currentStrings
    if (c === null || s === null) return
    DIRS.forEach((dir, i) => {
      const button = c.buttons[i]
      if (button !== undefined) button.textContent = s[DIR_LABEL[dir]]
    })
    c.settingsButton.textContent = s.settings
    c.panel.setAttribute('aria-label', s.settings)
    c.closeButton.textContent = s.close
    c.texts.sfx.textContent = s.sound
    c.texts.haptics.textContent = s.haptics
    c.texts.reducedMotion.textContent = s.reducedMotion
    c.texts.theme.textContent = s.theme
    c.themeOptions.forEach((option, i) => {
      const name = THEMES[i]
      if (name !== undefined) option.textContent = s[THEME_LABEL[name]]
    })
    // `<select>` nằm trong `<label>` bọc quanh, mà tên đọc lên của một `<label>`
    // tính từ CẢ cây con của nó — kể cả chữ của ba `<option>`. Không đặt
    // `aria-label` thì screen reader đọc "Theme Light Dark High contrast" và nuốt
    // luôn tên trường. `aria-label` thắng tên suy từ label nên chốt đúng "Theme".
    c.theme.setAttribute('aria-label', s.theme)
  }

  /** Nhãn bọc quanh ô nhập: tên đọc lên của ô nhập lấy từ đây. */
  function field(
    text: HTMLSpanElement,
    control: HTMLElement,
    textFirst: boolean,
  ): HTMLLabelElement {
    const label = document.createElement('label')
    label.className = 'a11y-field'
    label.append(...(textFirst ? [text, control] : [control, text]))
    return label
  }

  function option(value: ThemeName): HTMLOptionElement {
    const el = document.createElement('option')
    el.value = value
    return el
  }

  function textSpan(): HTMLSpanElement {
    const span = document.createElement('span')
    span.className = `a11y-field__text ${SR_CLASS}`
    return span
  }

  function mountControls(opts: MountControlsOptions): void {
    // §12.1: nút và ô nhập "dựng một lần". Gọi lại là no-op, không dựng chồng.
    if (controls !== null) return

    const buttons: HTMLButtonElement[] = []
    const dpad = document.createElement('div')
    dpad.className = 'a11y-dpad'
    for (const dir of DIRS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `a11y-dpad__btn ${CTL_CLASS}`
      button.addEventListener('click', () => opts.onDir(dir))
      buttons.push(button)
      dpad.appendChild(button)
    }

    const settingsButton = document.createElement('button')
    settingsButton.type = 'button'
    settingsButton.className = `a11y-settings ${CTL_CLASS}`
    settingsButton.addEventListener('click', () => opts.onSettings())

    const sfx = document.createElement('input')
    sfx.type = 'range'
    // §A9: slider SFX 0–100 %. `sfxVolume` của state là 0–1 nên quy đổi ở đây.
    sfx.min = '0'
    sfx.max = '100'
    sfx.step = '1'
    sfx.addEventListener('input', () => {
      opts.onSettingsChange({ sfxVolume: Number(sfx.value) / 100 })
    })

    const haptics = document.createElement('input')
    haptics.type = 'checkbox'
    haptics.addEventListener('change', () => {
      opts.onSettingsChange({ haptics: haptics.checked })
    })

    const reducedMotion = document.createElement('input')
    reducedMotion.type = 'checkbox'
    reducedMotion.addEventListener('change', () => {
      opts.onSettingsChange({ reducedMotion: reducedMotion.checked })
    })

    const theme = document.createElement('select')
    const themeOptions = THEMES.map((name) => {
      const el = option(name)
      theme.appendChild(el)
      return el
    })
    theme.addEventListener('change', () => {
      opts.onSettingsChange({ theme: readTheme(theme.value) })
    })

    for (const input of [sfx, haptics, reducedMotion, theme]) input.className = CTL_CLASS

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = `a11y-settings-close ${CTL_CLASS}`
    closeButton.addEventListener('click', () => opts.onSettingsClose())

    const texts = {
      sfx: textSpan(),
      haptics: textSpan(),
      reducedMotion: textSpan(),
      theme: textSpan(),
    }

    // Bốn ô nhập và nút Đóng chung một nhóm có tên: trình đọc màn hình đọc "Cài
    // đặt, nhóm" khi vào, và đây là MỘT phần tử để `syncInert` chừa lại khi bảng
    // mở. Nút Đóng đứng cuối — đúng thứ tự từ trên xuống của bảng trên canvas.
    const panel = document.createElement('div')
    panel.className = 'a11y-settings-panel'
    panel.setAttribute('role', 'group')
    panel.append(
      field(texts.sfx, sfx, true),
      field(texts.haptics, haptics, false),
      field(texts.reducedMotion, reducedMotion, false),
      field(texts.theme, theme, true),
      closeButton,
    )
    controlsRoot.append(dpad, settingsButton, panel)

    controls = {
      buttons,
      dpad,
      settingsButton,
      panel,
      closeButton,
      sfx,
      haptics,
      reducedMotion,
      theme,
      themeOptions,
      texts,
    }
    // Dựng điều khiển trong lúc dialog đang mở là chuyện hiếm, nhưng bất biến
    // "dialog mở thì nền bị khoá" phải đúng bất kể thứ tự gọi.
    syncInert()
    relabel()
    syncControls(opts.initial)
    applySettingsOpen()
  }

  /**
   * Chiếu `settingsOpen` lên thứ tự Tab của bảng.
   *
   * Bảng đóng thì canvas không vẽ điều khiển nào của nó, nên không có chỗ nào
   * cho focus ring: bốn ô nhập rời thứ tự Tab bằng `tabindex="-1"` — KHÔNG phải
   * `hidden`/`inert`, vì §12.1 bắt chúng luôn có mặt trong cây accessibility với
   * đủ tên, vai trò và trạng thái. Nút Đóng thì khác: "Đóng" khi không có gì
   * đang mở là một nút nói dối, nên nó `hidden` hẳn.
   */
  function applySettingsOpen(): void {
    const c = controls
    if (c === null) return
    for (const input of [c.sfx, c.haptics, c.reducedMotion, c.theme]) {
      if (settingsOpen) input.removeAttribute('tabindex')
      else input.setAttribute('tabindex', '-1')
    }
    c.closeButton.hidden = !settingsOpen
  }

  function setSettingsOpen(open: boolean): void {
    const c = controls
    if (c === null || open === settingsOpen) return
    settingsOpen = open
    // Chụp TRƯỚC khi đổi gì: ẩn nút Đóng đang giữ focus là focus rơi về `body`.
    const focusInPanel = c.panel.contains(document.activeElement)
    if (open) applySettingsOpen()
    syncInert()
    if (open) {
      // Điều khiển đầu của bảng (§B8: focus vào trong lớp phủ khi nó mở).
      c.sfx.focus()
      return
    }
    // Trả focus NGAY, rồi mới rút bảng khỏi thứ tự Tab: sau `syncInert()` nút Cài
    // đặt đã hết `inert` nên nhận được focus. Focus ở ngoài bảng (người chơi bấm
    // chuột lên canvas) thì để nguyên — giật focus khỏi chỗ họ đang đứng là sai.
    if (focusInPanel) c.settingsButton.focus()
    applySettingsOpen()
  }

  /**
   * Bản chiếu state → ô nhập. Gán thẳng `value`/`checked`, KHÔNG phát sự kiện:
   * đây là chiều state chảy xuống, không phải người dùng vừa đổi.
   */
  function syncControls(state: A11ySettingsState): void {
    const c = controls
    if (c === null) return
    const percent = String(Math.round(state.sfxVolume * 100))
    if (c.sfx.value !== percent) c.sfx.value = percent
    c.haptics.checked = state.haptics
    c.reducedMotion.checked = state.reducedMotion
    c.theme.value = state.theme
  }

  function placeControls(placement: A11yPlacement): void {
    const c = controls
    if (c !== null) {
      DIRS.forEach((dir, i) => {
        const button = c.buttons[i]
        if (button !== undefined) place(button, placement.dpad[dir])
      })
      place(c.settingsButton, placement.settingsButton)
      place(c.sfx, placement.sfx)
      place(c.haptics, placement.haptics)
      place(c.reducedMotion, placement.reducedMotion)
      place(c.theme, placement.theme)
      place(c.closeButton, placement.settingsClose)
    }
    // Thiếu hộp cho một nút (canvas đang có ít nút hơn DOM) thì gỡ chỗ nút đó,
    // KHÔNG để nó nằm lại ở hộp của lần đặt trước — ring vẽ sai chỗ còn tệ hơn
    // là không có chỗ.
    dialogButtons.forEach((button, i) => place(button, placement.dialogButtons[i] ?? null))
  }

  /**
   * Ẩn/hiện cụm D-pad của tầng DOM.
   *
   * Dùng `hidden` chứ không `disabled`: pause là trạng thái nền tảng tạm chiếm
   * màn hình, nên bốn nút mũi tên phải rời CẢ thứ tự tab LẪN cây accessibility —
   * để lại thì trình đọc màn hình vẫn báo "có bốn nút mũi tên" trong khi bấm vào
   * không có tác dụng gì, đúng kiểu DOM nói khác canvas.
   *
   * Cố ý KHÔNG gọi trong `relabel()`/`syncControls()`: trạng thái pause không
   * phải một phần của state cài đặt, và để nó bị chiếu lại mỗi lần đổi cài đặt
   * là tự ý bỏ pause.
   */
  function setDpadVisible(visible: boolean): void {
    const c = controls
    // Chưa `mountControls` (hoặc đã `destroy`) thì không có gì để ẩn — im lặng,
    // không tạo nút muộn.
    if (c === null) return
    c.dpad.hidden = !visible
  }

  function setStrings(strings: Strings): void {
    currentStrings = strings
    grid.setAttribute('aria-label', strings.boardLabel)
    relabel()
  }

  function destroy(): void {
    if (announceTimer !== null) clearTimeout(announceTimer)
    announceTimer = null
    // Xoá luôn giá trị đang chờ. Bỏ dòng này thì một `announceScore` gọi sau
    // `destroy()` sẽ mở cửa sổ mới rồi công bố lại đúng con điểm cũ — cầu nối đã
    // chết mà vẫn đọc số.
    pending = null
    dialogEl = null
    dialogButtons = []
    settingsOpen = false
    restoreFocusTo = null
    controls = null
    cells.length = 0
    root.textContent = ''
  }

  return {
    root,
    syncBoard,
    announceScore,
    announceOutcome,
    openDialog,
    closeDialog,
    mountControls,
    syncControls,
    placeControls,
    setSettingsOpen,
    setDpadVisible,
    setStrings,
    destroy,
  }
}
