// TẠM — Task 9 chỉ cần lớp này tồn tại để `config.ts` biên dịch được.
// Scene thật (board, tile pool, tween) là deliverable của Task 20.
import Phaser from 'phaser'

export class BoardScene extends Phaser.Scene {
  constructor() {
    super('Board')
  }
}
