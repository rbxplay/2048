import type { en } from './en'

/**
 * Chuỗi tiếng Việt — thị trường chính (spec §3).
 *
 * Kiểu là `typeof en` nên thiếu khoá nào là `tsc` báo lỗi. Đó là cách giữ hai
 * ngôn ngữ đồng bộ mà không cần test riêng.
 */
export const vi: typeof en = {
  title: 'Merge 2048',
  score: 'Điểm',
  best: 'Kỷ lục',
  moves: 'Lượt',
  newGame: 'Ván mới',
  keepPlaying: 'Chơi tiếp',
  retry: 'Chơi lại',
  winTitle: 'Bạn đạt 2048!',
  gameOverTitle: 'Hết nước đi',
  settings: 'Cài đặt',
  sound: 'Âm thanh',
  haptics: 'Rung',
  reducedMotion: 'Giảm chuyển động',
  theme: 'Giao diện',
  themeLight: 'Sáng',
  themeDark: 'Tối',
  themeContrast: 'Tương phản cao',
  close: 'Đóng',
  hint: 'Vuốt hoặc dùng phím mũi tên',
  moveUp: 'Đi lên',
  moveDown: 'Đi xuống',
  moveLeft: 'Đi sang trái',
  moveRight: 'Đi sang phải',
  empty: 'trống',
  boardLabel: 'Bàn cờ 4 nhân 4',
}
