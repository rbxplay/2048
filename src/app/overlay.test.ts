import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createA11yBridge, type A11yBridge } from '../a11y/bridge'
import { en } from '../i18n'
import {
  buttonActions,
  buttonLabels,
  type DialogAction,
  type DialogKind,
} from '../phaser/views/dialogs'
import {
  createOverlayPresenter,
  dialogHeading,
  dialogKindFor,
  overlayForStatus,
} from './overlay'

/**
 * `views/dialogs.ts` nhập Phaser, mà Phaser dò thiết bị bằng canvas 2D ngay lúc
 * import nên không boot nổi trong jsdom. Tệp này chỉ đọc BẢNG nhãn/action của
 * tệp đó (hai hàm thuần), không dựng hình vẽ nào, nên mock rỗng là đủ.
 */
vi.mock('phaser', () => ({ default: {} }))

/** Lớp canvas giả: chỉ ghi lại đúng những gì tầng này cần. */
function fakeDialogs() {
  let open: DialogKind | null = null
  return {
    open(kind: DialogKind): void {
      open = kind
    },
    close(): void {
      open = null
    },
    get isOpen(): boolean {
      return open !== null
    },
  }
}

let bridge: A11yBridge
let dialogs: ReturnType<typeof fakeDialogs>
let actions: DialogAction[]
let opened: number

beforeEach(() => {
  document.body.innerHTML = ''
  actions = []
  opened = 0
  bridge = createA11yBridge()
  bridge.setStrings(en)
  document.body.appendChild(bridge.root)
  dialogs = fakeDialogs()
})

afterEach(() => {
  bridge.destroy()
})

function presenter() {
  return createOverlayPresenter({
    dialogs,
    bridge,
    getStrings: () => en,
    getInfo: () => ({ score: 128, best: 512 }),
    onAction: (action) => {
      opened += 1
      actions.push(action)
    },
  })
}

const dialogEl = () => bridge.root.querySelector<HTMLElement>('[role="dialog"]')
const domButtons = () =>
  Array.from(bridge.root.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
const assertive = () => bridge.root.querySelector('[aria-live="assertive"]')!

describe('overlayForStatus — suy overlay từ status của state', () => {
  it("'won' → WIN", () => {
    expect(overlayForStatus('won')).toBe('win')
  })

  it("'over' → GAME OVER", () => {
    expect(overlayForStatus('over')).toBe('over')
  })

  it("'playing' → không overlay", () => {
    expect(overlayForStatus('playing')).toBeNull()
  })
})

describe('ánh xạ sang dialog của canvas', () => {
  it('WIN giữ nguyên tên, over → gameover', () => {
    expect(dialogKindFor('win')).toBe('win')
    expect(dialogKindFor('over')).toBe('gameover')
  })

  it('tiêu đề lấy đúng khoá i18n của canvas', () => {
    expect(dialogHeading('win', en)).toBe(en.winTitle)
    expect(dialogHeading('gameover', en)).toBe(en.gameOverTitle)
  })
})

describe('nhãn nút gửi cho openDialog khớp buttonLabels của canvas (R25)', () => {
  it('WIN', () => {
    const spy = vi.spyOn(bridge, 'openDialog')
    presenter().open('win')
    const opts = spy.mock.calls[0]?.[0]
    expect(opts?.labels).toEqual(buttonLabels('win', en))
    // Không được là một danh sách chép tay: nó phải là chính đầu ra của canvas.
    expect(opts?.labels).toEqual([en.keepPlaying, en.newGame])
  })

  it('GAME OVER', () => {
    const spy = vi.spyOn(bridge, 'openDialog')
    presenter().open('over')
    const opts = spy.mock.calls[0]?.[0]
    expect(opts?.labels).toEqual(buttonLabels('gameover', en))
    expect(opts?.labels).toEqual([en.retry])
  })

  it('nút thật trong DOM đọc ra đúng nhãn canvas vẽ', () => {
    presenter().open('win')
    expect(domButtons().map((b) => b.textContent)).toEqual(buttonLabels('win', en))
  })

  it('nhãn nút dài nhất vẫn ≤ 28 ký tự (§B9)', () => {
    for (const kind of ['win', 'gameover'] as DialogKind[]) {
      for (const label of buttonLabels(kind, en)) expect(label.length).toBeLessThanOrEqual(28)
    }
  })
})

describe('chỉ số nút → action khớp bảng của canvas', () => {
  it('WIN: nút 0 là keep-playing, nút 1 là new-game', () => {
    presenter().open('win')
    const buttons = domButtons()
    expect(buttons).toHaveLength(buttonActions('win').length)
    buttons[0]!.click()
    buttons[1]!.click()
    expect(actions).toEqual(buttonActions('win'))
  })

  it('GAME OVER: nút 0 là retry', () => {
    presenter().open('over')
    domButtons()[0]!.click()
    expect(actions).toEqual(buttonActions('gameover'))
  })
})

describe('canvas và DOM mở/đóng CÙNG NHAU (Review Focus mục 1)', () => {
  it('mở thì cả hai cùng mở', () => {
    const p = presenter()
    expect(p.isOpen).toBe(false)
    expect(dialogs.isOpen).toBe(false)
    expect(dialogEl()).toBeNull()

    p.open('over')

    expect(p.isOpen).toBe(true)
    expect(dialogs.isOpen).toBe(true)
    expect(dialogEl()).not.toBeNull()
  })

  it('đóng thì cả hai cùng đóng', () => {
    const p = presenter()
    p.open('win')
    p.close()
    expect(p.isOpen).toBe(false)
    expect(dialogs.isOpen).toBe(false)
    expect(dialogEl()).toBeNull()
  })

  it('đóng hai lần liên tiếp không ném và vẫn đóng cả hai', () => {
    const p = presenter()
    p.open('over')
    p.close()
    expect(() => p.close()).not.toThrow()
    expect(dialogs.isOpen).toBe(false)
    expect(dialogEl()).toBeNull()
  })

  it('mở ván này rồi mở ván khác không để lại hai dialog', () => {
    const p = presenter()
    p.open('win')
    p.open('over')
    expect(bridge.root.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(domButtons().map((b) => b.textContent)).toEqual(buttonLabels('gameover', en))
  })
})

describe('công bố kết quả và tầng nền bị khoá', () => {
  it('công bố đúng kết cục', () => {
    presenter().open('win')
    expect(assertive().textContent).toBe(en.winTitle)
  })

  it('đóng thì xoá vùng công bố', () => {
    const p = presenter()
    p.open('over')
    p.close()
    expect(assertive().textContent).toBe('')
  })

  it('mở thì nền bị inert, đóng thì gỡ', () => {
    const p = presenter()
    p.open('win')
    const boardRoot = bridge.root.querySelector<HTMLElement>('.a11y-root-board')!
    expect(boardRoot.hasAttribute('inert')).toBe(true)
    p.close()
    expect(boardRoot.hasAttribute('inert')).toBe(false)
  })
})
