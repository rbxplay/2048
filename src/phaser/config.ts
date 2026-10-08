import Phaser from 'phaser'
import { BoardScene } from './scenes/Board'
import { BootScene } from './scenes/Boot'

/**
 * GameConfig.
 *
 * `Scale.RESIZE` là ràng buộc cứng, không phải lựa chọn: `Scale.FIT` áp CSS
 * scaling lên canvas, làm mờ ở DPI cao, và cert yêu cầu render nét ở mọi độ
 * phân giải lẫn DPI (§B3, D11).
 *
 * `roundPixels: false` là cố ý — bật nó làm chữ số nhảy nửa pixel ở DPI lẻ.
 *
 * `autoFocus: false` cũng là ràng buộc cứng, không phải sở thích — xem chú thích
 * tại chỗ trong object bên dưới.
 */
export function buildConfig(backgroundColor: number): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor,
    /*
      §6 — "MUST only use Playables SDK onPause and onResume". Phaser mặc định
      `autoFocus: true` (`core/Config.js`, `GetValue(config, 'autoFocus', true)`),
      và cờ đó gọi `window.focus()` ở HAI chỗ:

        - `core/VisibilityHandler.js` — một lần lúc boot;
        - `input/mouse/MouseManager.js` và `input/touch/TouchManager.js` — ở MỖI
          lần mousedown/touchstart.

      Game chạy trong iframe của YouTube, nên `window.focus()` là giật focus khỏi
      trang chủ nhà: trang bị mất focus ngay khi game boot, rồi mất lại ở mỗi cú
      bấm. Đặt `false` thì Phaser không tự giành focus nữa; input vẫn nhận bình
      thường vì cú bấm vào iframe đã cho tài liệu của game focus ở tầng trình
      duyệt.
    */
    autoFocus: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: '100%',
      height: '100%',
    },
    render: {
      antialias: true,
      roundPixels: false,
    },
    scene: [BootScene, BoardScene],
  }
}
