/**
 * Cổng chặn nhịp lưu — §9.4: "Debounce ≥ 1 s".
 *
 * Vì sao cần: `bridge.ts` lắng sự kiện `'input'` của thanh trượt SFX (mỗi bước
 * kéo là một sự kiện) → `main.ts` `applySetting` → `platform.save` →
 * `ytgame.game.saveData`. Không có cổng này thì kéo một thanh trượt 100 bước là
 * 100 lời gọi SDK, mỗi lời còn bọc timeout 2 giây — mà SDK bị rate-limit.
 *
 * Vì sao tách khỏi `app/session.ts`: module đó là luật ván, phải THUẦN — không
 * timer, không `Date.now()`. Đồng hồ thuộc tầng vòng đời, nên cổng này nhận
 * `now`/`setTimer`/`clearTimer` tiêm từ ngoài và không tự đọc thời gian.
 */

/**
 * §9.4: "mỗi 30 s chơi" là một mốc lưu. `main.ts` dùng hằng này cho nhịp của
 * scene Clock (đồng hồ chạy theo vòng lặp game, nên `onPause` ngủ vòng lặp là
 * đồng hồ đứng luôn — đúng nghĩa "30 s CHƠI", không phải 30 s đồng hồ treo
 * tường).
 */
export const PLAY_SAVE_MS = 30_000

/**
 * §9.4: "Debounce ≥ 1 s".
 *
 * Đọc là khoảng cách TỐI THIỂU giữa hai lần ghi. Cửa sổ được tính từ lần thay
 * đổi ĐẦU TIÊN chứ không phải lần cuối: cách viết "chờ cho im 1 s rồi mới ghi"
 * (debounce đuôi thuần) sẽ hoãn vô hạn khi người chơi kéo thanh trượt liên tục,
 * và mất trọn phần đã đổi nếu host kill đúng lúc đó. Tính từ lần đầu thì mất
 * tối đa 1 s, mà vẫn không bao giờ vượt 1 lời gọi/giây.
 */
export const SAVE_MIN_INTERVAL_MS = 1000

/**
 * Hai đường vào, đúng hai loại mốc của §9.4 — không có đường thứ ba:
 *  - mốc RỜI RẠC (bắt đầu ván · win · game over · pause · mỗi 30 s chơi · mỗi
 *    mốc 1000 điểm) → `saveNow`;
 *  - thay đổi LIÊN TỤC (kéo thanh trượt SFX) → `saveSoon`.
 */
export type SaveGate = {
  /**
   * Ghi NGAY, không xếp hàng sau cửa sổ.
   *
   * Ghi ngay rồi huỷ luôn cửa sổ đang chờ, vì thay đổi đang chờ đã nằm trong
   * chính lần ghi này — để nguyên thì mốc vừa ghi xong lại sinh thêm một lời
   * gọi SDK thừa ngay sau đó.
   *
   * Ghi cả khi không có gì đang chờ: mốc "pause" và "mỗi 30 s chơi" của §9.4 là
   * mốc theo THỜI GIAN, chúng phải có mặt trong save kể cả khi ván không đổi gì.
   */
  saveNow(): void
  /** Thay đổi liên tục: gộp lại, cách nhau ≥ 1 s. */
  saveSoon(): void
}

/**
 * `setTimer`/`clearTimer` là BẮT BUỘC, không có mặc định.
 *
 * Cổng này không được tự lấy `setTimeout` toàn cục: đồng hồ thuộc tầng vòng đời
 * (composition root), và giữ chúng ở đây thì test buộc phải giả lập timer toàn
 * cục — mà thứ cần chứng minh lại đúng là THỜI ĐIỂM của từng lần ghi.
 */
export function createSaveGate<H>(opts: {
  save: () => void
  now: () => number
  setTimer: (fn: () => void, ms: number) => H
  clearTimer: (handle: H) => void
}): SaveGate {
  const now = opts.now
  const setTimer = opts.setTimer
  const clearTimer = opts.clearTimer

  let handle: H | null = null
  /**
   * Lần ghi gần nhất, tính bằng `now()`. Khởi tạo `-Infinity` để lần ghi đầu
   * tiên không bị chặn bởi khoảng cách.
   */
  let lastAt = Number.NEGATIVE_INFINITY

  /**
   * Ghi thật. Nuốt mọi lỗi: hợp đồng `GamePlatform` nói save hỏng KHÔNG được
   * làm gián đoạn ván đấu, mà hàm này chạy trong đường input của người chơi.
   */
  function write(): void {
    lastAt = now()
    try {
      opts.save()
    } catch {
      // Không log: `platform.save` đã tự log theo hợp đồng của nó, và một lần
      // ghi hỏng không được sinh thêm ồn.
    }
  }

  function cancel(): void {
    if (handle === null) return
    clearTimer(handle)
    handle = null
  }

  function schedule(): void {
    if (handle !== null) return
    // Cửa sổ tính từ lần thay đổi ĐẦU TIÊN (`now() + MIN`) và không được sớm
    // hơn một khoảng `MIN` kể từ lần ghi trước (`lastAt + MIN`) — nếu không, một
    // mốc ở t=0 rồi một thay đổi ở t=100 sẽ ghi hai lần trong 100 ms, đúng thứ
    // "≥ 1 s" cấm.
    //
    // KHÔNG dùng mốc "ghi ngay ở lần thay đổi đầu": đó là throttle cạnh trước,
    // không phải debounce, và nó ghi ngay giữa lúc người chơi đang kéo thanh
    // trượt — đúng thứ §9.4 dựng cửa sổ này để tránh.
    const due = Math.max(now(), lastAt) + SAVE_MIN_INTERVAL_MS
    handle = setTimer(() => {
      handle = null
      write()
    }, due - now())
  }

  return {
    saveNow(): void {
      cancel()
      write()
    },
    saveSoon(): void {
      schedule()
    },
  }
}
