import Phaser from 'phaser'
import { SIZE, type Board, type Pos } from '../../game/board'
import type { Dir, MoveOutcome } from '../../game/rules'
import { computeLayout, type Layout } from '../layout'
import { tileFontSize, tileLabel } from '../tileSpec'
import { buildTheme, type PhaserTheme } from '../theme'

/** Ngưỡng kéo, lấy từ §A4: `max(24 px, 0.18 × boardSide)`, tỉ lệ trục trội 1.2×. */
const MIN_SWIPE_PX = 24
const MIN_SWIPE_RATIO = 0.18
const AXIS_RATIO = 1.2

/** Khớp token §B5, đơn vị ms. */
const DUR_SLIDE = 100
const DUR_POP = 200
const DUR_APPEAR = 200
const DELAY_APPEAR = 100

/** §B5: đỉnh của pop là scale 1.18. */
const POP_SCALE = 1.18

/** Bán kính mặt bàn cờ. §B11 không có token cho mặt board; giữ theo bản gốc. */
const BOARD_RADIUS = 12

/** §B11: `--radius-slot` = `cell × 0.06`. */
const CELL_RADIUS_RATIO = 0.06

/** Cỡ dùng trước lần resize đầu tiên (iPhone SE 1st gen). */
const DEFAULT_W = 320
const DEFAULT_H = 568

/** Stack §B2, phải khớp tên family của `@font-face`. */
const FONT_STACK = '"2048 Digits", system-ui, sans-serif'

/** Hàm thuần, xuất ra để test không cần scene. */
export function resolveSwipe(dx: number, dy: number, minPx: number): Dir | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const dominant = Math.max(ax, ay)
  if (dominant < minPx) return null
  const weak = Math.min(ax, ay)
  if (weak > 0 && dominant / weak < AXIS_RATIO) return null
  if (ax >= ay) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

export type TileStroke = { width: number; color: number; alpha: number }

/**
 * Viền của một ô tile — gom CẢ BA thuộc tính vào một chỗ. §B4:162-163 chọn màu
 * theo bậc numeral; §B1.5 đổi cả độ dày lẫn alpha ở theme tương phản cao
 * ("2-px black border", đen đặc). Tách rời ba con số này ra từng call-site là
 * cách chắc chắn nhất để một trong chúng lệch lại.
 */
export function tileStroke(theme: PhaserTheme, value: number): TileStroke {
  return {
    width: theme.hairlineWidth,
    color: theme.tileHairline(value),
    alpha: theme.tileHairlineAlpha(value),
  }
}

/**
 * `#RRGGBB` từ số của `PhaserTheme`. Màu không bao giờ được viết thẳng trong
 * tệp này: palette là nguồn duy nhất, và có một bài kiểm quét đúng điều đó.
 */
function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

/** Cùng một ô? */
function samePos(a: Pos, b: Pos): boolean {
  return a.row === b.row && a.col === b.col
}

type TileNode = {
  container: Phaser.GameObjects.Container
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  value: number
  /** Ô LOGIC hiện tại — đổi ngay khi nước đi bắt đầu, không đợi tween đáp. */
  at: Pos | null
}

/**
 * Scene bàn cờ: pool tile, tween, và vòng đời resize.
 *
 * Scene **không** gọi `applyMove` và không có nhánh nào đọc board để quyết định
 * luật. Nó nhận `MoveOutcome` đã tính xong và chỉ hiển thị.
 */
export class BoardScene extends Phaser.Scene {
  #theme: PhaserTheme = buildTheme('light')
  #layout: Layout
  #nodes = new Map<number, TileNode>()
  /** Id đang bay vào ô merge; chưa huỷ được vì còn phải hút vào rồi mới biến mất. */
  #absorbing = new Set<number>()
  #reducedMotion = false
  #boardLayer!: Phaser.GameObjects.Container
  #dragStart: { x: number; y: number } | null = null

