import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromData, makeIdFactory, type Board } from '../game/board'
import { mulberry32 } from '../game/rng'
import { applyMove, type Dir } from '../game/rules'
// `vi` của vitest và `vi` (tiếng Việt) của i18n trùng tên. Phải đổi tên một
// trong hai — hai import cùng tên trong một module là lỗi cú pháp, không phải
// chuyện style. Đổi tên bản i18n vì nó chỉ xuất hiện một lần, còn `vi` của
// vitest dùng khắp file.
import { en, vi as viStrings } from '../i18n'
import {
  createA11yBridge,
  gridLabels,
  type A11yBridge,
  type A11yPlacement,
  type A11yRect,
  type A11ySettingsPatch,
  type A11ySettingsState,
} from './bridge'

function b(rows: number[][]): Board {
  return fromData(rows, makeIdFactory())
}
const Z = [0, 0, 0, 0]

let bridge: A11yBridge

beforeEach(() => {
  document.body.innerHTML = ''
  bridge = createA11yBridge()
  bridge.setStrings(en)
  document.body.appendChild(bridge.root)
})

afterEach(() => {
  bridge.destroy()
  vi.useRealTimers()
})

const cells = () => Array.from(bridge.root.querySelectorAll<HTMLElement>('[role="gridcell"]'))
const boardRoot = () => bridge.root.querySelector<HTMLElement>('.a11y-root-board')!
const controlsRoot = () => bridge.root.querySelector<HTMLElement>('.a11y-root-controls')!
const dialogHost = () => controlsRoot().querySelector<HTMLElement>('.a11y-dialog-host')
const dialog = () => bridge.root.querySelector<HTMLElement>('[role="dialog"]')
const dialogButtons = () =>
  Array.from(bridge.root.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))

/** Mở dialog với tiêu đề và nút cho trước; `restore` là tuỳ chọn của §B8. */
function open(
  labels: string[],
  options: { heading?: string; onActivate?: (i: number) => void; restoreFocusTo?: HTMLElement } = {},
): void {
  const opts = {
    heading: options.heading ?? en.gameOverTitle,
    labels,
    onActivate: options.onActivate ?? ((): void => {}),
  }
  bridge.openDialog(
    options.restoreFocusTo === undefined ? opts : { ...opts, restoreFocusTo: options.restoreFocusTo },
  )
}

describe('tầng a11y ẩn khỏi mắt nhưng còn trong cây accessibility', () => {
  it('root không bị aria-hidden', () => {
    expect(bridge.root.getAttribute('aria-hidden')).not.toBe('true')
  })

  it('class của cầu nối khớp ĐÚNG class trong CSS', () => {
    // Lệch tên class một bên thì cả tầng hiện ra giữa màn hình (hoặc không bao
    // giờ lộ ra) mà không test nào khác đỏ.
    expect(bridge.root.className).toBe('a11y-root')
    expect(boardRoot().className).toBe('a11y-root-board')
    expect(controlsRoot().className).toBe('a11y-root-controls')
  })

  it('bàn cờ và hai vùng live nằm ở gốc A; dialog nằm ở gốc B', () => {
    expect(boardRoot().querySelector('[role="grid"]')).not.toBeNull()
    expect(boardRoot().querySelector('[aria-live="polite"]')).not.toBeNull()
    expect(boardRoot().querySelector('[aria-live="assertive"]')).not.toBeNull()
    // Dialog phải ở gốc ĐIỀU KHIỂN: nút trong dialog là nút thật, đặt vào gốc bàn
    // cờ (bị cắt vĩnh viễn) là lặp lại đúng lỗi focus ring vô hình.
    expect(dialogHost()).not.toBeNull()
    expect(boardRoot().contains(dialogHost())).toBe(false)
  })
})

type Rule = { selectors: string[]; body: string }

const css = (): string => readFileSync('src/a11y/bridge.css', 'utf8')

/**
 * Tách rule theo ĐÚNG selector, thay cho `expect(css).toContain('clip-path')`:
 * grep chuỗi xanh cả khi rule không hề khớp class đang dùng. Bỏ comment trước
 * khi tách, nếu không comment đứng trước selector sẽ dính vào tên selector.
 */
function rules(source: string): Rule[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '')
  return Array.from(clean.matchAll(/([^{}]+)\{([^{}]*)\}/g), (m) => ({
    selectors: m[1]!.split(',').map((s) => s.trim()).filter((s) => s !== ''),
    body: m[2]!,
  }))
}
function ruleFor(source: string, selector: string): Rule | null {
  return rules(source).find((r) => r.selectors.includes(selector)) ?? null
}

