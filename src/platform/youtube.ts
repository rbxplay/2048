import { parse, serialize, type SaveData } from '../game/persist'
import type { Ytgame } from './ytgame'
import { PLATFORM_TIMEOUT_MS, withTimeout, type GamePlatform } from './types'

/**
 * Guard ĐÚNG cho môi trường Playables.
 *
 * KHÔNG dùng `typeof ytgame !== "undefined"` — script SDK định nghĩa global vô
 * điều kiện, nên cách đó LUÔN đúng kể cả khi chạy local. Làm sai thì local sẽ
 * đi nhầm vào nhánh "YouTube thật" và gọi vào chuỗi no-op, khiến mọi hành vi
 * lưu trữ trở nên vô nghĩa mà không hiện lỗi nào.
 */
export function isPlayablesEnv(): boolean {
  if (typeof window === 'undefined') return false
  const sdk = window.ytgame
  return sdk !== undefined && sdk.IN_PLAYABLES_ENV === true
}

function currentSdk(): Ytgame | undefined {
  if (typeof window === 'undefined') return undefined
  return window.ytgame
}

/** Kẹp về số nguyên không âm ≤ MAX_SAFE_INTEGER. Phải khớp `best` trong save. */
export function toScoreValue(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.min(Math.max(0, Math.floor(score)), Number.MAX_SAFE_INTEGER)
}

export class YouTubePlatform implements GamePlatform {
  readonly name = 'youtube' as const

  /**
   * Phân biệt HAI trạng thái, đây là điểm dễ sai nhất:
   *
   *  - CHƯA LOAD XONG  → chờ, chưa save
   *  - LOAD THẤT BẠI   → KHÔNG BAO GIỜ save nữa
   *
   * Nếu gộp làm một, `loadData` treo sẽ khiến timeout trả chuỗi rỗng, ta parse
   * ra null, rồi lần save kế tiếp GHI ĐÈ cloud bằng best = 0 — xoá vĩnh viễn
   * kỷ lục của người chơi. Thà mất một phiên còn hơn mất kỷ lục mọi thời đại.
   */
  #loadCompleted = false
  #loadFailed = false

  async init(): Promise<void> {
    // Không có bước init riêng — SDK sẵn sàng khi script load xong.
    // Giữ method để thoả interface và để phát hiện môi trường thiếu SDK.
    if (currentSdk() === undefined) {
      console.warn('[youtube] không thấy ytgame — SDK chưa load?')
    }
  }

  async getLanguage(): Promise<string> {
    const sdk = currentSdk()
    const system = sdk?.system
    if (system === undefined) return 'en'
    try {
      const p = system.getLanguage()
      if (p === undefined) return 'en'
      return await withTimeout(p, PLATFORM_TIMEOUT_MS, 'en')
    } catch {
      return 'en'
    }
  }

  async load(): Promise<SaveData | null> {
    const sdk = currentSdk()
    const game = sdk?.game
    if (game === undefined) {
      this.#loadFailed = true
      return null
    }
    try {
      // withTimeout LUÔN resolve, kể cả khi promise gốc chưa xong, nên không
      // thể phân biệt "xong thật" với "hết giờ" qua giá trị trả về. Dùng cờ
      // riêng để biết promise gốc có thật sự resolve hay không.
      let settled = false
      const raw = await withTimeout(
        game.loadData().then((v) => {
          settled = true
          return v
        }),
        PLATFORM_TIMEOUT_MS,
        '',
      )
      if (!settled) {
        console.warn('[youtube] loadData quá hạn — KHÔNG lưu để tránh ghi đè cloud')
        this.#loadFailed = true
        return null
      }
      // Tới đây load ĐÃ xong. Dữ liệu hỏng không phải là load hỏng — người
      // chơi chỉ mất một phiên, nên vẫn cho phép save về sau.
      this.#loadCompleted = true
      return parse(raw)
    } catch {
      this.#loadFailed = true
      return null
    }
  }

  async save(data: SaveData): Promise<void> {
    if (this.#loadFailed) {
      console.warn('[youtube] bỏ qua save: loadData thất bại, không ghi đè cloud')
      return
    }
    if (!this.#loadCompleted) {
      console.warn('[youtube] bỏ qua save: loadData chưa xong')
      return
    }
    const sdk = currentSdk()
    const game = sdk?.game
    if (game === undefined) return
    try {
      await withTimeout(game.saveData(serialize(data)), PLATFORM_TIMEOUT_MS, undefined)
    } catch {
      console.warn('[youtube] lưu thất bại — ván đấu tiếp tục bình thường')
    }
  }

  async reportScore(score: number): Promise<void> {
    const sdk = currentSdk()
    const engagement = sdk?.engagement
    if (engagement === undefined) return
    try {
      await withTimeout(
        engagement.sendScore({ value: toScoreValue(score) }),
        PLATFORM_TIMEOUT_MS,
        undefined,
      )
    } catch {
      console.warn('[youtube] báo điểm thất bại — bỏ qua')
    }
  }

  onPause(cb: () => void): void {
    const sdk = currentSdk()
    const system = sdk?.system
    if (system === undefined) return
    try {
      system.onPause(cb)
    } catch {
      // nền tảng lỗi không được làm hỏng game
    }
  }

  onResume(cb: () => void): void {
    const sdk = currentSdk()
    const system = sdk?.system
    if (system === undefined) return
    try {
      system.onResume(cb)
    } catch {
      // nền tảng lỗi không được làm hỏng game
    }
  }

  isAudioEnabled(): boolean {
    const sdk = currentSdk()
    const system = sdk?.system
    if (system === undefined) return true
    try {
      return system.isAudioEnabled()
    } catch {
      return true
    }
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): void {
    const sdk = currentSdk()
    const system = sdk?.system
    if (system === undefined) return
    try {
      system.onAudioEnabledChange(cb)
    } catch {
      // nền tảng lỗi không được làm hỏng game
    }
  }

  async requestInterstitial(): Promise<boolean> {
    const sdk = currentSdk()
    const ads = sdk?.ads
    if (ads === undefined) return false
    try {
      const done = await withTimeout(
        ads.requestInterstitialAd().then(() => true),
        PLATFORM_TIMEOUT_MS,
        false,
      )
      return done === true
    } catch {
      return false
    }
  }

  notifyFirstFrame(): void {
    const sdk = currentSdk()
    const game = sdk?.game
    if (game === undefined) return
    try {
      game.firstFrameReady()
    } catch {
      // nền tảng lỗi không được làm hỏng game
    }
  }

  notifyGameReady(): void {
    const sdk = currentSdk()
    const game = sdk?.game
    if (game === undefined) return
    try {
      game.gameReady()
    } catch {
      // nền tảng lỗi không được làm hỏng game
    }
  }

  logError(): void {
    // SDK nhận KHÔNG tham số — không thể gửi nội dung lỗi lên.
    const sdk = currentSdk()
    const health = sdk?.health
    if (health === undefined) return
    try {
      health.logError()
    } catch {
      // nothing
    }
  }
}
