import { SIZE, type Board, type Tile } from '../game/board'
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

export type A11yBridge = {
  readonly root: HTMLElement
  syncBoard(board: Board): void
  announceScore(score: number, locale: Locale): void
  announceOutcome(kind: 'win' | 'gameover', strings: Strings): void
  openDialog(labels: string[], onActivate: (index: number) => void): void
  closeDialog(): void
  setStrings(strings: Strings): void
  destroy(): void
}

/** A11Y-05: tối đa một thông báo điểm mỗi 2 giây. */
const ANNOUNCE_MS = 2000

export function createA11yBridge(): A11yBridge {
  const root = document.createElement('div')
  root.className = 'a11y-root'

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

  const dialogHost = document.createElement('div')

  root.append(grid, scoreLive, outcomeLive, dialogHost)

  let currentStrings: Strings | null = null
  let announceTimer: ReturnType<typeof setTimeout> | null = null
  let pending: string | null = null
  let dialogActive = false

  function onKeydown(ev: KeyboardEvent): void {
    if (!dialogActive) return
    if (ev.key !== 'Escape' && ev.key !== 'Esc') return
    // CỐ Ý không preventDefault (§A11 MUST NOT).
    closeDialog()
  }
  document.addEventListener('keydown', onKeydown)

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

  function closeDialog(): void {
    if (dialogActive && document.activeElement instanceof HTMLElement) {
      // Trả focus khỏi phần tử sắp bị gỡ, để focus không kẹt ở hư không.
      document.activeElement.blur()
    }
    dialogActive = false
    dialogHost.textContent = ''
  }

  function openDialog(labels: string[], onActivate: (index: number) => void): void {
    closeDialog()
    dialogActive = true
    labels.forEach((label, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => onActivate(index))
      dialogHost.appendChild(button)
    })
    const first = dialogHost.querySelector('button')
    if (first !== null) first.focus()
  }

  function setStrings(strings: Strings): void {
    currentStrings = strings
    grid.setAttribute('aria-label', strings.boardLabel)
  }

  function destroy(): void {
    document.removeEventListener('keydown', onKeydown)
    if (announceTimer !== null) clearTimeout(announceTimer)
    announceTimer = null
    // Xoá luôn giá trị đang chờ. Bỏ dòng này thì một `announceScore` gọi sau
    // `destroy()` sẽ mở cửa sổ mới rồi công bố lại đúng con điểm cũ — cầu nối đã
    // chết mà vẫn đọc số.
    pending = null
    dialogActive = false
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
    setStrings,
    destroy,
  }
}
