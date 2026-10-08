import { describe, expect, it, vi } from 'vitest'
import { attachKeyboardInput, dirFromKey, isEscapeKey } from './input'

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

type KeyEvent = { key: string; preventDefault: () => void }
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
    press(key: string): KeyEvent & { preventDefault: ReturnType<typeof vi.fn> } {
      const ev = { key, preventDefault: vi.fn() }
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
