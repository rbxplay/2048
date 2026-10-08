import { describe, expect, it, vi } from 'vitest'
// `vi` của vitest đụng tên với export `vi` (chuỗi tiếng Việt) của i18n.
import { en, vi as viStrings } from '../../i18n'
import { computeLayout } from '../layout'
import { buttonLabels, dialogBodySize, dialogCardWidth, DIALOG_MAX_W } from './dialogs'
import { badgeLabel, hudCardHeight, hudCardWidth, hudLabelSize, hudNumberSize } from './hud'

/**
 * `phaser` KHÔNG import được trong jsdom: bản ESM của Phaser 4 dò tính năng
 * canvas ngay lúc import (`checkInverseAlpha` gọi `canvas.getContext('2d')`, mà
 * jsdom trả `null` khi thiếu gói `canvas` native), nên suite chết trước khi tới
 * test đầu tiên. Cùng cách xử như `phaser/boardScene.test.ts` (Task 10). Ở đây
 * chỉ kiểm các hàm THUẦN, không test nào chạm tới engine.
 */
vi.mock('phaser', () => ({ default: { Scene: class {} } }))

describe('badgeLabel', () => {
  it('có dấu + và phân cách hàng nghìn', () => {
    expect(badgeLabel(8, 'en')).toBe('+8')
    expect(badgeLabel(1024, 'en')).toBe('+1,024')
  })

  it('0 vẫn ra +0, để nơi gọi tự quyết định có hiện hay không', () => {
    expect(badgeLabel(0, 'en')).toBe('+0')
  })
})

describe('hudCardWidth', () => {
  it('hai thẻ chia đôi bề ngang board, trừ khe', () => {
    expect(hudCardWidth(400, 8)).toBe((400 - 8) / 2)
  })

  it('không bao giờ âm', () => {
    expect(hudCardWidth(4, 8)).toBeGreaterThanOrEqual(0)
  })
})

/**
 * §B2 — ba `clamp` của thang chữ. Kiểm cả sàn, trần và đoạn bám `vmin`, vì
 * hỏng một trong ba là HUD hoặc quá nhỏ ở máy nhỏ, hoặc không lớn lên ở tablet.
 */
describe('cỡ chữ HUD theo §B2', () => {
  it('số điểm/kỷ lục: clamp(18px, 4.5vmin, 30px)', () => {
    expect(hudNumberSize(computeLayout(320, 568))).toBe(18) // sàn
    expect(hudNumberSize(computeLayout(600, 600))).toBeCloseTo(27) // 4.5% của 600
    expect(hudNumberSize(computeLayout(1440, 900))).toBe(30) // trần
  })

  it('nhãn: clamp(11px, 2.4vmin, 14px)', () => {
    expect(hudLabelSize(computeLayout(320, 568))).toBe(11) // sàn tuyệt đối §B2
    expect(hudLabelSize(computeLayout(500, 500))).toBeCloseTo(12)
    expect(hudLabelSize(computeLayout(1440, 900))).toBe(14) // trần
  })

  it('theo cạnh NGẮN, không phải cạnh dài — vmin chứ không phải vw', () => {
    // Cùng bề ngang 1200, cao 400 ⇒ vmin = 400 ⇒ nhãn dính sàn 11 chứ không 14.
    expect(hudLabelSize(computeLayout(1200, 400))).toBe(11)
  })

  it('viewport không hợp lệ vẫn ra số dùng được', () => {
    expect(hudNumberSize(computeLayout(Number.NaN, Number.NaN))).toBe(18)
  })
})

describe('hudCardHeight — bất biến §B3 `boardY >= hudY + hudHeight`', () => {
  it('ở cỡ nhỏ nhất giữ nguyên 40 px như hình học gốc', () => {
    expect(hudCardHeight(computeLayout(320, 568))).toBe(40)
  })

  it('cao lên theo cỡ chữ §B2 để số không thò ra ngoài mặt thẻ', () => {
    const l = computeLayout(1440, 900)
    expect(hudNumberSize(l)).toBe(30)
    expect(hudCardHeight(l)).toBeGreaterThanOrEqual(4 + hudLabelSize(l) + 1 + 30 + 4)
  })

  it('luôn nằm gọn trong hàng HUD, ở mọi viewport thử được', () => {
    for (let w = 280; w <= 1600; w += 37) {
      for (let h = 280; h <= 1200; h += 53) {
        const l = computeLayout(w, h)
        const hudHeight = l.boardY - l.hudY
        expect(hudCardHeight(l), `thẻ ${w}×${h}`).toBeLessThanOrEqual(hudHeight)
      }
    }
  })
})

describe('cỡ chữ dialog theo §B2', () => {
  it('thân dialog: clamp(14px, 3.2vmin, 18px)', () => {
    expect(dialogBodySize(computeLayout(320, 568))).toBe(14) // sàn
    expect(dialogBodySize(computeLayout(500, 500))).toBeCloseTo(16)
    expect(dialogBodySize(computeLayout(1440, 900))).toBe(18) // trần
  })
})

describe('dialogCardWidth — §B8 `min(88vw, 420px)`', () => {
  it('dưới ngưỡng thì bám 88% bề ngang', () => {
    expect(dialogCardWidth(320)).toBeCloseTo(281.6)
  })

  it('trên ngưỡng thì dừng ở trần 420', () => {
    expect(dialogCardWidth(1000)).toBe(DIALOG_MAX_W)
    expect(DIALOG_MAX_W).toBe(420)
  })

  it('không bao giờ âm', () => {
    expect(dialogCardWidth(0)).toBe(0)
  })
})

describe('buttonLabels — §B8 "1–2 buttons", §B2 "MUST NOT thêm nút"', () => {
  it('win: chơi tiếp rồi ván mới, đúng thứ tự', () => {
    expect(buttonLabels('win', en)).toEqual(['Keep playing', 'New game'])
  })

  it('gameover: chỉ một nút chơi lại — không có nút thoát nào', () => {
    expect(buttonLabels('gameover', en)).toEqual(['Retry'])
  })

  it('lấy nhãn từ chuỗi của locale, không viết cứng', () => {
    expect(buttonLabels('gameover', viStrings)).toEqual(['Chơi lại'])
    expect(buttonLabels('win', viStrings)).toEqual(['Chơi tiếp', 'Ván mới'])
  })
})
