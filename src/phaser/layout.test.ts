import { describe, expect, it } from 'vitest'
import { computeLayout, type Layout } from './layout'

/** Chiều cao HUD theo §B3:144 `clamp(48px, 9vmin, 72px)` — 9vmin = 0.09 × cạnh NGẮN. */
const hudHeightOf = (l: Layout) => Math.min(72, Math.max(48, 0.09 * Math.min(l.width, l.height)))
/** Chiều cao khối D-pad, cùng hằng số `DPAD_BLOCK` trong `layout.ts`. */
const DPAD_BLOCK = 160

describe('computeLayout — công thức §B3', () => {
  it('gap là 3% cạnh board', () => {
    const l = computeLayout(400, 800)
    expect(l.gap).toBe(Math.round(l.boardSide * 0.03))
  })

  it('cell = (boardSide − 5×gap) / 4', () => {
    const l = computeLayout(400, 800)
    expect(l.cell).toBeCloseTo((l.boardSide - 5 * l.gap) / 4, 6)
  })

  it('board luôn vuông', () => {
    for (const [w, h] of [[320, 568], [768, 1024], [1920, 1080], [500, 900]]) {
      const l = computeLayout(w!, h!)
      expect(l.boardSide).toBeGreaterThan(0)
      // 4 ô + 5 khe phải vừa đúng cạnh board
      expect(4 * l.cell + 5 * l.gap).toBeCloseTo(l.boardSide, 4)
    }
  })
})

describe('computeLayout — ràng buộc kích thước §B3', () => {
  it('không nhỏ hơn 280 px dù viewport bé', () => {
    expect(computeLayout(320, 568).boardSide).toBeGreaterThanOrEqual(280)
  })

  it('không lớn hơn 560 px dù viewport rất lớn', () => {
    expect(computeLayout(1920, 1080).boardSide).toBeLessThanOrEqual(560)
  })

  it('board vừa trong bề ngang khả dụng', () => {
    for (const w of [320, 375, 768, 1024]) {
      const l = computeLayout(w, 900)
      expect(l.boardX).toBeGreaterThanOrEqual(0)
      expect(l.boardX + l.boardSide).toBeLessThanOrEqual(w + 0.001)
    }
  })

  it('board căn giữa theo bề ngang', () => {
    const l = computeLayout(800, 900)
    expect(l.boardX + l.boardSide / 2).toBeCloseTo(400, 1)
  })
})

describe('computeLayout — cực đoan không làm vỡ', () => {
  it('viewport 0 vẫn trả số hữu hạn', () => {
    const l = computeLayout(0, 0)
    for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true)
  })

  it('viewport cực lớn vẫn hữu hạn', () => {
    const l = computeLayout(100_000, 100_000)
    for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true)
    expect(l.boardSide).toBeLessThanOrEqual(560)
  })

  it('viewport thấp và rộng (landscape) vẫn giữ board vừa chiều cao', () => {
    const l = computeLayout(1920, 400)
    expect(l.boardSide).toBeLessThanOrEqual(400)
  })
})

