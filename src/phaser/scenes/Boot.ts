// TẠM — Task 9 chỉ cần lớp này tồn tại để `config.ts` biên dịch được.
// Scene thật (nạp font, dựng board, firstFrameReady) là deliverable của Task 10.
import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }
}