describe('CSS của tầng a11y', () => {
  /**
   * Spec §12, Amend 2026-10-08 (4). Bản trước cho gốc điều khiển "lộ ra khi có
   * focus" bằng `position: static`: nó rơi vào dòng chảy dưới game cao 100 % và
   * trang mọc thanh cuộn mỗi lần dialog mở. jsdom không dàn trang nên không đo
   * được thanh cuộn ở đây — các test này khoá CƠ CHẾ: không còn đường nào đưa
   * tầng a11y vào dòng chảy.
   */
  it('KHÔNG còn rule lộ-ra-khi-focus nào — đó là thứ đẩy trang tràn', () => {
    for (const rule of rules(css())) {
      const where = rule.selectors.join(', ')
      expect(where).not.toContain(':focus-within')
      expect(rule.body, where).not.toContain('position: static')
      expect(rule.body, where).not.toContain('position: relative')
    }
  })

  it('gốc điều khiển không chiếm chỗ (fixed, 0×0) và không nhận pointer event', () => {
    const rule = ruleFor(css(), '.a11y-root-controls')
    expect(rule).not.toBeNull()
    for (const decl of ['position: fixed', 'width: 0', 'height: 0', 'pointer-events: none']) {
      expect(rule!.body, decl).toContain(decl)
    }
  })

  it('gốc điều khiển và gốc chung KHÔNG cắt — cắt ở đó là focus ring chết', () => {
    for (const selector of ['.a11y-root', '.a11y-root-controls']) {
      const rule = ruleFor(css(), selector)
      expect(rule?.body ?? '', selector).not.toContain('clip-path')
      expect(rule?.body ?? '', selector).not.toContain('overflow: hidden')
    }
  })

  it('gốc bàn cờ và chữ chỉ-cho-screen-reader vẫn bị cắt còn 1 px', () => {
    for (const selector of ['.a11y-root-board', '.a11y-root-controls .a11y-sr']) {
      const rule = ruleFor(css(), selector)
      expect(rule, selector).not.toBeNull()
      expect(rule!.body, selector).toContain('clip-path: inset(50%)')
      expect(rule!.body, selector).toContain('position: absolute')
    }
  })

  it('điều khiển là fixed, trong suốt, và để pointer event đi xuyên xuống canvas', () => {
    const rule = ruleFor(css(), '.a11y-root-controls .a11y-ctl')
    expect(rule).not.toBeNull()
    for (const decl of [
      'position: fixed',
      'background: transparent',
      'color: transparent',
      'appearance: none',
      // Một cú bấm chỉ có MỘT nơi nhận: ô bấm của canvas.
      'pointer-events: none',
    ]) {
      expect(rule!.body, decl).toContain(decl)
    }
  })

  it('trong suốt KHÔNG bằng opacity — opacity 0 kéo luôn focus ring về 0', () => {
    for (const rule of rules(css())) {
      expect(rule.body, rule.selectors.join(', ')).not.toContain('opacity')
    }
  })

  it('điều khiển đã có chỗ thì bỏ cắt, để ring vẽ ra được', () => {
    expect(ruleFor(css(), '.a11y-root-controls .a11y-ctl')!.body).toContain('clip-path: inset(50%)')
    expect(ruleFor(css(), '.a11y-root-controls .a11y-ctl[data-placed]')!.body).toContain(
      'clip-path: none',
    )
  })

  it('focus ring 3 px lệch 2 px bằng token --focus (DesignSystem §B8)', () => {
    const rule = ruleFor(css(), '.a11y-root-controls .a11y-ctl:focus-visible')
    expect(rule).not.toBeNull()
    expect(rule!.body).toMatch(/outline: 3px solid var\(--focus\b/)
    expect(rule!.body).toContain('outline-offset: 2px')
  })

  it('không rule nào dùng display:none hay visibility:hidden (gỡ khỏi cây a11y)', () => {
    for (const rule of rules(css())) {
      expect(rule.body, rule.selectors.join(', ')).not.toContain('display: none')
      expect(rule.body, rule.selectors.join(', ')).not.toContain('visibility: hidden')
    }
  })

  it('CSS không ép cỡ tối thiểu — cỡ đến từ nút canvas, một nguồn duy nhất', () => {
    // Cỡ ≥ 44 / ≥ 48 px (A11Y-07) nay do hộp của canvas quyết định và được kiểm
    // ở `app/placement.test.ts`. Một `min-height` ở đây sẽ thắng `height` của
    // `placeControls` và đẩy focus ring ra ngoài viewport ở nút sát mép.
    for (const rule of rules(css())) {
      expect(rule.body, rule.selectors.join(', ')).not.toMatch(/min-(width|height)/)
    }
  })
})

describe('gridLabels — hàm thuần', () => {
  it('trả đúng 16 nhãn', () => {
    expect(gridLabels(b([Z, Z, Z, Z]), en)).toHaveLength(16)
  })

  it('ô rỗng đọc là ô trống, không đọc số 0', () => {
    expect(gridLabels(b([Z, Z, Z, Z]), en)[0]).toBe(en.empty)
    expect(gridLabels(b([Z, Z, Z, Z]), en)[0]).not.toContain('0')
  })

  it('ô có giá trị đọc đúng số', () => {
    const labels = gridLabels(b([[2, 0, 0, 0], Z, Z, Z]), en)
    expect(labels[0]).toBe('2')
    expect(labels[1]).toBe(en.empty)
  })

  it('đọc theo thứ tự hàng rồi cột', () => {
    const labels = gridLabels(b([[2, 4, 0, 0], [8, 0, 0, 0], Z, Z]), en)
    expect(labels.slice(0, 4)).toEqual(['2', '4', en.empty, en.empty])
    expect(labels[4]).toBe('8')
  })

  it('tile vượt 8192 vẫn đọc được, không có hậu tố +', () => {
    expect(gridLabels(b([[16384, 0, 0, 0], Z, Z, Z]), en)[0]).toBe('16384')
  })

  it('dùng đúng ngôn ngữ', () => {
    expect(gridLabels(b([Z, Z, Z, Z]), viStrings)[0]).toBe(viStrings.empty)
  })
})

describe('syncBoard', () => {
  it('dựng lưới 4×4 với aria-rowcount và aria-colcount', () => {
    bridge.syncBoard(b([Z, Z, Z, Z]))
    const grid = bridge.root.querySelector('[role="grid"]')!
    expect(grid.getAttribute('aria-rowcount')).toBe('4')
    expect(grid.getAttribute('aria-colcount')).toBe('4')
  })

  it('có đúng 16 gridcell', () => {
    bridge.syncBoard(b([Z, Z, Z, Z]))
    expect(cells()).toHaveLength(16)
  })

  it('16 cell nằm trong 4 role="row" thật, khớp con số aria-rowcount đã khai', () => {
    bridge.syncBoard(b([Z, Z, Z, Z]))
    const rows = Array.from(bridge.root.querySelectorAll('[role="row"]'))
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(4)
    }
    // Thứ tự document phải là hàng rồi cột: dồn 16 cell vào một hàng thì ô thứ
    // 7 bị đọc là "hàng 1 cột 7", trong khi mắt thấy nó ở hàng 2 cột 3.
    bridge.syncBoard(b([[2, 0, 0, 0], [0, 0, 64, 0], Z, Z]))
    const cellAt = (r: number, c: number) =>
      rows[r]!.querySelectorAll('[role="gridcell"]')[c]!.textContent
    expect(cellAt(0, 0)).toBe('2')
    expect(cellAt(1, 2)).toBe('64')
  })

  it('nhãn ô khớp board', () => {
    bridge.syncBoard(b([[2, 0, 0, 0], [0, 0, 64, 0], Z, Z]))
    const labels = cells().map((c) => c.textContent)
    expect(labels[0]).toBe('2')
    expect(labels[6]).toBe('64')
    expect(labels[5]).toBe(en.empty)
  })

  // Review Focus mục 1: bài test canh việc canvas và DOM lệch nhau.
  it('gọi lại với board mới thì nhãn cập nhật hết, không sót ô cũ', () => {
    bridge.syncBoard(b([[2, 0, 0, 0], Z, Z, Z]))
    bridge.syncBoard(b([Z, Z, Z, Z]))
    expect(cells()[0]!.textContent).toBe(en.empty)
  })

  it('board đầy đọc được cả 16 ô', () => {
    const rows = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]
    bridge.syncBoard(b(rows))
    expect(cells().filter((c) => c.textContent !== en.empty)).toHaveLength(16)
  })

  it('không sinh lại 16 cell mỗi lần gọi — tái dùng phần tử', () => {
    bridge.syncBoard(b([Z, Z, Z, Z]))
    const first = cells()[0]!
    bridge.syncBoard(b([[2, 0, 0, 0], Z, Z, Z]))
    expect(cells()[0]).toBe(first)
  })
})

