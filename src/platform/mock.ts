import { parse, serialize, type SaveData } from '../game/persist'
import type { GamePlatform } from './types'

/**
 * Chuỗi đặc trưng nhận diện module này.
 *
 * `scripts/check-bundle.mjs` tìm đúng chuỗi này trong `dist/` và FAIL nếu thấy.
 * Đó là lá chắn cho lỗi §5a: ở project anh em RockPaperScissor, mock adapter bị
 * bundle chung và chuỗi bộ nhớ trình duyệt của nó lọt vào artifact gửi cert.
 *
 * KHÔNG đổi giá trị này mà không đổi cả `scripts/check-bundle.mjs`.
 */
export const DEV_MOCK_MARKER = 'SPAWNED_BY_DEV_MOCK_ONLY'

/**
 * Nền tảng giả lập cho dev, unit test, và làm đường dự phòng.
 *
 * LƯU TRỮ NẰM TRONG BỘ NHỚ, không dùng bộ nhớ trình duyệt. Reload khi chạy
 * local sẽ mất tiến độ — đúng như một phiên không có SDK, và đổi lại module
 * này không bao giờ chạm vào thứ certification cấm.
 */
export class MockPlatform implements GamePlatform {
  readonly name = 'mock' as const

  /** Đặt được từ ngoài để thử locale khác khi test local. */
  lang: string = typeof navigator === 'undefined' ? 'en' : navigator.language

  /** Store trong bộ nhớ — cố ý không dùng bộ nhớ trình duyệt. */
  #store: string | null = null
  #audioEnabled = true

  #pauseCbs: Array<() => void> = []
  #resumeCbs: Array<() => void> = []
  #audioCbs: Array<(enabled: boolean) => void> = []

  async init(): Promise<void> {
    console.info(`[mock] ${DEV_MOCK_MARKER} — nền tảng giả lập, tiến độ không được lưu qua reload`)
  }

  async getLanguage(): Promise<string> {
    return this.lang
  }

  async load(): Promise<SaveData | null> {
    return parse(this.#store)
  }

  async save(data: SaveData): Promise<void> {
    try {
      this.#store = serialize(data)
      console.info('[mock] đã lưu:', data.score)
    } catch {
      console.warn('[mock] lưu thất bại — ván đấu tiếp tục bình thường')
    }
  }

  async reportScore(score: number): Promise<void> {
    console.info('[mock] báo điểm:', score)
  }

  onPause(cb: () => void): void {
    this.#pauseCbs.push(cb)
  }

  onResume(cb: () => void): void {
    this.#resumeCbs.push(cb)
  }

  isAudioEnabled(): boolean {
    return this.#audioEnabled
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): void {
    this.#audioCbs.push(cb)
  }

  async requestInterstitial(): Promise<boolean> {
    console.info('[mock] interstitial giả lập')
    return true
  }

  notifyFirstFrame(): void {
    console.info('[mock] firstFrameReady')
  }

  notifyGameReady(): void {
    console.info('[mock] gameReady')
  }

  logError(): void {
    // Quy tắc 3: không nhận tham số.
  }

  // ---------- Chỉ dùng khi test thủ công ----------

  pause(): void {
    for (const cb of this.#pauseCbs) cb()
  }

  resume(): void {
    for (const cb of this.#resumeCbs) cb()
  }

  /** Dữ liệu sẽ được lưu — để soi từ DevTools. */
  saved(): string | null {
    return this.#store
  }

  /** Giả lập YouTube bật/tắt mute giữa ván. */
  emitAudioChange(enabled: boolean): void {
    this.#audioEnabled = enabled
    for (const cb of this.#audioCbs) cb(enabled)
  }
}
