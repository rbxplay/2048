/** §A8: không bao giờ hiện quảng cáo trong 30 giây đầu của phiên. */
export const MIN_SESSION_MS = 30_000

export type AdPolicyState = {
  /** Số lần GAME OVER đã xảy ra trong phiên này. */
  gameOvers: number
  /** `performance.now()` lúc phiên bắt đầu. */
  sessionStartedAt: number
}

/**
 * Chính sách interstitial (§A8, US-05 AC3): tối đa một lần mỗi HAI ván, và
 * không bao giờ trong 30 giây đầu của phiên.
 *
 * HÀM THUẦN — nhận `now` từ ngoài để test được mà không cần đồng hồ giả.
 *
 * Hàm này chỉ trả lời "có được phép hỏi không". Nó không tự gọi SDK: nếu
 * không có quảng cáo thì game chạy tiếp, và việc đó do nơi gọi lo (MO-05).
 */
export function shouldRequestInterstitial(state: AdPolicyState, now: number): boolean {
  if (state.gameOvers <= 0) return false
  if (state.gameOvers % 2 !== 0) return false
  return now - state.sessionStartedAt >= MIN_SESSION_MS
}