describe('computeLayout — bất biến bố cục (Important #4)', () => {
  // Trước đây D-pad đè lên board 26 px ở 800×900, 45.6 px ở 320×568, 124 px ở
  // 1920×400: hàm giữ chỗ D-pad khi tính KÍCH THƯỚC nhưng quên nó khi ĐỊNH VỊ.
  const VIEWPORTS: Array<[number, number]> = [
    [320, 568],
    [375, 667],
    [800, 900],
    [1024, 768],
  ]

  it.each(VIEWPORTS)('%i×%i: D-pad không đè board, HUD không đè board', (w, h) => {
    const l = computeLayout(w, h)
    expect(l.dpadY, 'dpadY >= boardY + boardSide').toBeGreaterThanOrEqual(l.boardY + l.boardSide)
    expect(l.boardY, 'boardY >= hudY + hudHeight')
      .toBeGreaterThanOrEqual(l.hudY + hudHeightOf(l))
    expect(l.hudY).toBeGreaterThanOrEqual(0)
  })

  it('boardSide đạt trần 560 khi viewport đủ chỗ (768×1024 và 800×900)', () => {
    expect(computeLayout(768, 1024).boardSide).toBe(560)
    expect(computeLayout(800, 900).boardSide).toBe(560)
  })

  it('boardSide theo 92vmin của §B3:139 khi chỗ đứng không phải giới hạn', () => {
    // 320×568: 0.92 × 320 = 294.4 — không phải 280 như bản cũ.
    expect(computeLayout(320, 568).boardSide).toBeCloseTo(294.4, 6)
  })

  it('bất biến giữ với MỌI đầu vào hữu hạn, kể cả cực đoan', () => {
    const sizes = [0, -1, 1, 40, 100, 200, 280, 320, 375, 400, 568, 667, 768, 900, 1024, 5000, 100_000]
    for (const w of sizes) {
      for (const h of sizes) {
        const l = computeLayout(w, h)
        const at = `${w}×${h}`
        for (const v of Object.values(l)) expect(Number.isFinite(v), at).toBe(true)
        // Sàn 280 là TUYỆT ĐỐI (R8): cận trên co lại được, sàn thì không.
        expect(l.boardSide, at).toBeGreaterThanOrEqual(280)
        expect(l.boardSide, at).toBeLessThanOrEqual(560)
        expect(l.hudY, at).toBeGreaterThanOrEqual(0)
        expect(l.dpadY, `${at}: dpadY >= boardY + boardSide`)
          .toBeGreaterThanOrEqual(l.boardY + l.boardSide)
        expect(l.boardY, `${at}: boardY >= hudY + hudHeight`)
          .toBeGreaterThanOrEqual(l.hudY + hudHeightOf(l))
      }
    }
  })

  it('đầu vào không hữu hạn vẫn cho kết quả hữu hạn và giữ bất biến', () => {
    for (const [w, h] of [[Number.NaN, Number.NaN], [Number.POSITIVE_INFINITY, 0], [-100, -5]]) {
      const l = computeLayout(w!, h!)
      for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true)
      expect(l.dpadY).toBeGreaterThanOrEqual(l.boardY + l.boardSide)
      expect(l.boardY).toBeGreaterThanOrEqual(l.hudY + hudHeightOf(l))
    }
  })

  // Lọt hẳn trong màn (kể cả `dpadY + DPAD_BLOCK <= h`) — CHỈ ba viewport dọc,
  // vì đó là mục tiêu thật của game.
  //
  // KHÔNG assert điều này ở 1024×768 và 1920×400, và đây là lý do — để người
  // sau không "sửa" nhầm:
  //   · 1024×768 — cận trên theo chỗ đứng thật làm D-pad dán ĐÚNG đáy
  //     (`dpadY + 160 = 768`), vừa khít không dư một px; đổi 1 px ở bất kỳ đâu
  //     là đỏ, nên nó không phải một ràng buộc có nghĩa.
  //   · 1920×400 — SÀN 280 THẮNG (`h − hudHeight − D-pad − đệm = 176 < 280`),
  //     nên D-pad BUỘC phải tràn đáy. Đó là hành vi ĐÚNG, không phải nợ kỹ
  //     thuật: §B3:154 xử viewport chật bằng "compact HUD, D-pad only" chứ
  //     không bằng cách thu nhỏ bàn cờ, và sàn 280 tồn tại để giữ cỡ ô với cỡ
  //     chữ đọc được. Bất biến thật sự phải giữ ở đây là "D-pad không ĐÈ board".
  it.each([
    [320, 568],
    [375, 667],
    [800, 900],
  ])('%i×%i: D-pad lọt hẳn trong màn', (w, h) => {
    const l = computeLayout(w!, h!)
    expect(l.dpadY + DPAD_BLOCK).toBeLessThanOrEqual(h!)
  })

  it('1920×400: sàn 280 thắng nên D-pad tràn đáy, nhưng không đè board', () => {
    const l = computeLayout(1920, 400)
    expect(l.boardSide).toBe(280) // sàn §B3 TUYỆT ĐỐI, không hạ theo chỗ đứng
    expect(l.dpadY).toBeGreaterThanOrEqual(l.boardY + l.boardSide)
    expect(l.dpadY + DPAD_BLOCK).toBeGreaterThan(400) // tràn đáy — chấp nhận được
  })
})

describe('computeLayout — hudHeight theo §B3:144 (R7)', () => {
  // `hudHeight` không nằm trong `Layout` (giữ đúng interface của plan), nhưng
  // QUAN SÁT ĐƯỢC: `boardY − hudY` chính là nó.
  const hudHeightAt = (w: number, h: number) => {
    const l = computeLayout(w, h)
    return l.boardY - l.hudY
  }

  it.each([
    [1920, 400, 48], // 9vmin = 36 → sàn
    [375, 667, 48], // 9vmin = 33.75 → sàn
    [800, 900, 72], // 9vmin = 72 → trần
    [768, 1024, 69.12], // 9vmin = 69.12, không chạm trần
  ])('%i×%i: hudHeight = %d', (w, h, expected) => {
    expect(hudHeightAt(w!, h!)).toBeCloseTo(expected!, 6)
  })

  it('9vmin lấy cạnh NGẮN, không phải chiều cao', () => {
    // Nếu quay lại `h * 0.09` thì 375×667 ra 60.03 (không phải 48) và 1920×400
    // ra 36 → sàn 48; ca 375×667 là ca bắt được lỗi.
    expect(hudHeightAt(375, 667)).toBeCloseTo(48, 6)
    expect(hudHeightAt(375, 667)).not.toBeCloseTo(667 * 0.09, 1)
  })
})
