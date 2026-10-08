import type Phaser from 'phaser'
import type { Dir } from '../game/rules'

/**
 * Bàn phím: dịch phím thành `Dir`, và nối vào cùng một đường input với cú vuốt.
 *
 * KHÔNG có hàng đợi và cũng không có cổng chặn theo hoạt ảnh ở đây — đó là chủ
 * ý, không phải thiếu sót. Spec §7: logic áp dụng NGAY, tween chạy sau và chỉ
 * ĐỌC `outcome`, nên không có gì để nuốt; rủi ro R7 (một cú vuốt bị nuốt im
 * lặng) biến mất theo cấu trúc. Thêm một cổng chặn ở tầng này sẽ dựng lại đúng
 * thứ vừa bị loại bỏ, và còn làm nhịp chơi khác nhau giữa bản thường và bản
 * giảm chuyển động — §B5 và A11Y-06 đều cấm điều đó.
 */

/** Bảng phím → hướng. Khoá là chữ THƯỜNG để `W` và `w` cùng một cửa. */
const KEY_DIRS: Record<string, Dir> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
}

export function dirFromKey(key: string): Dir | null {
  return KEY_DIRS[key.toLowerCase()] ?? null
}

/**
 * §A4, A11Y-04: `Esc` đóng dialog đang mở.
 *
 * Nhận cả `'Esc'` vì đó là `key` của một số trình duyệt và của các bản engine cũ
 * hơn; chỉ nhận `'Escape'` là bỏ sót phím trên đúng những máy đang chạy game.
 */
export function isEscapeKey(key: string): boolean {
  return key === 'Escape' || key === 'Esc'
}

/** Thẻ mà bàn phím thuộc về CHÍNH NÓ, không thuộc về game. */
const FORM_TAGS = new Set(['input', 'textarea', 'select'])

/**
 * Có phải phím đang gõ vào một ô nhập DOM thật không (R19).
 *
 * §12.1:747 bắt slider SFX là `<input type="range">` DOM thật, và §B8:435 bắt nó
 * "keyboard operable with arrow keys". `KeyboardManager` của Phaser gắn listener
 * ở `window`, nên nếu ta `preventDefault()` vô điều kiện thì default action đổi
 * giá trị của slider bị huỷ và người chơi không kéo được SFX bằng bàn phím.
 *
 * Suy theo `tagName`/`isContentEditable` chứ không `instanceof HTMLElement`:
 * hàm này chỉ cần đúng hình dạng đó, và như vậy nó thuần, không phụ thuộc lớp
 * DOM cụ thể của môi trường.
 */
export function shouldIgnoreKey(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false
  const el = target as { tagName?: unknown; isContentEditable?: unknown }
  const tag = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : ''
  return FORM_TAGS.has(tag) || el.isContentEditable === true
}

/**
 * Nối bàn phím của Phaser vào cùng một đường input với canvas swipe (§12.3).
 *
 * Hai quy tắc trái chiều, cả hai đều bắt buộc:
 *  - Phím mũi tên PHẢI chặn mặc định, nếu không trang cuộn theo cú bấm.
 *  - `Esc` KHÔNG được chặn — §A11 và §B8 ghi MUST NOT. Chặn ở đây sẽ nuốt luôn
 *    `Esc` của trình duyệt và của vỏ YouTube.
 *
 * Trả về hàm gỡ listener để scene gỡ được lúc `shutdown`.
 */
export function attachKeyboardInput(
  scene: Phaser.Scene,
  onDir: (dir: Dir) => void,
  onEscape: () => void,
): () => void {
  const kb = scene.input.keyboard
  if (kb === null) return () => {}

  const handler = (ev: KeyboardEvent): void => {
    // `Esc` xét TRƯỚC guard: đóng dialog bằng bàn phím phải chạy được cả khi
    // focus đang nằm trong một ô nhập (§A11, A11Y-04). Và `Esc` không bao giờ
    // `preventDefault()` — §B8 ghi MUST NOT.
    if (isEscapeKey(ev.key)) {
      onEscape()
      return
    }
    // Ô nhập DOM thật đang giữ focus thì nhường phím cho nó: cả `preventDefault()`
    // lẫn `onDir` đều phải im, vì chặn default action là huỷ luôn việc đổi giá
    // trị của slider (R19). Guard đặt TRƯỚC `preventDefault`, không phải sau —
    // chặn ở `onDir` là quá muộn, default action đã bị huỷ xong.
    if (shouldIgnoreKey(ev.target)) return
    const dir = dirFromKey(ev.key)
    if (dir === null) return
    ev.preventDefault()
    onDir(dir)
  }

  kb.on('keydown', handler)
  return () => kb.off('keydown', handler)
}