  constructor() {
    super('Board')
    this.#layout = computeLayout(DEFAULT_W, DEFAULT_H)
  }

  create(): void {
    this.#boardLayer = this.add.container(0, 0)
    this.#rebuildLayout()

    this.scale.on('resize', this.#onResize, this)
    this.input.on('pointerdown', this.#onPointerDown, this)
    this.input.on('pointerup', this.#onPointerUp, this)
    this.input.on('pointerupoutside', this.#onPointerUp, this)

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.#onResize, this)
      // Ván mới có thể dựng lại scene. Không dọn pool thì `#acquire` trả về
      // container đã bị huỷ và tile của ván sau không bao giờ hiện.
      this.#abortTweens()
      for (const id of [...this.#nodes.keys()]) this.#release(id)
      this.#absorbing.clear()
      this.#dragStart = null
    })
  }

  setTheme(theme: PhaserTheme): void {
    this.#theme = theme
    this.cameras.main.setBackgroundColor(theme.page)
    // Vẽ lại mọi tile đang sống, nếu không hai bảng màu sẽ trộn lẫn (rủi ro R12).
    for (const node of this.#nodes.values()) this.#paint(node, node.value)
  }

  setReducedMotion(on: boolean): void {
    this.#reducedMotion = on
  }

  /** Dựng lại toàn bộ bàn từ một board — đường "ảnh chụp", không phát hoạt ảnh. */
  renderBoard(board: Board): void {
    this.#abortTweens()
    const seen = new Set<number>()
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const tile = board[row]?.[col] ?? null
        if (tile === null) continue
        seen.add(tile.id)
        const node = this.#acquire(tile.id)
        this.#paint(node, tile.value)
        this.#place(node, { row, col })
        node.container.setScale(1).setAlpha(1)
      }
    }
    for (const id of [...this.#nodes.keys()]) {
      if (!seen.has(id)) this.#release(id)
    }
  }

  /**
   * Phát hoạt ảnh cho một nước đi. CHỈ ĐỌC `outcome` — không quyết định gì cả.
   */
  playOutcome(outcome: MoveOutcome): void {
    if (!outcome.moved) return
    this.#abortTweens()

    for (const slide of outcome.slides) {
      const node = this.#nodes.get(slide.id)
      if (node === undefined) continue
      // Vị trí LOGIC chốt ngay, hình ảnh đuổi theo bằng tween. Nhờ vậy một lần
      // resize giữa lúc bay vẫn đặt được tile về đúng ô của layout mới.
      node.at = slide.to
      const to = this.#center(slide.to)
      if (this.#reducedMotion) {
        node.container.setPosition(to.x, to.y)
      } else {
        this.tweens.add({
          targets: node.container,
          x: to.x,
          y: to.y,
          duration: DUR_SLIDE,
          ease: 'Sine.easeInOut',
        })
      }
    }

    for (const merge of outcome.merges) {
      const absorbed = this.#nodes.get(merge.id)
      const survivorTile = outcome.board[merge.at.row]?.[merge.at.col] ?? null

      if (survivorTile !== null) {
        const survivor = this.#acquire(survivorTile.id)
        this.#paint(survivor, survivorTile.value)
        // Tile sống sót nằm trong `outcome.slides` khi nó có dịch chuyển, nên
        // tween trượt của nó đã được đặt ở vòng trên và đích CHÍNH LÀ ô merge.
        // Chốt toạ độ ngay tại đây sẽ bị tween ghi đè ngược lại giá trị vừa
        // chốt (Phaser lấy giá trị đầu ở `preUpdate`, tức sau lệnh này) và tile
        // nhảy một cái thay vì trượt (FR-04). Chỉ đặt khi vị trí logic còn lệch
        // — tức node vừa được tạo và chưa từng được vẽ.
        if (survivor.at === null || !samePos(survivor.at, merge.at)) {
          this.#place(survivor, merge.at)
        }
        survivor.container.setScale(1)
        if (!this.#reducedMotion) {
          this.tweens.add({
            targets: survivor.container,
            scale: POP_SCALE,
            duration: DUR_POP / 2,
            yoyo: true,
            ease: 'Sine.easeInOut',
          })
        }
      }

      if (absorbed !== undefined) {
        absorbed.at = merge.at
        const at = this.#center(merge.at)
        if (this.#reducedMotion) {
          this.#release(merge.id)
        } else {
          this.#absorbing.add(merge.id)
          this.tweens.add({
            targets: absorbed.container,
            x: at.x,
            y: at.y,
            duration: DUR_SLIDE,
            ease: 'Sine.easeInOut',
            onComplete: () => this.#release(merge.id),
          })
        }
      }
    }

    if (outcome.spawn !== null) {
      const node = this.#acquire(outcome.spawn.id)
      this.#paint(node, outcome.spawn.value)
      this.#place(node, outcome.spawn.at)
      if (this.#reducedMotion) {
        node.container.setScale(1).setAlpha(1)
      } else {
        node.container.setScale(0).setAlpha(0)
        this.tweens.add({
          targets: node.container,
          scale: 1,
          alpha: 1,
          duration: DUR_APPEAR,
          delay: DELAY_APPEAR,
          ease: 'Sine.easeInOut',
        })
      }
    }

    const alive = new Set<number>()
    for (const row of outcome.board) {
      for (const t of row) if (t !== null && t !== undefined) alive.add(t.id)
    }
    for (const id of [...this.#nodes.keys()]) {
      // Tile đang hút vào ô merge chưa nằm trong `outcome.board` — để tween của
      // nó tự dọn, đừng huỷ giữa chừng.
      if (!alive.has(id) && !this.#absorbing.has(id)) this.#release(id)
    }
  }

  // ---------- nội bộ ----------

  #rebuildLayout(): void {
    this.#layout = computeLayout(this.scale.width, this.scale.height)
    this.cameras.main.setBackgroundColor(this.#theme.page)
    this.#drawBoardPlate()
  }

  #drawBoardPlate(): void {
    const existing = this.#boardLayer.getByName('plate')
    if (existing !== null) existing.destroy()
    const l = this.#layout
    const g = this.add.graphics().setName('plate')
    g.fillStyle(this.#theme.board, 1)
    g.fillRoundedRect(l.boardX, l.boardY, l.boardSide, l.boardSide, BOARD_RADIUS)
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const c = this.#center({ row, col })
        g.fillStyle(this.#theme.slot, 1)
        g.fillRoundedRect(
          c.x - l.cell / 2,
          c.y - l.cell / 2,
          l.cell,
          l.cell,
          l.cell * CELL_RADIUS_RATIO,
        )
      }
    }
    this.#boardLayer.add(g)
    // Thứ tự con trong container CHÍNH LÀ thứ tự vẽ, mà `add` xếp vào cuối. Sau
    // một lần resize, plate mới sẽ đè lên toàn bộ tile nếu không đẩy xuống đáy.
    this.#boardLayer.sendToBack(g)
  }

  /** Tâm của một ô, toạ độ game. */
  #center(at: Pos): { x: number; y: number } {
    const l = this.#layout
    const step = l.cell + l.gap
    return {
      x: l.boardX + l.gap + l.cell / 2 + at.col * step,
      y: l.boardY + l.gap + l.cell / 2 + at.row * step,
    }
  }

  #place(node: TileNode, at: Pos): void {
    node.at = at
    const c = this.#center(at)
    node.container.setPosition(c.x, c.y)
  }

  #acquire(id: number): TileNode {
    const existing = this.#nodes.get(id)
    if (existing !== undefined) return existing

    const l = this.#layout
    const background = this.add.rectangle(0, 0, l.cell, l.cell, this.#theme.slot)
    const label = this.add.text(0, 0, '', {
      fontFamily: FONT_STACK,
      fontSize: `${tileFontSize(2, l.cell)}px`,
      color: hex(this.#theme.text),
      fontStyle: 'bold',
    })
    label.setOrigin(0.5, 0.5)

    const container = this.add.container(0, 0, [background, label])
    this.#boardLayer.add(container)

    const node: TileNode = { container, background, label, value: 2, at: null }
    this.#nodes.set(id, node)
    this.#size(node)
    return node
  }

  /** Hình học của một tile: cỡ nền, cỡ chữ, độ phân giải nét. */
  #size(node: TileNode): void {
    const l = this.#layout
    node.background.setSize(l.cell, l.cell)
    node.label.setFontSize(tileFontSize(node.value, l.cell))
    // Bắt buộc để nét ở DPI cao (§B2). Đặt lại ở đây luôn vì DPI đổi khi người
    // chơi kéo cửa sổ sang màn hình khác — không đặt lại thì numeral nhoè.
    node.label.setResolution(window.devicePixelRatio || 1)
  }

  #paint(node: TileNode, value: number): void {
    const stroke = tileStroke(this.#theme, value)
    node.value = value
    node.background.setFillStyle(this.#theme.tileFill(value), 1)
    node.background.setStrokeStyle(stroke.width, stroke.color, stroke.alpha)
    node.label.setText(tileLabel(value))
    node.label.setColor(hex(this.#theme.tileText(value)))
    this.#size(node)
  }

  #release(id: number): void {
    const node = this.#nodes.get(id)
    if (node === undefined) return
    this.#nodes.delete(id)
    this.#absorbing.delete(id)
    node.container.destroy()
  }

  /**
   * Huỷ mọi tween đang chạy và dọn tile mồ côi.
   *
   * `tweens.killAll()` KHÔNG chạy `onComplete`, nên tile đang hút vào ô merge
   * sẽ nằm lại trong pool vĩnh viễn — nó không có trong board nào cả, mà cũng
   * chẳng còn tween nào để tự dọn. Gộp hai việc vào một chỗ để không call-site
   * nào quên vế thứ hai.
   */
  #abortTweens(): void {
    this.tweens.killAll()
    for (const id of [...this.#absorbing]) this.#release(id)
  }

  /**
   * Chốt hiển thị về ĐÚNG trạng thái cuối: mọi tile sống nằm ở ô logic của nó,
   * cỡ 1, alpha 1.
   *
   * Gọi ngay sau `#abortTweens()` vì tween bị huỷ KHÔNG chạy `onComplete`:
   * không chốt thì tile đang spawn dở kẹt ở scale 0 (vô hình vĩnh viễn) và tile
   * đang bay dở đậu lại ở toạ độ của layout cũ (§A4: re-layout on resize keeping
   * state là MUST).
   */
  #settle(): void {
    for (const node of this.#nodes.values()) {
      if (node.at !== null) this.#place(node, node.at)
      node.container.setScale(1).setAlpha(1)
      this.#size(node)
    }
  }

  #onResize = (): void => {
    // Resize giữa lúc tween: huỷ tween đang chạy rồi chốt layout mới. Không làm
    // vậy thì tween đang bay theo toạ độ CŨ và tile đáp sai chỗ (Review Focus 4).
    this.#abortTweens()
    this.#rebuildLayout()
    this.#settle()
  }

  #onPointerDown = (p: Phaser.Input.Pointer): void => {
    this.#dragStart = { x: p.x, y: p.y }
  }

  #onPointerUp = (p: Phaser.Input.Pointer): void => {
    const start = this.#dragStart
    this.#dragStart = null
    if (start === null) return
    const minPx = Math.max(MIN_SWIPE_PX, MIN_SWIPE_RATIO * this.#layout.boardSide)
    const dir = resolveSwipe(p.x - start.x, p.y - start.y, minPx)
    if (dir !== null) this.events.emit('swipe', dir)
  }
}
