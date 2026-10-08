/**
 * Khai báo type cho SDK YouTube Playables.
 *
 * Nguồn: file `index.d.ts` chính thức của Google (Apache-2.0), phục vụ tại
 * `https://www.youtube.com/game_api/v1`. Chỉ khai báo phần ta dùng.
 *
 * LƯU Ý: file này KHÔNG giúp gì cho preflight — preflight không quét `.ts`
 * (spec §5b). Tên call phải xuất hiện dạng literal trong JS đã build, và việc
 * đó do `youtube.ts` bảo đảm.
 */

export interface YtgameScore {
  /** MUST là số nguyên ≤ Number.MAX_SAFE_INTEGER. Số thực bị từ chối. */
  value: number
}

export interface YtgameGame {
  /** MUST gọi. Không gọi thì game không được hiển thị cho người dùng. */
  firstFrameReady(): void
  /** MUST gọi chỉ khi người chơi đã tương tác được. */
  gameReady(): void
  /** Trả chuỗi đã serialize. Có thể treo — luôn bọc timeout. */
  loadData(): Promise<string>
  /** KHÔNG được gọi trước khi loadData() xong — SDK sẽ từ chối. */
  saveData(data: string): Promise<void>
}

export interface YtgameSystem {
  /** BCP-47 tag, ví dụ 'en-US', 'vi-VN'. Có thể treo. */
  getLanguage(): Promise<string>
  onPause(callback: () => void): () => void
  onResume(callback: () => void): () => void
  /** Trạng thái mute của YouTube. false ⇒ game phải im lặng tuyệt đối. */
  isAudioEnabled(): boolean
  onAudioEnabledChange(callback: (enabled: boolean) => void): () => void
}

export interface YtgameEngagement {
  sendScore(score: YtgameScore): Promise<void>
}

export interface YtgameAds {
  /** Trả Promise. Không có quảng cáo thì resolve mà không hiện gì. */
  requestInterstitialAd(): Promise<void>
}

export interface YtgameHealth {
  /** KHÔNG nhận tham số. Best-effort, bị rate-limit. */
  logError(): void
}

export interface Ytgame {
  SDK_VERSION: string
  /**
   * true khi game nằm trong iframe của YouTube — SDK tính bằng
   * `window !== window.parent`. ĐÂY LÀ GUARD ĐÚNG: khi chạy local ở tab cấp
   * cao nhất nó là false, dù `ytgame` vẫn tồn tại.
   */
  IN_PLAYABLES_ENV: boolean
  game: YtgameGame
  system: YtgameSystem
  engagement: YtgameEngagement
  ads?: YtgameAds
  health: YtgameHealth
}

declare global {
  interface Window {
    ytgame?: Ytgame
  }
}
