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
 */
export function buildConfig(backgroundColor: number): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor,
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
