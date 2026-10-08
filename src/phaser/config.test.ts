import { describe, expect, it, vi } from 'vitest'

/**
 * `phaser` không import được trong jsdom (bản ESM dò tính năng canvas ngay lúc
 * import), nên chỉ mock đủ để `config.ts` và hai scene của nó định nghĩa được.
 * Không test nào ở đây chạm tới engine — `buildConfig` là hàm THUẦN trả object.
 */
vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    Scale: { RESIZE: 'RESIZE', NO_CENTER: 'NO_CENTER' },
    Scene: class {},
    Geom: { Rectangle: class {} },
  },
}))

import { buildConfig } from './config'

describe('buildConfig — R36: không được giật focus của trang chủ nhà', () => {
  /**
   * §6: "MUST only use Playables SDK onPause and onResume". Phaser mặc định
   * `autoFocus: true`, và cờ đó gọi `window.focus()` ở HAI chỗ:
   *   - `core/VisibilityHandler.js`: lúc boot,
   *   - `input/mouse/MouseManager.js` + `input/touch/TouchManager.js`: ở MỖI
   *     lần mousedown/touchstart.
   * Trong iframe của YouTube, `window.focus()` là cướp focus khỏi trang chủ nhà.
   * Đây là lý do cờ phải là `false` — không phải chi tiết mỹ quan.
   */
  it('autoFocus phải là false', () => {
    expect(buildConfig(0).autoFocus).toBe(false)
  })

  it('không đặt lại autoFocus thành true ở nhánh nào khác', () => {
    // Hai theme khác nhau đi qua cùng một hàm dựng; cờ không được phụ thuộc màu.
    expect(buildConfig(0xffffff).autoFocus).toBe(false)
    expect(buildConfig(0x000000).autoFocus).toBe(false)
  })
})

describe('buildConfig — ràng buộc cứng của §B3', () => {
  it('dùng Scale.RESIZE, KHÔNG BAO GIỜ FIT', () => {
    const config = buildConfig(0x123456)
    expect(config.scale?.mode).toBe('RESIZE')
  })

  it('canvas gắn vào #game-container', () => {
    expect(buildConfig(0).parent).toBe('game-container')
  })

  it('màu nền truyền vào được dùng nguyên vẹn', () => {
    expect(buildConfig(0xabcdef).backgroundColor).toBe(0xabcdef)
  })
})