/**
 * Review Focus mục 1, phần dễ vỡ nhất: canvas và DOM chỉ khớp nếu nhãn được
 * tính lại SAU mỗi nước đi. Ba loại nước đi cho ra ba hình dạng board khác
 * nhau — merge, spawn, và nước đi không đổi gì — nên cả ba phải được canh
 * riêng, bằng chính `applyMove` chứ không bằng board dựng tay.
 */
describe('syncBoard sau nước đi thật — DOM không được lệch canvas', () => {
  const move = (rows: number[][], dir: Dir) =>
    applyMove(b(rows), dir, { rng: mulberry32(7), nextId: makeIdFactory(100) })

  /** Bất biến: nội dung DOM phải bằng đúng nhãn tính từ board canvas đang vẽ. */
  const expectProjection = (board: Board): void => {
    bridge.syncBoard(board)
    const expected = gridLabels(board, en)
    expect(cells().map((c) => c.textContent)).toEqual(expected)
    expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(expected)
  }

  it('sau nước đi có MERGE', () => {
    const out = move([[2, 2, 0, 0], Z, Z, Z], 'left')
    expect(out.merges.length).toBeGreaterThan(0)
    expectProjection(out.board)
  })

  it('sau nước đi chỉ SPAWN, không merge — vẫn khớp', () => {
    const out = move([[0, 0, 0, 2], Z, Z, Z], 'left')
    expect(out.moved).toBe(true)
    expect(out.merges).toHaveLength(0)
    expect(out.spawn).not.toBeNull()
    expectProjection(out.board)
  })

  it('sau nước đi KHÔNG đổi gì thì không ô nào được phép lệch', () => {
    const rows = [[2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]]
    const out = move(rows, 'left')
    expect(out.moved).toBe(false)
    expectProjection(out.board)
  })

  it('đi liên tiếp nhiều nước thì DOM vẫn khớp sau TỪNG nước', () => {
    let board = b([[2, 2, 0, 0], [0, 4, 4, 0], Z, Z])
    bridge.syncBoard(board)
    for (const dir of ['left', 'up', 'right', 'down', 'left'] as const) {
      board = applyMove(board, dir, { rng: mulberry32(11), nextId: makeIdFactory(200) }).board
      expectProjection(board)
    }
  })
})

