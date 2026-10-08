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
import { createA11yBridge, gridLabels, type A11yBridge } from './bridge'

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

describe('tầng a11y ẩn khỏi mắt nhưng còn trong cây accessibility', () => {
  it('root không bị aria-hidden', () => {
    expect(bridge.root.getAttribute('aria-hidden')).not.toBe('true')
  })

  it('CSS dùng clip-path chứ KHÔNG display:none (display:none gỡ khỏi cây a11y)', () => {
    const css = readFileSync('src/a11y/bridge.css', 'utf8')
    expect(css).toContain('clip-path')
    expect(css).not.toContain('display: none')
    expect(css).not.toContain('visibility: hidden')
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
})

describe('openDialog — nút thật cho bàn phím và screen reader', () => {
  it('phơi nút với nhãn đã cho', () => {
    bridge.openDialog([en.keepPlaying, en.newGame], () => {})
    const buttons = Array.from(bridge.root.querySelectorAll('button'))
    expect(buttons.map((b) => b.textContent)).toEqual([en.keepPlaying, en.newGame])
  })

  it('nút là <button> thật, không phải div', () => {
    bridge.openDialog([en.retry], () => {})
    expect(bridge.root.querySelector('button')!.tagName).toBe('BUTTON')
  })

  it('bấm nút phát chỉ số của nó', () => {
    const onActivate = vi.fn()
    bridge.openDialog([en.keepPlaying, en.newGame], onActivate)
    Array.from(bridge.root.querySelectorAll('button'))[1]!.click()
    expect(onActivate).toHaveBeenCalledWith(1)
  })

  it('mở dialog thì focus vào nút đầu', () => {
    bridge.openDialog([en.keepPlaying, en.newGame], () => {})
    expect(document.activeElement).toBe(bridge.root.querySelector('button'))
  })

  it('đóng dialog thì gỡ nút khỏi DOM', () => {
    bridge.openDialog([en.retry], () => {})
    bridge.closeDialog()
    expect(bridge.root.querySelectorAll('button')).toHaveLength(0)
  })

  it('mở dialog mới thì dialog cũ được thay, không chồng', () => {
    bridge.openDialog([en.retry], () => {})
    bridge.openDialog([en.keepPlaying], () => {})
    expect(bridge.root.querySelectorAll('button')).toHaveLength(1)
  })

  it('Esc đóng dialog và KHÔNG preventDefault', () => {
    bridge.openDialog([en.retry], () => {})
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(ev)
    expect(bridge.root.querySelectorAll('button')).toHaveLength(0)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('Esc khi không có dialog là no-op', () => {
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    expect(() => document.dispatchEvent(ev)).not.toThrow()
  })
})

describe('destroy', () => {
  it('gỡ hết nội dung và gỡ listener', () => {
    bridge.syncBoard(b([Z, Z, Z, Z]))
    bridge.destroy()
    expect(bridge.root.querySelectorAll('[role="gridcell"]')).toHaveLength(0)
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    ).not.toThrow()
  })
})
