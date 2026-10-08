import type { GamePlatform } from './types'
import { isPlayablesEnv, YouTubePlatform } from './youtube'

export type PlatformKind = 'youtube' | 'mock'

/**
 * Hàm THUẦN quyết định dùng adapter nào. Tách ra để test được nhánh production
 * mà không cần stub `import.meta.env`.
 *
 * Thứ tự ưu tiên: Playables trước (đang chạy trong YouTube thì đó là môi
 * trường thật), rồi mới tới mock chỉ trong dev.
 *
 * Nhánh cuối trả `youtube` chứ KHÔNG trả `mock`: ngoài Playables mà ở
 * production nghĩa là SDK vắng mặt, và `YouTubePlatform` khi đó là một chuỗi
 * no-op an toàn. Trả mock ở đây chính là lỗi §5a.
 */
export function choosePlatformKind(opts: { inPlayables: boolean; isDev: boolean }): PlatformKind {
  if (opts.inPlayables) return 'youtube'
  return opts.isDev ? 'mock' : 'youtube'
}

/**
 * Chọn implementation nền tảng lúc boot. KHÔNG BAO GIỜ throw — luôn trả về một
 * platform dùng được.
 *
 * `import.meta.env.DEV` phải nằm trong CHÍNH điều kiện `if`, và `import('./mock')`
 * phải nằm trong nhánh đó.
 *
 * Vì sao: Vite thay `import.meta.env.DEV` bằng literal `false`. Chỉ khi ấy
 * Rollup mới thấy nhánh dưới là code chết và xoá **cả** lời gọi `import('./mock')`
 * — nhờ đó chunk `mock.ts` không bao giờ được sinh ra. Cách viết cũ (đưa cờ vào
 * hàm thuần `choosePlatformKind` rồi kiểm tra kết quả trả về) trông tương đương
 * nhưng Rollup chỉ thấy một lời gọi hàm, không gói được thành hằng số, nên nhánh
 * sống sót và `mock.ts` lọt vào bundle production — đúng lỗi §5a mà
 * `check-bundle.mjs` bắt được (sentinel `SPAWNED_BY_DEV_MOCK_ONLY`).
 */
export async function selectPlatform(): Promise<GamePlatform> {
  try {
    if (import.meta.env.DEV) {
      const kind = choosePlatformKind({ inPlayables: isPlayablesEnv(), isDev: true })
      if (kind === 'mock') {
        const { MockPlatform } = await import('./mock')
        return new MockPlatform()
      }
    }
    return new YouTubePlatform()
  } catch (e) {
    console.error('[select] không chọn được nền tảng, dùng youtube no-op:', e)
    return new YouTubePlatform()
  }
}
