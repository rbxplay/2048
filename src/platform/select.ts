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
 * `import('./mock')` là import ĐỘNG có chủ đích. Vite thay `import.meta.env.DEV`
 * bằng `false` lúc build production, nên cả nhánh lẫn chunk `mock.ts` bị loại
 * hoàn toàn khỏi bundle — đó là cơ chế bảo đảm §5a.
 */
export async function selectPlatform(): Promise<GamePlatform> {
  try {
    const kind = choosePlatformKind({
      inPlayables: isPlayablesEnv(),
      isDev: import.meta.env.DEV,
    })
    if (kind === 'mock') {
      const { MockPlatform } = await import('./mock')
      return new MockPlatform()
    }
    return new YouTubePlatform()
  } catch (e) {
    console.error('[select] không chọn được nền tảng, dùng youtube no-op:', e)
    return new YouTubePlatform()
  }
}
