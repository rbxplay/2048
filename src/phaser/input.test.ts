import { describe, expect, it, vi } from 'vitest'
import { attachKeyboardInput, dirFromKey, isEscapeKey, shouldIgnoreKey } from './input'

describe('dirFromKey', () => {
  it('phím mũi tên', () => {
    expect(dirFromKey('ArrowUp')).toBe('up')
    expect(dirFromKey('ArrowDown')).toBe('down')
    expect(dirFromKey('ArrowLeft')).toBe('left')
    expect(dirFromKey('ArrowRight')).toBe('right')
  })

  it('WASD, cả hoa lẫn thường', () => {
    expect(dirFromKey('w')).toBe('up')
    expect(dirFromKey('W')).toBe('up')
    expect(dirFromKey('a')).toBe('left')
    expect(dirFromKey('s')).toBe('down')
    expect(dirFromKey('d')).toBe('right')
  })

  it('phím khác ⇒ null', () => {
    expect(dirFromKey('q')).toBeNull()
    expect(dirFromKey('Escape')).toBeNull()
  })
})

describe('isEscapeKey', () => {
  it('nhận Escape', () => {
    expect(isEscapeKey('Escape')).toBe(true)
    expect(isEscapeKey('Esc')).toBe(true)
    expect(isEscapeKey('Enter')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// attachKeyboardInput
//
// Chạy trên một `scene` giả theo đúng cách của `views/views.test.ts`: thay vì
// bỏ qua engine, ta đưa vào đúng thứ mà hàm này chạm tới — một `keyboard` plugin
// đủ để giữ và gọi lại listener. Nhờ vậy hai quy tắc trái chiều của §A4/§A11
// (`Arrow*` PHẢI `preventDefault`, `Esc` KHÔNG được) kiểm được thật, chứ không
// chỉ kiểm được mấy hàm thuần.
// ---------------------------------------------------------------------------

type KeyEvent = { key: string; preventDefault: () => void; target: EventTarget | null }
type Handler = (ev: KeyEvent) => void

function makeScene() {
  const handlers: Handler[] = []
  const keyboard = {
    on: (_event: string, cb: Handler): void => {
      handlers.push(cb)
    },
    off: (_event: string, cb: Handler): void => {
      const i = handlers.indexOf(cb)
      if (i >= 0) handlers.splice(i, 1)
    },
  }
  return {
    scene: { input: { keyboard } } as unknown as Parameters<typeof attachKeyboardInput>[0],
    /** Bắn một phím, trả về event để kiểm `preventDefault` đã bị gọi hay chưa. */
    press(
      key: string,
      target: EventTarget | null = null,
    ): KeyEvent & { preventDefault: ReturnType<typeof vi.fn> } {
      const ev = { key, preventDefault: vi.fn(), target }
      for (const h of [...handlers]) h(ev)
      return ev
    },
    listeners: (): number => handlers.length,
    /** Scene chưa có bàn phím — đường `keyboard === null` của Phaser. */
    withoutKeyboard(): Parameters<typeof attachKeyboardInput>[0] {
      return { input: { keyboard: null } } as unknown as Parameters<typeof attachKeyboardInput>[0]
    },
  }
}

describe('attachKeyboardInput — phím mũi tên', () => {
  it('đẩy đúng Dir và CHẶN mặc định, nếu không trang cuộn theo', () => {
    const s = makeScene()
    const dirs: string[] = []
    attachKeyboardInput(s.scene, (d) => dirs.push(d), () => {})

    const ev = s.press('ArrowLeft')
    expect(dirs).toEqual(['left'])
    expect(ev.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('WASD đi cùng một đường với phím mũi tên', () => {
    const s = makeScene()
    const dirs: string[] = []
    attachKeyboardInput(s.scene, (d) => dirs.push(d), () => {})

    for (const k of ['w', 'a', 's', 'd']) s.press(k)
    expect(dirs).toEqual(['up', 'left', 'down', 'right'])
  })

  it('phím không map thì im lặng, không chặn mặc định', () => {
    const s = makeScene()
    const dirs: string[] = []
    let escapes = 0
    attachKeyboardInput(s.scene, (d) => dirs.push(d), () => escapes++)

    const ev = s.press('q')
    expect(dirs).toEqual([])
    expect(escapes).toBe(0)
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })
})

describe('attachKeyboardInput — Esc (§A11 MUST: không được preventDefault)', () => {
  it('phát onEscape và KHÔNG chặn mặc định', () => {
    const s = makeScene()
    const dirs: string[] = []
    let escapes = 0
    attachKeyboardInput(s.scene, (d) => dirs.push(d), () => escapes++)

    const ev = s.press('Escape')
    expect(escapes).toBe(1)
    expect(dirs).toEqual([])
    // Chặn ở đây sẽ nuốt luôn Esc của trình duyệt/YouTube — §A11 ghi MUST NOT.
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })
})

describe('shouldIgnoreKey — ô nhập DOM thật đang giữ focus', () => {
  it('nhận input/textarea/select, không phân biệt hoa thường', () => {
    expect(shouldIgnoreKey(document.createElement('input'))).toBe(true)
    expect(shouldIgnoreKey(document.createElement('textarea'))).toBe(true)
    expect(shouldIgnoreKey(document.createElement('select'))).toBe(true)
    expect(shouldIgnoreKey(document.createElement('INPUT'))).toBe(true)
  })

  it('phần tử thường và target rỗng thì KHÔNG bỏ qua', () => {
    expect(shouldIgnoreKey(document.createElement('div'))).toBe(false)
    expect(shouldIgnoreKey(document.createElement('button'))).toBe(false)
    expect(shouldIgnoreKey(document.body)).toBe(false)
    expect(shouldIgnoreKey(null)).toBe(false)
  })

  it('vùng contenteditable cũng là ô nhập', () => {
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // jsdom không suy ra `isContentEditable` từ thuộc tính, nên suy thẳng ở đây
    // cho đúng thứ trình duyệt thật trả về.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(shouldIgnoreKey(editable)).toBe(true)
  })
})

// R19 — §12.1:747 bắt slider SFX là `<input type="range">` DOM THẬT và §B8:435
// bắt nó "keyboard operable with arrow keys". KeyboardManager của Phaser gắn
// listener ở `window`, nên `preventDefault()` vô điều kiện sẽ huỷ luôn default
// action đổi giá trị của slider. Guard phải chạy TRƯỚC `preventDefault`.
describe('attachKeyboardInput — nhường phím cho ô nhập DOM (R19, §12.1/§B8)', () => {
  it('mũi tên khi focus ở <input>: KHÔNG chặn mặc định, KHÔNG phát Dir', () => {
    const s = makeScene()
    const dirs: string[] = []
    attachKeyboardInput(s.scene, (d) => dirs.push(d), () => {})

    const ev = s.press('ArrowRight', document.createElement('input'))
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(dirs).toEqual([])
  })

  it('mũi tên khi focus ở phần tử thường: VẪN chặn mặc định và phát Dir', () => {
    const s = makeScene()
    const dirs: string[] = []
    attachKeyboardInput(s.scene, (d) => dirs.push(d), () => {})

    const ev = s.press('ArrowRight', document.createElement('div'))
    expect(ev.preventDefault).toHaveBeenCalledTimes(1)
    expect(dirs).toEqual(['right'])
  })

  it('Esc vẫn phát dù focus đang ở <input> — đóng dialog bằng bàn phím luôn phải chạy', () => {
    const s = makeScene()
    let escapes = 0
    attachKeyboardInput(s.scene, () => {}, () => escapes++)

    const ev = s.press('Escape', document.createElement('input'))
    expect(escapes).toBe(1)
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })

  it('textarea và select cũng được nhường phím', () => {
    const s = makeScene()
    const dirs: string[] = []
    attachKeyboardInput(s.scene, (d) => dirs.push(d), () => {})

    for (const tag of ['textarea', 'select'] as const) {
      const ev = s.press('d', document.createElement(tag))
      expect(ev.preventDefault, tag).not.toHaveBeenCalled()
    }
    expect(dirs).toEqual([])
  })
})

describe('attachKeyboardInput — vòng đời', () => {
  it('hàm trả về gỡ được listener, không rò rỉ giữa các ván', () => {
    const s = makeScene()
    const dirs: string[] = []
    const detach = attachKeyboardInput(s.scene, (d) => dirs.push(d), () => {})
    expect(s.listeners()).toBe(1)

    detach()
    expect(s.listeners()).toBe(0)
    s.press('ArrowUp')
    expect(dirs).toEqual([])
  })

  it('scene không có bàn phím thì trả về hàm gỡ rỗng, không ném', () => {
    const s = makeScene()
    const scene = s.withoutKeyboard()
    const detach = attachKeyboardInput(scene, () => {}, () => {})
    expect(() => detach()).not.toThrow()
  })
})
