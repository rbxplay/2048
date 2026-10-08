import { describe, expect, it, vi } from 'vitest'
import { HAIRLINE_DARK_ALPHA, HAIRLINE_LIGHT_ALPHA } from '../theme/palette'
import { resolveSwipe, tileStroke } from './scenes/Board'
import { buildTheme } from './theme'

/**
 * `phaser` KHÔNG import được trong jsdom: bản ESM của Phaser 4 dò tính năng
 * canvas ngay lúc import (`checkInverseAlpha` gọi `canvas.getContext('2d')`, mà
 * jsdom trả `null` khi thiếu gói `canvas` native), nên suite chết trước khi tới
 * test đầu tiên — đã đo bằng một probe tạm. Ở đây chỉ cần `Phaser.Scene` để lớp
 * `BoardScene` định nghĩa được; không test nào chạm tới engine, và các hàm được
 * kiểm là hàm THUẦN đúng như brief yêu cầu ("xuất ra để test không cần scene").
 */
vi.mock('phaser', () => ({ default: { Scene: class {} } }))

describe('resolveSwipe — ngưỡng §A4', () => {
  const MIN = 24

  it('dưới ngưỡng ⇒ null', () => {
    expect(resolveSwipe(10, 5, MIN)).toBeNull()
  })

  it('ngang trội ⇒ trái/phải', () => {
    expect(resolveSwipe(60, 5, MIN)).toBe('right')
    expect(resolveSwipe(-60, 5, MIN)).toBe('left')
  })

  it('dọc trội ⇒ lên/xuống', () => {
    expect(resolveSwipe(5, 60, MIN)).toBe('down')
    expect(resolveSwipe(5, -60, MIN)).toBe('up')
  })

  it('chéo mơ hồ (tỉ lệ < 1.2) ⇒ null, không đoán bừa', () => {
    expect(resolveSwipe(50, 50, MIN)).toBeNull()
  })

  it('đúng ranh giới 1.2 thì nhận trục trội', () => {
    expect(resolveSwipe(60, 50, MIN)).toBe('right')
  })

  it('NaN ⇒ null', () => {
    expect(resolveSwipe(Number.NaN, 50, MIN)).toBeNull()
  })
})

describe('tileStroke — §B4:162-163 và §B1.5', () => {
  it('theme sáng: 1px, alpha theo bậc numeral', () => {
    const t = buildTheme('light')
    expect(tileStroke(t, 2)).toEqual({
      width: 1,
      color: t.tileHairline(2),
      alpha: HAIRLINE_LIGHT_ALPHA,
    })
    expect(tileStroke(t, 2048)).toEqual({
      width: 1,
      color: t.tileHairline(2048),
      alpha: HAIRLINE_DARK_ALPHA,
    })
  })

  it('ranh giới bậc nằm đúng ở 64', () => {
    const t = buildTheme('light')
    expect(tileStroke(t, 32).alpha).toBe(HAIRLINE_LIGHT_ALPHA)
    expect(tileStroke(t, 64).alpha).toBe(HAIRLINE_DARK_ALPHA)
  })

  it('theme tối giữ 1px và hai bậc alpha', () => {
    const t = buildTheme('dark')
    expect(tileStroke(t, 2).width).toBe(1)
    expect(tileStroke(t, 8192).alpha).toBe(HAIRLINE_DARK_ALPHA)
  })

  it('theme tương phản cao: viền đen đặc 2px ở MỌI bậc (§B1.5)', () => {
    const c = buildTheme('contrast')
    for (const v of [2, 4, 32, 64, 2048, 8192, 16384]) {
      expect(tileStroke(c, v), `tile ${v}`).toEqual({ width: 2, color: 0x000000, alpha: 1 })
    }
  })
})
