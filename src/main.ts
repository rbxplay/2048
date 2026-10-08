// Composition root. Task 1 chỉ dựng khung để build có đầu ra; phần ghép nối
// vòng đời thật nằm ở Task 18.
//
// CSS được import ở task tạo ra chúng: tokens.css ở Task 9, bridge.css ở Task 14.
//
// Tên biến KHÔNG được là `screen`: trình duyệt đã có global `screen`
// (window.screen), và `const screen` ở phạm vi module sẽ đụng nó — TS báo
// TS2451 rồi TS2339 khi truy cập .textContent.
const loadingScreen = document.getElementById('screen')
if (loadingScreen !== null) {
  loadingScreen.textContent = 'Merge 2048'
}