describe('announceScore — throttle ≤ 1 lần / 2 giây (A11Y-05)', () => {
  const polite = () => bridge.root.querySelector('[aria-live="polite"]')!

  it('lần đầu công bố ngay', () => {
    bridge.announceScore(4, 'en')
    expect(polite().textContent).toContain('4')
  })

  it('cập nhật dồn dập trong 2 giây chỉ công bố một lần', () => {
    vi.useFakeTimers()
    bridge.announceScore(2, 'en')
    const first = polite().textContent
    bridge.announceScore(4, 'en')
    bridge.announceScore(8, 'en')
    expect(polite().textContent).toBe(first)
  })

  it('hết 2 giây thì công bố giá trị mới nhất', () => {
    vi.useFakeTimers()
    bridge.announceScore(2, 'en')
    bridge.announceScore(64, 'en')
    vi.advanceTimersByTime(2100)
    expect(polite().textContent).toContain('64')
  })
})

describe('announceOutcome', () => {
  const assertive = () => bridge.root.querySelector('[aria-live="assertive"]')!

  it('thắng được công bố', () => {
    bridge.announceOutcome('win', en)
    expect(bridge.root.textContent).toContain(en.winTitle)
  })

  it('thua được công bố', () => {
    bridge.announceOutcome('gameover', en)
    expect(bridge.root.textContent).toContain(en.gameOverTitle)
  })

  it('dùng aria-live assertive cho kết cục — người chơi cần biết ngay', () => {
    expect(bridge.root.querySelector('[aria-live="assertive"]')).not.toBeNull()
  })

  // R23: kịch bản chơi được — thua, bấm Retry, thua lần nữa. Screen reader so
  // NỘI DUNG vùng live, nên gán lại đúng chuỗi cũ thì lần hai bị im lặng.
  it('thua lần HAI sau Retry vẫn công bố lại được', () => {
    bridge.announceOutcome('gameover', en)
    expect(assertive().textContent).toBe(en.gameOverTitle)

    open([en.retry])
    bridge.closeDialog()
    // Đóng dialog là lúc ván cũ kết thúc; xoá vùng để lần công bố sau chắc chắn
    // là một thay đổi nội dung.
    expect(assertive().textContent).toBe('')

    bridge.announceOutcome('gameover', en)
    expect(assertive().textContent).toBe(en.gameOverTitle)
  })
})

describe('openDialog — §B8', () => {
  it('phơi nút với nhãn đã cho', () => {
    open([en.keepPlaying, en.newGame])
    expect(dialogButtons().map((b) => b.textContent)).toEqual([en.keepPlaying, en.newGame])
  })

  it('nút là <button> thật, không phải div', () => {
    open([en.retry])
    expect(dialogButtons()[0]!.tagName).toBe('BUTTON')
  })

  it('bấm nút phát chỉ số của nó', () => {
    const onActivate = vi.fn()
    open([en.keepPlaying, en.newGame], { onActivate })
    dialogButtons()[1]!.click()
    expect(onActivate).toHaveBeenCalledWith(1)
  })

  it('có role="dialog", aria-modal, và tên trỏ vào một heading THẬT', () => {
    open([en.retry], { heading: en.gameOverTitle })
    const el = dialog()!
    expect(el.getAttribute('role')).toBe('dialog')
    expect(el.getAttribute('aria-modal')).toBe('true')
    const id = el.getAttribute('aria-labelledby')
    expect(id).not.toBeNull()
    const named = el.querySelector(`#${id}`)
    expect(named, 'aria-labelledby phải trỏ vào một phần tử có thật').not.toBeNull()
    expect(named!.textContent).toBe(en.gameOverTitle)
  })

  it('id của heading là duy nhất giữa các lần mở', () => {
    open([en.retry], { heading: en.winTitle })
    const first = dialog()!.getAttribute('aria-labelledby')
    open([en.retry], { heading: en.gameOverTitle })
    expect(dialog()!.getAttribute('aria-labelledby')).not.toBe(first)
  })

  it('mở dialog thì focus vào nút đầu', () => {
    open([en.keepPlaying, en.newGame])
    expect(document.activeElement).toBe(dialogButtons()[0])
  })

  /** Bắn `Tab` từ phần tử đang có focus, đúng như trình duyệt sẽ làm. */
  function tab(shift = false): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    })
    ;(document.activeElement as HTMLElement).dispatchEvent(ev)
    return ev
  }

  it('Tab ở nút CUỐI vòng về nút đầu — focus không thoát khỏi dialog', () => {
    open([en.keepPlaying, en.newGame])
    const buttons = dialogButtons()
    buttons[1]!.focus()
    const ev = tab()
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(buttons[0])
  })

  it('Shift+Tab ở nút ĐẦU vòng về nút cuối', () => {
    open([en.keepPlaying, en.newGame])
    const buttons = dialogButtons()
    buttons[0]!.focus()
    const ev = tab(true)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(buttons[1])
  })

  it('Tab ở nút GIỮA không bị chặn — nhường cho trình duyệt tự đi', () => {
    open([en.keepPlaying, en.newGame, en.retry])
    const buttons = dialogButtons()
    buttons[0]!.focus()
    expect(tab().defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(buttons[0])
  })

  it('đóng dialog thì gỡ cả dialog khỏi DOM', () => {
    open([en.retry])
    bridge.closeDialog()
    expect(dialog()).toBeNull()
    expect(bridge.root.querySelectorAll('[role="dialog"] button')).toHaveLength(0)
  })

  it('trả focus về restoreFocusTo khi đóng (§B8)', () => {
    const invoker = document.createElement('button')
    document.body.appendChild(invoker)
    open([en.retry], { restoreFocusTo: invoker })
    expect(document.activeElement).not.toBe(invoker)
    bridge.closeDialog()
    expect(document.activeElement).toBe(invoker)
  })

  it('không truyền restoreFocusTo thì trả focus về phần tử đã kích hoạt', () => {
    mount()
    const invoker = controlsRoot().querySelector<HTMLButtonElement>('.a11y-settings')!
    invoker.focus()
    open([en.retry])
    expect(document.activeElement).not.toBe(invoker)
    bridge.closeDialog()
    expect(document.activeElement).toBe(invoker)
  })

  it('restoreFocusTo đã bị gỡ khỏi cây thì không focus vào hư không', () => {
    const gone = document.createElement('button')
    document.body.appendChild(gone)
    open([en.retry], { restoreFocusTo: gone })
    gone.remove()
    bridge.closeDialog()
    expect(document.activeElement).not.toBe(gone)
  })

  it('mở dialog mới thì dialog cũ được thay, không chồng', () => {
    open([en.retry])
    open([en.keepPlaying])
    expect(dialogButtons()).toHaveLength(1)
    expect(dialog()).not.toBeNull()
  })
})

