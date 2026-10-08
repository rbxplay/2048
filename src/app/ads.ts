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

/**
 * Như `shouldRequestInterstitial`, cộng chốt "MỘT yêu cầu cho MỘT lần thua".
 *
 * `lastAdvertisedLoss` là `gameOvers` của lần thua đã xin quảng cáo gần nhất
 * (`null` nếu chưa xin lần nào). Trùng số nghĩa là CÙNG một lần thua, nên yêu cầu
 * thứ hai cho nó là trùng — và trùng ở đây là chuyện xảy ra được thật: cửa sổ
 * 800 ms của hiệu ứng mờ đóng overlay để hai sự kiện bấm lọt vào cùng một lần
 * thua, mà `requestInterstitialAd()` của SDK không tự chống trùng.
 *
 * HÀM THUẦN — chốt là một THAM SỐ, không phải bộ nhớ ẩn trong module: cùng một
 * đầu vào luôn cho cùng một đầu ra, nên test được mà không cần dựng lại module.
 */
export function shouldRequestInterstitialFor(
  state: AdPolicyState,
  lastAdvertisedLoss: number | null,
  now: number,
): boolean {
  if (state.gameOvers === lastAdvertisedLoss) return false
  return shouldRequestInterstitial(state, now)
}
