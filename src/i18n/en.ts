/**
 * Chuỗi tiếng Anh — nguồn sự thật của kiểu `Strings`.
 *
 * Danh sách này là CHÍNH XÁC phạm vi chuỗi của v1 (spec §11.1). Chuỗi chỉ dùng
 * ở v1.1 (rewarded undo) cố ý KHÔNG có mặt ở đây.
 *
 * Mọi chuỗi phải ≤ 28 ký tự (LM-04).
 *
 * KHÔNG thêm `as const` ở đây. `typeof en` là kiểu của cả hai ngôn ngữ, và
 * `vi.ts` khai `typeof en`, nên `as const` biến mỗi trường thành kiểu literal
 * (`score: 'Score'`) và mọi khoá tiếng Việt thành lỗi TS2322. Bỏ `as const`
 * vẫn giữ đúng thứ cần giữ: thiếu hay thừa khoá nào là `tsc` báo lỗi ngay.
 */
export const en = {
  title: 'Merge 2048',
  score: 'Score',
  best: 'Best',
  moves: 'Moves',
  newGame: 'New game',
  keepPlaying: 'Keep playing',
  retry: 'Retry',
  winTitle: 'You made 2048!',
  gameOverTitle: 'No moves left',
  settings: 'Settings',
  sound: 'Sound',
  haptics: 'Haptics',
  reducedMotion: 'Reduced motion',
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeContrast: 'High contrast',
  close: 'Close',
  hint: 'Swipe or use the arrow keys',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveLeft: 'Move left',
  moveRight: 'Move right',
}