/**
 * §B8 (Task 14 để nợ, Task 18 trả): `aria-modal="true"` chỉ nói với trình đọc
 * màn hình, nó không chặn chuột và bàn phím. `inert` mới là thứ chặn thật.
 */
describe('inert — nền bị khoá trong lúc dialog mở', () => {
  beforeEach(() => {
    bridge.mountControls({
      onDir: () => {},
      onSettings: () => {},
      onSettingsChange: () => {},
      initial: { sfxVolume: 0.7, haptics: true, reducedMotion: false, theme: 'light' },
    })
  })

  const dpad = () => controlsRoot().querySelector<HTMLElement>('.a11y-dpad')!
  const settingsBtn = () => controlsRoot().querySelector<HTMLElement>('.a11y-settings')!

  it('mở dialog thì bàn cờ và các điều khiển nền bị inert', () => {
    open([en.retry])
    expect(boardRoot().hasAttribute('inert')).toBe(true)
    expect(dpad().hasAttribute('inert')).toBe(true)
    expect(settingsBtn().hasAttribute('inert')).toBe(true)
  })

  it('chính dialog KHÔNG bị inert — nút trong đó phải bấm được', () => {
    open([en.retry])
    expect(dialog()!.hasAttribute('inert')).toBe(false)
    expect(dialogHost()!.hasAttribute('inert')).toBe(false)
  })

  it('đóng dialog thì gỡ inert khỏi mọi thứ', () => {
    open([en.retry])
    bridge.closeDialog()
    expect(boardRoot().hasAttribute('inert')).toBe(false)
    expect(dpad().hasAttribute('inert')).toBe(false)
    expect(settingsBtn().hasAttribute('inert')).toBe(false)
  })

  it('đóng khi không có dialog thì không khoá gì cả', () => {
    bridge.closeDialog()
    expect(boardRoot().hasAttribute('inert')).toBe(false)
    expect(dpad().hasAttribute('inert')).toBe(false)
  })

  it('mở lại sau khi đóng vẫn khoá nền', () => {
    open([en.retry])
    bridge.closeDialog()
    open([en.keepPlaying])
    expect(boardRoot().hasAttribute('inert')).toBe(true)
  })

  it('gốc cầu nối không bị inert — khoá nó là khoá luôn cả dialog', () => {
    open([en.retry])
    expect(bridge.root.hasAttribute('inert')).toBe(false)
  })
})

/**
 * §9.5 / PRD:452 — pause của nền tảng phải ẩn D-pad. Bản canvas ẩn mà bản DOM
 * còn nguyên là đúng kiểu lệch hai tầng: mắt không thấy nút nào, mà trình đọc
 * màn hình vẫn đọc ra bốn nút mũi tên bấm vào không có tác dụng.
 */
describe('R41 — setDpadVisible (pause ẩn D-pad ở cả hai tầng)', () => {
  const dpad = () => controlsRoot().querySelector<HTMLElement>('.a11y-dpad')

  const mount = (): void => {
    bridge.mountControls({
      onDir: () => {},
      onSettings: () => {},
      onSettingsChange: () => {},
      initial: { sfxVolume: 0.7, haptics: true, reducedMotion: false, theme: 'light' },
    })
  }

  it('mặc định là HIỆN: chưa pause thì D-pad phải dùng được', () => {
    mount()
    expect(dpad()!.hidden).toBe(false)
  })

  it('ẩn cả cụm chứ không chỉ một nút', () => {
    mount()
    bridge.setDpadVisible(false)
    expect(dpad()!.hidden).toBe(true)
    // Vẫn đủ bốn nút trong DOM: ẩn chứ không dựng lại, nên resume không sinh
    // thêm listener thứ hai trên cùng một nút.
    expect(dpad()!.querySelectorAll('button')).toHaveLength(4)
  })

  it('resume hiện lại đúng cụm đó', () => {
    mount()
    bridge.setDpadVisible(false)
    bridge.setDpadVisible(true)
    expect(dpad()!.hidden).toBe(false)
  })

  it('chỉ đụng D-pad: nút Settings và ô nhập vẫn nguyên', () => {
    mount()
    bridge.setDpadVisible(false)
    expect(controlsRoot().querySelector<HTMLElement>('.a11y-settings')!.hidden).toBe(false)
    expect(controlsRoot().querySelector<HTMLInputElement>('input[type="range"]')!.hidden).toBe(
      false,
    )
  })

  it('đổi cài đặt trong lúc pause KHÔNG tự bỏ ẩn (pause không nằm trong state)', () => {
    mount()
    bridge.setDpadVisible(false)
    bridge.syncControls({ sfxVolume: 0.2, haptics: false, reducedMotion: true, theme: 'dark' })
    expect(dpad()!.hidden, 'syncControls chiếu cài đặt, không phải trạng thái pause').toBe(true)
  })

  it('chưa mountControls thì gọi là no-op, không dựng nút muộn', () => {
    expect(() => bridge.setDpadVisible(false)).not.toThrow()
    expect(dpad()).toBeNull()
  })

  it('sau destroy cũng là no-op', () => {
    mount()
    bridge.destroy()
    expect(() => bridge.setDpadVisible(false)).not.toThrow()
  })
})

