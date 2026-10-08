import type { SaveData } from '../game/persist'

export type PlatformName = 'mock' | 'youtube'

/** Khớp con số trong sample chính thức của Google. */
export const PLATFORM_TIMEOUT_MS = 2000

/**
 * Hợp đồng duy nhất giữa game và nền tảng.
 *
 * BA QUY TẮC BẤT BIẾN cho mọi implementation:
 *  1. init() KHÔNG BAO GIỜ throw — tự xử lý nội bộ, chuyển sang suy giảm.
 *  2. save() thất bại KHÔNG được làm gián đoạn ván đấu — log rồi chạy tiếp.
 *  3. logError() KHÔNG nhận tham số — chữ ký SDK YouTube là `(): void`.
 */
export interface GamePlatform {
  readonly name: PlatformName

  init(): Promise<void>
  getLanguage(): Promise<string>
  load(): Promise<SaveData | null>
  save(data: SaveData): Promise<void>
  reportScore(score: number): Promise<void>

  onPause(cb: () => void): void
  onResume(cb: () => void): void

  isAudioEnabled(): boolean
  onAudioEnabledChange(cb: (enabled: boolean) => void): void

  /** true = đã hiện quảng cáo. Không bao giờ throw. */
  requestInterstitial(): Promise<boolean>

  notifyFirstFrame(): void
  notifyGameReady(): void
  logError(): void
}

/**
 * Bọc promise trong timeout, LUÔN resolve — không bao giờ reject.
 *
 * loadData() và getLanguage() có thể treo (spec §4.2). Xử lý cả hai trường
 * hợp: quá hạn, và promise reject.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const finish = (v: T): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    setTimeout(() => finish(fallback), ms)
    p.then(finish, () => finish(fallback))
  })
}