/**
 * §12.2: canvas là nguồn sự thật, tầng này là bản chiếu CHỈ-ĐỌC. Nó không được
 * tự đổi trạng thái trình bày của mình theo một đường riêng — kể cả `Esc`, kể cả
 * những ca mà hai đường tình cờ trùng nhau.
 */
describe('§12.2 — cầu nối không tự đổi trạng thái của mình', () => {
  it('Esc KHÔNG tự đóng dialog: đóng là việc của tầng ghép nối, gọi từ state', () => {
    open([en.retry])
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(ev)
    expect(dialog()).not.toBeNull()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('Esc bắn từ chính nút đang focus cũng không bị chặn và không đóng', () => {
    open([en.retry])
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    ;(document.activeElement as HTMLElement).dispatchEvent(ev)
    expect(dialog()).not.toBeNull()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('closeDialog gọi hai lần là no-op, không ném', () => {
    open([en.retry])
    bridge.closeDialog()
    expect(() => bridge.closeDialog()).not.toThrow()
    expect(dialog()).toBeNull()
  })
})

type Calls = { dirs: Dir[]; patches: A11ySettingsPatch[]; settings: number }

function mount(initial: Partial<A11ySettingsState> = {}): Calls {
  const calls: Calls = { dirs: [], patches: [], settings: 0 }
  bridge.mountControls({
    onDir: (dir) => calls.dirs.push(dir),
    onSettings: () => {
      calls.settings += 1
    },
    onSettingsChange: (patch) => calls.patches.push(patch),
    initial: { sfxVolume: 0.5, haptics: true, reducedMotion: false, theme: 'light', ...initial },
  })
  return calls
}

const dpadButtons = () =>
  Array.from(controlsRoot().querySelectorAll<HTMLButtonElement>('.a11y-dpad__btn'))
const settingsButton = () => controlsRoot().querySelector<HTMLButtonElement>('.a11y-settings')!
const sfx = () => controlsRoot().querySelector<HTMLInputElement>('input[type="range"]')!
const checkboxes = () =>
  Array.from(controlsRoot().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
const themeSelect = () => controlsRoot().querySelector<HTMLSelectElement>('select')!

describe('mountControls — §12.1: nút và ô nhập DOM thật', () => {
  it('bốn nút D-pad thật, nhãn từ Strings, đúng thứ tự chữ thập của §B8', () => {
    mount()
    const buttons = dpadButtons()
    expect(buttons).toHaveLength(4)
    for (const button of buttons) expect(button.tagName).toBe('BUTTON')
    expect(buttons.map((b) => b.textContent)).toEqual([
      en.moveUp,
      en.moveLeft,
      en.moveRight,
      en.moveDown,
    ])
  })

  it('bấm nút D-pad phát đúng Dir — cùng đường vào logic với canvas', () => {
    const calls = mount()
    for (const button of dpadButtons()) button.click()
    expect(calls.dirs).toEqual(['up', 'left', 'right', 'down'])
  })

  it('Settings là nút thật, nhãn từ Strings, phát onSettings', () => {
    const calls = mount()
    const button = settingsButton()
    expect(button.tagName).toBe('BUTTON')
    expect(button.textContent).toBe(en.settings)
    button.click()
    expect(calls.settings).toBe(1)
  })

  it('SFX là <input type="range"> 0–100, giá trị đầu đọc từ state', () => {
    mount({ sfxVolume: 0.3 })
    const slider = sfx()
    expect(slider.tagName).toBe('INPUT')
    expect(slider.type).toBe('range')
    expect(slider.min).toBe('0')
    expect(slider.max).toBe('100')
    expect(slider.value).toBe('30')
  })

  it('slider phát patch sfxVolume theo thang 0–1 của state', () => {
    const calls = mount()
    const slider = sfx()
    slider.value = '80'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    expect(calls.patches).toEqual([{ sfxVolume: 0.8 }])
  })

  it('hai checkbox thật cho haptics và reduced motion, mang giá trị đầu từ state', () => {
    mount({ haptics: false, reducedMotion: true })
    const [haptics, reduced] = checkboxes()
    expect(haptics!.type).toBe('checkbox')
    expect(reduced!.type).toBe('checkbox')
    expect(haptics!.checked).toBe(false)
    expect(reduced!.checked).toBe(true)
  })

  it('đổi checkbox phát đúng patch', () => {
    const calls = mount({ haptics: true, reducedMotion: false })
    const [haptics, reduced] = checkboxes()
    haptics!.checked = false
    haptics!.dispatchEvent(new Event('change', { bubbles: true }))
    reduced!.checked = true
    reduced!.dispatchEvent(new Event('change', { bubbles: true }))
    expect(calls.patches).toEqual([{ haptics: false }, { reducedMotion: true }])
  })

  it('theme là <select> thật với ba lựa chọn, nhãn từ Strings', () => {
    mount()
    const select = themeSelect()
    expect(select.tagName).toBe('SELECT')
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['light', 'dark', 'contrast'])
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      en.themeLight,
      en.themeDark,
      en.themeContrast,
    ])
    expect(select.value).toBe('light')
    // `<label>` bọc quanh `<select>` sẽ nuốt chữ của ba `<option>` vào tên đọc
    // lên, nên tên trường phải chốt bằng `aria-label`.
    expect(select.getAttribute('aria-label')).toBe(en.theme)
  })

  it('đổi theme phát đúng patch', () => {
    const calls = mount()
    const select = themeSelect()
    select.value = 'dark'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(calls.patches).toEqual([{ theme: 'dark' }])
  })

  it('mỗi ô nhập nằm trong một <label> bọc quanh — tên đọc lên lấy từ nhãn', () => {
    mount()
    const labels = Array.from(controlsRoot().querySelectorAll('label.a11y-field'))
    expect(labels).toHaveLength(4)
    for (const label of labels) {
      expect(label.querySelector('input, select')).not.toBeNull()
      expect((label.textContent ?? '').length).toBeGreaterThan(0)
    }
  })

  it('dựng MỘT LẦN: gọi lại không dựng chồng (§12.1)', () => {
    mount()
    mount()
    expect(dpadButtons()).toHaveLength(4)
    expect(controlsRoot().querySelectorAll('button')).toHaveLength(5)
    expect(checkboxes()).toHaveLength(2)
  })

  it('nhãn lấy từ Strings: đổi ngôn ngữ thì mọi nhãn đổi theo', () => {
    mount()
    bridge.setStrings(viStrings)
    expect(dpadButtons().map((b) => b.textContent)).toEqual([
      viStrings.moveUp,
      viStrings.moveLeft,
      viStrings.moveRight,
      viStrings.moveDown,
    ])
    expect(settingsButton().textContent).toBe(viStrings.settings)
    expect(themeSelect().getAttribute('aria-label')).toBe(viStrings.theme)
    expect(Array.from(themeSelect().options).map((o) => o.textContent)).toEqual([
      viStrings.themeLight,
      viStrings.themeDark,
      viStrings.themeContrast,
    ])
  })

  it('dựng sau khi setStrings thì nhãn đúng ngay từ đầu', () => {
    bridge.setStrings(viStrings)
    mount()
    expect(dpadButtons()[0]!.textContent).toBe(viStrings.moveUp)
    expect(controlsRoot().querySelector('.a11y-field__text')!.textContent).toBe(viStrings.sound)
  })

  it('syncControls là bản chiếu state → ô nhập, KHÔNG phát patch nào', () => {
    const calls = mount({ sfxVolume: 0.5, haptics: true, reducedMotion: false, theme: 'light' })
    bridge.syncControls({ sfxVolume: 0.9, haptics: false, reducedMotion: true, theme: 'dark' })
    expect(sfx().value).toBe('90')
    expect(checkboxes()[0]!.checked).toBe(false)
    expect(checkboxes()[1]!.checked).toBe(true)
    expect(themeSelect().value).toBe('dark')
    expect(calls.patches).toEqual([])
  })

  it('ô nhập nằm ở gốc ĐIỀU KHIỂN, không nằm ở gốc bàn cờ (bị cắt vĩnh viễn)', () => {
    mount()
    expect(boardRoot().querySelectorAll('button, input, select')).toHaveLength(0)
    expect(controlsRoot().querySelectorAll('button, input, select').length).toBeGreaterThan(0)
  })
})

/**
 * Spec §12, Amend 2026-10-08 (4): mỗi điều khiển DOM nằm đúng trên nút canvas của
 * nó. Tầng này không tính hình học — nó đặt phần tử vào hộp được đưa cho.
 */
describe('placeControls — nút DOM nằm trên nút canvas', () => {
  const rect = (x: number, y: number, w = 48, h = 48): A11yRect => ({ x, y, w, h })
  const placement = (over: Partial<A11yPlacement> = {}): A11yPlacement => ({
    dpad: { up: rect(136, 400), left: rect(80, 456), right: rect(192, 456), down: rect(136, 512) },
    settingsButton: rect(256, 20, 44, 44),
    sfx: rect(40, 150, 200, 44),
    haptics: rect(250, 200, 44, 44),
    reducedMotion: rect(250, 256, 44, 44),
    theme: rect(180, 310, 120, 48),
    dialogButtons: [],
    ...over,
  })
  const box = (el: HTMLElement) => ({
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: el.style.height,
  })
  const px = (r: A11yRect) => ({
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
  })

  it('mọi điều khiển mang class a11y-ctl; chữ của nhãn và tiêu đề mang a11y-sr', () => {
    mount()
    open([en.keepPlaying, en.newGame])
    const ctl = Array.from(controlsRoot().querySelectorAll('button, input, select'))
    expect(ctl).toHaveLength(4 + 1 + 4 + 2)
    for (const el of ctl) expect(el.classList.contains('a11y-ctl'), el.outerHTML).toBe(true)
    for (const el of controlsRoot().querySelectorAll('h2, .a11y-field__text')) {
      expect(el.classList.contains('a11y-sr'), el.outerHTML).toBe(true)
    }
  })

  it('chưa đặt thì chưa điều khiển nào có chỗ', () => {
    mount()
    for (const el of controlsRoot().querySelectorAll('.a11y-ctl')) {
      expect(el.hasAttribute('data-placed')).toBe(false)
    }
  })

  it('bốn nút D-pad vào đúng hộp của HƯỚNG mình, không theo thứ tự mảng', () => {
    mount()
    const p = placement()
    bridge.placeControls(p)
    // Thứ tự DOM là lên · trái · phải · xuống (§B8).
    const [up, left, right, down] = dpadButtons()
    expect(box(up!)).toEqual(px(p.dpad.up))
    expect(box(left!)).toEqual(px(p.dpad.left))
    expect(box(right!)).toEqual(px(p.dpad.right))
    expect(box(down!)).toEqual(px(p.dpad.down))
  })

  it('nút Settings và bốn ô nhập vào đúng hộp của mình', () => {
    mount()
    const p = placement()
    bridge.placeControls(p)
    expect(box(settingsButton())).toEqual(px(p.settingsButton))
    expect(box(sfx())).toEqual(px(p.sfx))
    expect(box(checkboxes()[0]!)).toEqual(px(p.haptics))
    expect(box(checkboxes()[1]!)).toEqual(px(p.reducedMotion))
    expect(box(themeSelect())).toEqual(px(p.theme))
    for (const el of [settingsButton(), sfx(), ...checkboxes(), themeSelect()]) {
      expect(el.hasAttribute('data-placed')).toBe(true)
    }
  })

  it('nút dialog thứ i vào hộp thứ i', () => {
    open([en.keepPlaying, en.newGame])
    const rects = [rect(40, 300, 240, 48), rect(40, 240, 240, 48)]
    bridge.placeControls(placement({ dialogButtons: rects }))
    expect(dialogButtons().map(box)).toEqual(rects.map(px))
  })

  it('đặt lại với hộp mới thì nút đi theo (resize)', () => {
    mount()
    bridge.placeControls(placement())
    const moved = placement({ settingsButton: rect(596, 8, 44, 44) })
    bridge.placeControls(moved)
    expect(box(settingsButton())).toEqual(px(moved.settingsButton))
  })

  it('dialog mở lại với nút khác: nút mới chưa có chỗ cho tới lần đặt kế', () => {
    open([en.keepPlaying, en.newGame])
    bridge.placeControls(placement({ dialogButtons: [rect(40, 300), rect(40, 240)] }))
    open([en.retry])
    const [retry] = dialogButtons()
    expect(dialogButtons()).toHaveLength(1)
    expect(retry!.hasAttribute('data-placed')).toBe(false)
    const again = placement({ dialogButtons: [rect(40, 320, 240, 48)] })
    bridge.placeControls(again)
    expect(box(retry!)).toEqual(px(again.dialogButtons[0]!))
  })

  it('thiếu hộp cho một nút dialog thì GỠ chỗ nút đó, không giữ hộp cũ', () => {
    open([en.keepPlaying, en.newGame])
    bridge.placeControls(placement({ dialogButtons: [rect(40, 300), rect(40, 240)] }))
    bridge.placeControls(placement({ dialogButtons: [rect(40, 300)] }))
    const [first, second] = dialogButtons()
    expect(first!.hasAttribute('data-placed')).toBe(true)
    expect(second!.hasAttribute('data-placed')).toBe(false)
    expect(box(second!)).toEqual({ left: '', top: '', width: '', height: '' })
  })

  it('đặt chỗ KHÔNG đổi focus, tên, hay trạng thái inert/hidden', () => {
    mount()
    open([en.retry])
    const focused = document.activeElement
    bridge.setDpadVisible(false)
    bridge.placeControls(placement({ dialogButtons: [rect(40, 320, 240, 48)] }))
    expect(document.activeElement).toBe(focused)
    expect(dialogButtons()[0]!.textContent).toBe(en.retry)
    expect(controlsRoot().querySelector<HTMLElement>('.a11y-dpad')!.hidden).toBe(true)
    expect(settingsButton().hasAttribute('inert')).toBe(true)
    expect(settingsButton().textContent).toBe(en.settings)
  })

  it('không điều khiển nào bị aria-hidden hay hidden vì được đặt chỗ', () => {
    mount()
    bridge.placeControls(placement())
    for (const el of controlsRoot().querySelectorAll<HTMLElement>('.a11y-ctl')) {
      expect(el.getAttribute('aria-hidden')).toBeNull()
      expect(el.hidden).toBe(false)
    }
  })

  it('chưa mountControls hoặc đã destroy thì là no-op, không ném', () => {
    expect(() => bridge.placeControls(placement())).not.toThrow()
    mount()
    bridge.destroy()
    expect(() => bridge.placeControls(placement({ dialogButtons: [rect(0, 0)] }))).not.toThrow()
  })
})

describe('destroy', () => {
  it('gỡ hết nội dung, kể cả điều khiển và dialog', () => {
    bridge.syncBoard(b([Z, Z, Z, Z]))
    mount()
    open([en.retry])
    bridge.destroy()
    expect(bridge.root.querySelectorAll('[role="gridcell"]')).toHaveLength(0)
    expect(bridge.root.querySelectorAll('button, input, select')).toHaveLength(0)
  })

  it('sau destroy, Esc vẫn không bị chặn', () => {
    bridge.destroy()
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })
})
