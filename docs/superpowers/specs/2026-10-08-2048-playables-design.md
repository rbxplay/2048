# 2048 — HTML5 / YouTube Playables

| Field | Value |
|---|---|
| Ngày | 2026-10-08 |
| Trạng thái | **Chờ review** — thiết kế đã chốt, chưa bắt đầu code |
| Tài liệu nguồn | `docs/PRD.md` (yêu cầu, anchor `A`), `docs/DesignSystem.md` (token normative, `B`) |
| Project anh em | `../RockPaperScissor` — precedent đã ship, nguồn của convention và platform layer |
| Skill | `.claude/skills/youtube-playables-game-dev/` — preflight script + quy tắc certification |

Tài liệu này KHÔNG lặp lại PRD. Nó chỉ chứa những gì PRD và Design System để mở: kiến trúc
triển khai, ranh giới module, hợp đồng dữ liệu, và các quyết định kỹ thuật cụ thể.

Khi tài liệu này và PRD mâu thuẫn, **PRD thắng** — trừ mục §5 dưới đây, nơi tài liệu này
chủ động sửa một chỉ dẫn trong PRD §6 kèm lý do đo được.

---

## 1. Mục tiêu

Xây một bản 2048 chạy được trên cả bốn môi trường YouTube Playables (desktop web, mobile web,
YouTube for Android, YouTube for iOS), đạt các mục tiêu G1–G5 của PRD, và **vượt certification
ngay lần nộp đầu tiên** (G4).

Sản phẩm là: luật chơi + token thiết kế + tích hợp SDK. Không có server, không có analytics,
không có kênh nội dung. Toàn bộ rủi ro kỹ thuật nằm ở chi tiết certification — audio, save,
pause, accessibility, bundle size — và đó là những gì tài liệu này khoá chặt.

**Phạm vi v1 đã chốt:**

| Hạng mục | v1 | Ghi chú |
|---|---|---|
| Bàn 4×4, luật §A3 đầy đủ | ✅ | |
| Cloud save qua SDK | ✅ | |
| Interstitial ads | ✅ | Chỉ sau khi đóng overlay GAME OVER |
| Dark theme + high-contrast theme | ✅ | Mở trong Settings |
| Rewarded undo (FR-13) | ❌ v1.1 | PRD Q2 |
| Nhạc nền | ❌ v1.1 | PRD Q4 — chỉ SFX |
| 5×5, daily seed, themes store | ❌ | PRD §A14 |

---

## 2. Quyết định thiết kế đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Adapter TypeScript theo precedent RPS**, không dùng `playables-bootstrap.js` | Xem §5 — đây là chỗ tài liệu này sửa PRD §6 |
| D2 | Board runtime lưu `Tile` có `id`, board lưu trữ lưu số thuần | §A12 đòi tile DOM pooled, §A6 đòi schema số |
| D3 | `applyMove()` thuần, `rng` tiêm vào | Test được tỉ lệ 90:10 và board cố định, không cần mock `Math.random` |
| D4 | Mock platform **không** lọt vào bundle production | Sửa lỗi đang có của RPS, xem §5a |
| D5 | SDK call viết dạng literal sau guard, không dùng `?.` trên tên method | Sửa lỗi đang có của RPS, xem §5b |
| D6 | SFX tổng hợp bằng WebAudio, **0 file âm thanh** | Bundle 0 byte, IP-02 tự động đạt, bỏ cả nhóm rủi ro R1 |
| D7 | Font: bundle WOFF2 subset, giấy phép OFL | Numeral là nội dung; cần render giống nhau trên 4 môi trường cert |
| D8 | Vite + TypeScript + vitest + `vite-plugin-singlefile` | Khớp RPS; singlefile cho ra đúng 1 `index.html`, dễ kiểm bundle |
| D9 | Cổng dev **8080** | Khớp sample chính thức của Google, để SDK Test Suite trỏ vào được |

---

## 3. Kiến trúc

### 3.1 Sơ đồ

```
index.html                      SDK <script> + màn loading tĩnh
 └─ src/main.ts                 composition root: boot → chọn platform → state → render
     ├─ src/game/               luật chơi thuần
     ├─ src/platform/           adapter SDK
     ├─ src/render/             DOM tile, animation
     ├─ src/input/              pointer + keyboard → Dir
     ├─ src/audio/              WebAudio tổng hợp SFX
     ├─ src/i18n/               en + vi
     └─ src/styles/             tokens.css + app.css
```

### 3.2 Nguyên tắc tách bạch

Ba quy tắc, kiểm được bằng đọc import:

1. **`src/game/` chỉ được import từ `src/game/`.** Không DOM, không `window`, không timer,
   không SDK, không `Math.random` trực tiếp. Đây là điều kiện để `game/` test được trong môi
   trường thuần và để luật chơi không phụ thuộc tốc độ animation.
2. **`src/render/` không quyết định luật.** Nó nhận `MoveOutcome` đã tính xong và chỉ hiển thị.
   Không có nhánh `if` nào trong renderer đọc board để quyết định điều gì xảy ra tiếp.
3. **`src/platform/` không chứa luật chơi.** Nó chỉ chuyển tiếp sang SDK và luôn suy giảm an toàn.

### 3.3 Ranh giới trách nhiệm

| Module | Sở hữu | Không sở hữu |
|---|---|---|
| `game/` | board, luật merge, tính điểm, điều kiện win/over, serialize/parse save | thời gian, DOM, SDK |
| `platform/` | vòng đời SDK, cloud save, ads, mute, pause/resume | luật chơi, cấu trúc save |
| `render/` | DOM tile, animation, layout, theme | luật chơi, trạng thái game |
| `input/` | pointer/keyboard → `Dir` | hàng đợi input, luật chơi |
| `audio/` | tổng hợp SFX, gain, mute | quyết định khi nào phát (main quyết định) |
| `main.ts` | ghép nối, hàng đợi input, state machine, milestone save | chi tiết của bất kỳ module nào |

`platform/` **import `SaveData` từ `game/persist` nhưng chỉ ở dạng type** (`import type`). Việc
serialize và parse nằm hoàn toàn trong `game/`; adapter chỉ chuyển chuỗi qua lại. Adapter không
bao giờ đọc hoặc dựng field của save.

---

## 4. Interface `GamePlatform`

Port từ RPS `src/platform/types.ts`, giữ nguyên ba bất biến, bổ sung cho ads và audio.

```ts
export type PlatformName = 'mock' | 'youtube'

export const PLATFORM_TIMEOUT_MS = 2000

export interface GamePlatform {
  readonly name: PlatformName

  /** Chuẩn bị nền tảng. KHÔNG BAO GIỜ throw. */
  init(): Promise<void>

  /** BCP-47 tag, ví dụ 'en-US', 'vi-VN'. Không bao giờ throw. */
  getLanguage(): Promise<string>

  /** Đọc tiến độ. null nếu chưa có. Không bao giờ throw. */
  load(): Promise<SaveData | null>

  /** Ghi tiến độ. Thất bại KHÔNG được làm gián đoạn ván đấu. */
  save(data: SaveData): Promise<void>

  /** Báo điểm. No-op nếu nền tảng không hỗ trợ. */
  reportScore(score: number): Promise<void>

  onPause(cb: () => void): void
  onResume(cb: () => void): void

  /** Trạng thái mute của YouTube. false ⇒ im lặng tuyệt đối. */
  isAudioEnabled(): boolean

  /** Đăng ký nhận thay đổi mute. Callback nhận trạng thái mới. */
  onAudioEnabledChange(cb: (enabled: boolean) => void): void

  /** Yêu cầu interstitial. true = đã hiện. Không bao giờ throw. */
  requestInterstitial(): Promise<boolean>

  /** Gọi khi màn loading đã render xong ở first paint. */
  notifyFirstFrame(): void

  /** Gọi khi game sẵn sàng tương tác. */
  notifyGameReady(): void

  /** Ghi log lỗi lên nền tảng. Best-effort. KHÔNG nhận tham số. */
  logError(): void
}
```

### 4.1 Ba bất biến

Kế thừa nguyên văn từ RPS, mỗi cái là một bài học đã trả giá:

1. `init()` **không bao giờ throw** — tự xử lý nội bộ, chuyển sang suy giảm.
2. `save()` thất bại **không được làm gián đoạn ván đấu** — log rồi chạy tiếp.
3. `logError()` **không nhận tham số** — chữ ký SDK YouTube là `(): void`.

### 4.2 `withTimeout` — luôn resolve

`loadData()` và `getLanguage()` có thể treo. Hàm bọc phải **luôn resolve, không bao giờ reject**,
và xử lý cả hai trường hợp quá hạn lẫn promise reject:

```ts
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T>
```

### 4.3 Phân biệt "chưa load xong" với "load thất bại"

Đây là điểm dễ sai nhất trong toàn bộ tích hợp, và là lý do tồn tại của hai cờ riêng trong
adapter YouTube:

| Trạng thái | Hành vi save |
|---|---|
| Chưa load xong | **Chờ** — SDK sẽ từ chối `saveData()` trước khi `loadData()` xong |
| Load thất bại (treo hoặc reject) | **Không bao giờ save nữa** trong phiên này |

Nếu gộp hai trạng thái làm một, một lần `loadData` treo sẽ khiến lần save kế tiếp ghi đè cloud
bằng `best: 0` — xoá vĩnh viễn kỷ lục của người chơi. Thà mất một phiên còn hơn mất kỷ lục.

### 4.4 Guard môi trường

```ts
export function isPlayablesEnv(): boolean {
  if (typeof window === 'undefined') return false
  const sdk = window.ytgame
  return sdk !== undefined && sdk.IN_PLAYABLES_ENV === true
}
```

**Không** dùng `typeof ytgame !== 'undefined'`. Script SDK định nghĩa global vô điều kiện, nên
cách đó luôn đúng kể cả khi chạy local — local sẽ đi nhầm vào nhánh "YouTube thật" và gọi vào
chuỗi no-op, khiến mọi hành vi lưu trữ trở nên vô nghĩa mà không hiện lỗi nào.

---

## 5. Hai lỗi của RPS mà 2048 phải tránh

Đây là phần quan trọng nhất của tài liệu. Tôi đã chạy preflight thật lên bundle đã build của RPS:

```
$ python3 scripts/playables_preflight.py ../RockPaperScissor/dist --src ../RockPaperScissor/src

❌ MUST (5):
  [non-sdk-storage]  → index.html:14 (×5)
  [game-ready]   không thấy trong bundle/source
  [load-data]    không thấy trong bundle/source
  [save-data]    không thấy trong bundle/source
  [audio-check]  không thấy trong bundle/source
```

A13 #14 yêu cầu lệnh này **exit 0**. RPS không đạt. Nếu ta sao chép RPS nguyên trạng, ta thừa
hưởng cả năm lỗi này.

### 5a. Mock adapter lọt vào bundle production

`MockPlatform` của RPS dùng `localStorage`. Vì nó được import tĩnh trong `select.ts`, nó bị
bundle chung và **chuỗi `localStorage` xuất hiện 5 lần trong `dist/index.html`** — tức là trong
artifact gửi đi cert. Đây đúng là rủi ro R2 của PRD, và nó đang xảy ra thật.

**Cách sửa cho 2048:** mock chỉ được nạp trong nhánh dev, và bundler loại hẳn nhánh đó khỏi
build production.

```ts
// src/platform/select.ts
export async function selectPlatform(): Promise<GamePlatform> {
  if (isPlayablesEnv()) return new YouTubePlatform()
  if (import.meta.env.DEV) {
    const { MockPlatform } = await import('./mock')   // chỉ tồn tại ở dev build
    return new MockPlatform()
  }
  return new YouTubePlatform()                        // production: ytgame vắng ⇒ mọi call no-op
}
```

Nhánh `import.meta.env.DEV` được thay bằng `false` lúc build, nên `import('./mock')` bị loại
hoàn toàn và `mock.ts` không vào bundle.

**Mock ở 2048 dùng store trong bộ nhớ, không dùng bộ nhớ trình duyệt.** Điều này cần thiết vì
preflight quét cả `--src` (§5c).

### 5b. Optional chaining che mất SDK call

Preflight tìm các call bằng regex literal:

```python
('game-ready',  re.compile(r'\.game\.gameReady|gameReady\s*\('), ...)
('load-data',   re.compile(r'\.game\.loadData|loadData\s*\('), ...)
```

RPS viết `this.#sdk?.game?.gameReady?.()`. Chuỗi `gameReady?.()` có `?.` xen giữa tên và `(`
nên **`gameReady\s*\(` không khớp**. Cả bốn check life-cycle đều trượt vì cùng một lý do.

**Cách sửa cho 2048:** lấy SDK ra biến cục bộ, kiểm tra sự tồn tại bằng `if`, rồi gọi tên method
trực tiếp. Vừa an toàn hơn vì tách guard khỏi call, vừa qua được check.

```ts
notifyGameReady(): void {
  const sdk = currentSdk()
  if (sdk === undefined) return
  const game = sdk.game
  if (game === undefined) return
  try {
    game.gameReady()          // literal — preflight thấy
  } catch {
    // nền tảng lỗi không được làm hỏng game
  }
}
```

Áp dụng cho: `firstFrameReady()`, `gameReady()`, `loadData()`, `saveData()`, và
`isAudioEnabled` / `onAudioEnabledChange`.

### 5c. Ràng buộc ngầm lên mã nguồn

Preflight quét cả `--src`. Nên **mã nguồn không được chứa literal**:

```
localStorage · sessionStorage · indexedDB · document.cookie
visibilitychange · document.visibilityState
XMLHttpRequest · WebSocket · sendBeacon
```

kể cả trong comment. Comment tiếng Việt phải gọi đó là "bộ nhớ trình duyệt". Đây là lý do mock
dùng store trong bộ nhớ chứ không dùng bộ nhớ trình duyệt.

### 5d. Sửa PRD §6

PRD §6 viết: *"Use it rather than re-implementing the life-cycle"*, trỏ tới
`assets/playables-bootstrap.js` của skill. Tài liệu này **chủ động không làm theo**, vì:

| | `playables-bootstrap.js` | Adapter TS theo RPS |
|---|---|---|
| Kiểu | JS thuần, không type | TypeScript, `tsc --noEmit` trong build |
| Test | không có | fake SDK, phủ được nhánh load treo / load hỏng |
| Nhất quán repo | lệch | khớp RPS |
| Sửa được lỗi §5a/§5b | không áp dụng được | có |

Lý do quyết định là §5a và §5b: hai lỗi này chỉ sửa được khi ta kiểm soát cấu trúc module và
biết chính xác tên call nào xuất hiện trong bundle. Một file JS dùng chung không cho ta điều đó.

---

## 6. Mô hình trạng thái và luật chơi

### 6.1 Biểu diễn board — runtime khác lưu trữ

§A12 yêu cầu tile DOM *"created once and reused (pooled), never re-created per move"*. §A6 lại
lưu board dạng `[[0,2,0,4],…]` thuần số. Hai yêu cầu này chỉ thoả được nếu **tách biểu diễn
runtime khỏi biểu diễn lưu trữ**.

```ts
// Runtime — có id ổn định
export type Tile = { id: number; value: number }
export type Board = (Tile | null)[][]        // 4×4

// Lưu trữ — §A6, không id
export type BoardData = number[][]           // 4×4, 0 = rỗng
```

`id` ổn định qua các nước đi, nên renderer **di chuyển chính DOM element đó** sang ô mới thay vì
tạo lại. `serialize()` bỏ `id`; `parse()` cấp `id` mới. Save schema §A6 **không đổi một byte**.

`id` cấp từ một counter tăng dần trong `game/`, không dùng `Math.random` — để test tái lập được.

### 6.2 `applyMove` — hàm thuần

```ts
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Pos = { row: number; col: number }
export type Rng = () => number

export type MoveOutcome = {
  board: Board                                              // board mới
  scoreDelta: number                                        // tổng giá trị đã merge
  moved: boolean                                            // false ⇒ không đổi gì
  slides: { id: number; from: Pos; to: Pos }[]
  merges: { id: number; at: Pos; value: number }[]           // value = giá trị SAU merge
  spawn: { id: number; at: Pos; value: number } | null
  reached2048: boolean                                       // lần đầu chạm 2048 trong ván
  over: boolean                                              // hết nước đi
}

export function applyMove(board: Board, dir: Dir, rng: Rng): MoveOutcome
export function spawnTile(board: Board, rng: Rng, nextId: () => number):
  { board: Board; spawn: { id: number; at: Pos; value: number } } | null
export function canMove(board: Board): boolean
```

`rng` tiêm vào ⇒ test được tỉ lệ 90:10 trên 10 000 lần spawn và board cố định, không cần mock
`Math.random`. Đây là điều kiện để A13 mục 1 kiểm được một cách xác định.

### 6.3 Thuật toán

Theo §A3, bản `[DESIGN — derived from the reference]`:

```
applyMove(board, dir, rng):
  snapshot = board (sao chép sâu)
  for mỗi line (hàng hoặc cột) theo thứ tự duyệt ngược hướng dir:
      tiles = các ô không rỗng của line, giữ nguyên thứ tự
      for i in 0..len-2:
          if tiles[i].value == tiles[i+1].value and not tiles[i].mergedThisMove:
              tiles[i].value *= 2
              scoreDelta += tiles[i].value
              tiles[i+1] bị hấp thụ        → ghi vào merges
              tiles[i].mergedThisMove = true
      compact(line, dir)                   → ghi vào slides
  moved = (board != snapshot)
  if moved:
      spawn = spawnTile(board, rng)        → 90% 2 / 10% 4
      reached2048 = vừa xuất hiện tile 2048
      over = not canMove(board)
  return { board, scoreDelta, moved, slides, merges, spawn, reached2048, over }
```

`mergedThisMove` là cờ **cục bộ trong một lần gọi**, không nằm trong `Tile` lưu trữ. Đây là thứ
đảm bảo `2 2 2 2` + trái ra `4 4` chứ không ra `8` (§A3, US-02 AC3, A13 mục 2).

### 6.4 Ma trận hành vi

| Tình huống | `moved` | spawn | moves | score | Ghi chú |
|---|---|---|---|---|---|
| Input hợp lệ có thay đổi | `true` | có | +1 | `+= scoreDelta` | |
| Input không thay đổi gì | `false` | **không** | **không** | không đổi | §A3, A13 mục 3 |
| Merge xảy ra | `true` | có | +1 | `+= scoreDelta` | |
| Vừa tạo tile 2048 | `true` | có | +1 | `+= scoreDelta` | `reached2048 = true`, mở WIN |
| Board đầy, không còn cặp kề bằng nhau | `true`/`false` | theo luật | | | `over = true`, mở GAME OVER |
| Đang ở WIN/GAME OVER overlay | — | — | — | — | input bị bỏ qua |

---

## 7. Vòng đời một nước đi

```
input (pointer drag hoặc bàn phím)
  │
  ├─ hàng đợi sâu tối đa 1 — giữ cái MỚI NHẤT, bỏ cái cũ
  │
  ▼
outcome = applyMove(board, dir, rng)
  │
  ├─ !outcome.moved ─→ phát sfx.invalid + feedback rung
  │                     KHÔNG spawn · KHÔNG tăng moves · KHÔNG save
  │
  └─ outcome.moved  ─→ board = outcome.board
                       score += outcome.scoreDelta
                       moves += 1
                       renderer.animate(outcome)
                       audio.play(outcome)
                       saveIfMilestone()
```

**Animation chỉ đọc `outcome`, không bao giờ ghi ngược vào state.** Đây là hợp đồng §A3 và là
thứ khiến các bản clone 2048 desync trên máy chậm: nếu renderer đọc board để quyết định điều gì
xảy ra tiếp, tốc độ animation sẽ thành một phần của luật chơi.

Hàng đợi sâu 1 giải rủi ro R7: một cái vuốt bị nuốt mất sẽ khiến người chơi thấy game hỏng.
Luôn phản hồi, không bao giờ bỏ im lặng.

**Reduced motion:** commit state tức thì, tile hiện bằng fade 120 ms, **không gate input** trên
animation (§B5). Nhịp chơi phải giống hệt bản thường.

---

## 8. Render

### 8.1 Cấu trúc DOM

```html
<div class="board" role="grid" aria-rowcount="4" aria-colcount="4">
  <div class="slot" aria-hidden="true"></div>   <!-- ×16, tĩnh -->
  <div class="tile" data-value="64" role="gridcell" aria-label="ô 64"></div>
  <!-- tile nằm trong cùng grid, dùng grid-area -->
</div>
```

Board là CSS grid 4×4 (`grid-template: repeat(4, 1fr) / repeat(4, 1fr)`, `gap: var(--gap)`).
Vị trí tile là ô grid. Animation slide dùng `transform: translate()` trên element tile, **không**
dùng toạ độ tuyệt đối tính lại mỗi lần resize (§B3).

### 8.2 Pool tile

Tile element tạo một lần và tái sử dụng (§A12). Vì `Tile.id` ổn định (§6.1), renderer giữ
`Map<number, HTMLElement>` và di chuyển đúng element đó sang `grid-area` mới.

- **Slide:** `transform: translate(dx, dy)`, `--dur-slide: 100ms`, ease `--ease-standard`
- **Merge pop:** scale 1 → 1.18 → 1, `--dur-pop: 200ms`; scale tile, **không** scale numeral
- **Spawn appear:** scale 0 → 1 + fade, `--dur-appear: 200ms`, delay `--delay-appear: 100ms`
- Chỉ animate `transform` / `opacity` / `filter` — không bao giờ `width`/`height`/`top`/`left`
  (§B5: layout thrash = mất frame trên Android tầm trung)
- `contain: layout paint` trên board; `touch-action: none` để drag không cuộn trang

### 8.3 Không dùng `transform: scale()` trên board

§B3 cấm rõ: board phải dùng kích thước CSS pixel gốc, không bao giờ scale bằng transform — scale
làm mờ ở DPI cao, mà cert yêu cầu *"crisp rendering at every resolution and DPI"*. Kích thước
tính từ `--board` / `--gap` / `--cell` trong `tokens.css`, cập nhật qua `ResizeObserver`.

### 8.4 Theme

`tokens.css` dán nguyên văn từ §B11, gồm cả selector `[data-theme="dark"]` và
`[data-theme="contrast"]`. §B16 yêu cầu giữ selector kể cả khi không mở ra cho người chơi; v1
**có** mở, đặt trên `<html data-theme="…">`.

---

## 9. Tích hợp YouTube Playables

### 9.1 Nhúng SDK

```html
<script src="https://www.youtube.com/game_api/v1"></script>
```

Không `defer`, không `async` — SDK tự kiểm hai attribute này trong `firstFrameReady()` và báo cáo
tuân thủ dựa trên kết quả. Thẻ phải nằm **trước** code game.

### 9.2 Vòng đời khởi động

```
DOMContentLoaded
  └─ render màn loading tĩnh (đã có sẵn trong index.html, hiện từ first paint)
       ↓
     platform.notifyFirstFrame()          // firstFrameReady() — màn loading đang hiện
       ↓
     const saved = await platform.load()  // await loadData() — BẮT BUỘC trước saveData đầu tiên
       ↓
     parse + migrate  →  resume ván | ván mới
       ↓
     render board, gắn input listener
       ↓
     platform.notifyGameReady()           // gameReady() — CHỈ khi người chơi đã bấm được
       ↓
     vòng chơi
```

`gameReady()` chỉ được gọi khi input đã gắn xong và board đã render — nếu gọi sớm, người chơi
thấy game "chết" trong lúc chờ.

### 9.3 API dùng

| Moment | Call | Mức |
|---|---|---|
| Splash hiện | `ytgame.game.firstFrameReady()` | MUST |
| Trước save đầu tiên | `await ytgame.game.loadData()` | MUST |
| Người chơi bấm được | `ytgame.game.gameReady()` | MUST |
| Milestone (xem §9.4) | `ytgame.game.saveData(json)` | MUST |
| `onPause()` | dừng vòng lặp, mute, flush save | MUST / SHOULD |
| `onResume()` | chạy lại vòng lặp, khôi phục audio | MUST |
| Kỷ lục mới | `ytgame.engagement.sendScore({ value: best })` | MUST nếu dùng |
| Đổi mute | `isAudioEnabled()` lúc boot + `onAudioEnabledChange(cb)` | MUST |
| Interstitial | `ytgame.ads.requestInterstitialAd()` trong try/catch | MUST có fallback |

### 9.4 Milestone save

Lưu ở: bắt đầu ván · win · game over · pause · mỗi 30 s chơi · mỗi khi vượt mốc 1000 điểm.
Debounce ≥ 1 s.

Payload §A6 khoảng 450–700 byte, giới hạn MUST là 3 MiB — biên an toàn ~4000×. Không bao giờ
lưu lịch sử từng nước đi.

### 9.5 Pause

Chỉ qua `onPause` / `onResume`. **Không** có listener `visibilitychange` trong build — preflight
coi đây là MUST error (§5c).

Khi `onPause`: dừng `requestAnimationFrame`, mute audio (đặt gain 0), flush save, ẩn D-pad.
Khi `onResume`: chạy lại vòng lặp, khôi phục audio theo `isAudioEnabled()`. Không có hình phạt
theo thời gian khi pause (US-07 AC2).

### 9.6 Interstitial

Chỉ gọi sau khi người chơi đóng overlay GAME OVER. Tối đa **1 lần mỗi 2 ván**, và **không bao giờ
trong 30 s đầu** của phiên (US-05 AC3, §A8).

Mọi đường ads đều có fallback không-quảng-cáo: game chỉ đơn giản chạy tiếp (MO-05). Nếu
monetization toggle chưa bật trong Developer Portal, code path no-op im lặng (MO-04).

---

## 10. Audio

### 10.1 Tổng hợp, không có file

6 SFX dựng bằng `OscillatorNode` + `GainNode` + envelope. **Không có file âm thanh nào trong
bundle.**

| Token | Sự kiện | Dạng sóng | Thời lượng | Gain (§B7) |
|---|---|---|---|---|
| `sfx.move` | trượt hợp lệ | triangle, quét nhẹ xuống | 70 ms | .35 |
| `sfx.merge` | merge, pitch theo giá trị | sine + hài bậc 2 | 120 ms | .55 |
| `sfx.spawn` | tile mới hiện | triangle, gain thấp | 60 ms | .2 |
| `sfx.invalid` | nước đi không đổi gì | square, giảm nhanh | 80 ms | .45 |
| `sfx.win` | chạm 2048 | hợp âm 3 nốt đi lên | 1.2 s | .8 |
| `sfx.over` | hết nước | hai nốt đi xuống | 1.0 s | .7 |

Pitch merge (§B7): `f = BASE × 2^(log2(n) − 1) / 12` semitone, **cap ở +12 semitone**.

Lợi ích: bundle 0 byte, IP-02 (quyền âm thanh) tự động đạt vì không có asset bên thứ ba, và
nhóm rủi ro R1 biến mất — không còn phụ thuộc việc giải mã file.

### 10.2 Mute discipline

- Đọc `isAudioEnabled()` lúc boot, đăng ký `onAudioEnabledChange()`.
- Khi YouTube mute: **im lặng tuyệt đối** — gain 0, không tạo node. Không phải "gain rất nhỏ".
- **Không có nút mute tổng** (§A9 MUST NOT/SHOULD NOT). Trong Settings chỉ có slider SFX 0–100 %.
- Slider SFX **không** ảnh hưởng output khi YouTube đang mute.

### 10.3 WebAudio unlock

Đây là rủi ro R1 — nguyên nhân bị từ chối hàng đầu.

- Tạo `AudioContext` **lúc boot**, không chờ user gesture. YouTube có thể tự focus game, nên
  không được giả định sẽ có gesture.
- Nếu context khởi tạo ở trạng thái `suspended`: resume ở **lần input đầu tiên** *và* ở mỗi
  `onResume`.
- **Không bao giờ** chặn gameplay vì audio. Audio lỗi thì game vẫn chạy.

---

## 11. Localization và font

### 11.1 Ngôn ngữ

`await platform.getLanguage()` (§A10, LM-01). Bundle cả `en` và `vi` (LM-02). Chuỗi ≤ 28 ký tự
để HUD không reflow (LM-04). Dùng thuộc tính CSS logic (`margin-inline`, `padding-inline`).

Danh sách chuỗi đầy đủ v1 (§A10): title · "New game" · "Keep playing" · "Score" · "Best" · "Moves" ·
"No moves left" · "You made 2048!" · "Settings" · "Sound" · "Haptics" · "Reduced motion" · "Theme".

Chuỗi chỉ dùng ở v1.1 (`"Watch an ad to undo"`, `"Ad not available"`) **không** được bundle ở v1 —
thêm chúng lúc làm rewarded undo.

Giá trị tile là numeral nên trung tính ngôn ngữ — không cần xử lý gì thêm.

### 11.2 Font

Bundle một WOFF2 subset, **không** gọi CDN (§B2, §A10, A2 #12).

- **Family:** Inter, giấy phép **OFL 1.1**. File giấy phép lưu trong `assets/fonts/LICENSE.txt`.
- **Subset:** chữ số `0-9` · Latin-1 cơ bản · dấu tiếng Việt dùng trong chuỗi UI
  (`ă â đ ê ô ơ ư` + thanh `́ ̀ ̉ ̃ ̣`).
- **Ước lượng:** 15–25 KiB sau subset.
- `font-variant-numeric: tabular-nums` + `font-feature-settings: "tnum" 1` để số không nhảy bề
  rộng khi điểm đổi (§B2).
- Cỡ numeral tile: `cell × k`, k = 0.51 (1–2 chữ số) / 0.42 (3) / 0.33 (4) / 0.28 (5+).
- Sàn tuyệt đối 11 px; không gì nhỏ hơn (§B2).

Nếu file font không lấy được, phương án dự phòng là `system-ui` stack (0 byte) — nhưng numeral sẽ
khác nhau giữa Android / iOS / Windows.

---

## 12. Accessibility

| Yêu cầu | Cách làm | Mức |
|---|---|---|
| Tương phản numeral | Palette §B1.2 đã đo — cả 13 giá trị ≥ 4.5:1 | AA |
| Tương phản UI text | Bảng §B1.3 đã đo | AA |
| Focus ring | `outline: 3px solid var(--focus)`, `outline-offset: 2px`, ≥ 3:1 | AA |
| Bàn phím | arrows + WASD chơi đủ; `Esc` đóng dialog; **không** `preventDefault()` trên `Esc` | MUST |
| Screen reader | board `role="grid"` + `aria-rowcount`/`aria-colcount`; score `aria-live="polite"` throttle ≤ 1 lần / 2 s | — |
| Reduced motion | bỏ slide/pop, đổi state tức thì + fade 120 ms; **không gate input** | — |
| Target size | nút ≥ 44×44 px; D-pad ≥ 48 px | AA |
| Haptics | toggle trong Settings; mặc định BẬT trên touch, TẮT trên desktop | MUST |
| Không dựa vào màu | numeral luôn hiện; thang luminance đơn điệu 0.82 → 0.02 | — |
| Zoom 200 % | không cắt, không chồng | — |
| Hairline + shadow | mọi tile đều có — đây là thứ duy nhất tách tile khỏi slot (slot vs board chỉ 1.37:1) | — |

Dialog: `role="dialog" aria-modal="true"`, trap focus, trả focus về element gọi nó, `Esc` đóng,
không bao giờ tự đóng.

---

## 13. Build và đóng gói

### 13.1 Stack

Vite + TypeScript + vitest + `vite-plugin-singlefile`, khớp RPS.

```ts
// vite.config.ts
export default defineConfig({
  base: './',                                   // A2 #9: chỉ đường dẫn tương đối
  server: { port: 8080, strictPort: true },      // khớp sample Google
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: true,
  },
  plugins: [viteSingleFile()],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
})
```

`viteSingleFile` gộp tất cả vào một `index.html` — đúng yêu cầu SPA, và dễ kiểm bundle.

### 13.2 Script

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "check:bundle": "node scripts/check-bundle.mjs",
  "check:contrast": "python3 scripts/check_contrast.py",
  "check:preflight": "python3 scripts/playables_preflight.py ./dist --src ./src"
}
```

### 13.3 `scripts/`

| File | Nguồn | Vai trò |
|---|---|---|
| `playables_preflight.py` | copy từ skill | A13 #14 — phải exit 0 |
| `check_contrast.py` | §B12 của Design System | A13 — phải exit 0 |
| `check-bundle.mjs` | viết mới | khẳng định `dist/` không chứa chuỗi cấm (§5a) |
| `subset-font.py` | viết mới | sinh WOFF2 subset từ font gốc (chạy một lần, output commit) |

### 13.4 Ngân sách bundle

| Hạng mục | Ước tính |
|---|---|
| JS + CSS (sau singlefile) | ~40–60 KiB raw |
| Font WOFF2 subset | 15–25 KiB |
| Âm thanh | **0** — tổng hợp |
| **Tổng raw** | **~60–85 KiB** |
| **Sau gzip** | **~20–30 KiB** |

Mục tiêu NFR-01 là ≤ 400 KiB gzip / ≤ 1.5 MiB raw. Biên an toàn hơn 10×.

---

## 14. Kiểm thử

### 14.1 Ba tầng

| Tầng | Ở đâu | Kiểm gì |
|---|---|---|
| Logic thuần | `src/game/*.test.ts` | luật chơi, không cần DOM |
| Adapter | `src/platform/*.test.ts` | fake SDK, nhánh lỗi |
| Khói + artifact | `src/smoke.test.ts`, `scripts/check-bundle.mjs` | build ra đúng, không rò rỉ |

### 14.2 Nội dung test tự động

**`game/rules.test.ts`** — phủ A13 mục 1–5:
- 10 000 lần spawn cho tỉ lệ 2:4 = 90:10 ± 1 %
- `2 2 2 2` + trái ⇒ `4 4`, **không** ra `8`
- nước đi không đổi gì ⇒ `moved === false`, không spawn, không tăng moves
- merge cộng đúng `scoreDelta`
- chạm 2048 ⇒ `reached2048 === true`
- `canMove` đúng: board đầy + không cặp kề bằng nhau ⇒ game over
- slide đúng thứ tự duyệt ngược hướng

**`game/persist.test.ts`** — phủ A13 mục 6–7:
- round-trip serialize → parse giữ nguyên board/score/best
- `v` lạ (v0, v99) ⇒ load được, không crash
- field thiếu ⇒ default
- payload hỏng (`'{rác'`, `null`, `''`) ⇒ ván mới, không throw
- `best` trong save luôn khớp giá trị cuối gửi `sendScore`

**`platform/youtube.test.ts`** — fake SDK:
- `loadData()` treo ⇒ **không** save lần nào nữa (§4.3) — đây là test quan trọng nhất
- `loadData()` reject ⇒ như trên
- `saveData()` reject ⇒ promise resolve, game không gián đoạn
- `isPlayablesEnv()` false khi thiếu `IN_PLAYABLES_ENV`
- `init()` không throw khi SDK hỏng hoàn toàn

**`platform/select.test.ts`**:
- production build rơi về `YouTubePlatform`, không bao giờ `MockPlatform`

**`scripts/check-bundle.mjs`**:
- `dist/` không chứa `localStorage` / `sessionStorage` / `indexedDB` / `document.cookie` /
  `visibilitychange` (§5a)
- `dist/` chỉ có đường dẫn tương đối
- tên file khớp `[A-Za-z0-9._-]`

### 14.3 Test thủ công trước khi nộp

Theo §A13 mục 8–13:
- SDK Test Suite trên build đã upload: đúng thứ tự `firstFrameReady → loadData → gameReady`
- Network panel: **0 request ngoài** trong suốt phiên
- YouTube mute ⇒ không âm thanh; bật/tắt mute giữa ván ⇒ hiệu lực ngay; audio chạy không cần gesture
- Chuyển tab / background ⇒ pause + save; quay lại ⇒ tiếp đúng chỗ
- Test trên cả 4 môi trường + WebView thật + foldable + resize giữa ván
- Ảnh chụp greyscale board ở 4 giá trị (2, 64, 512, 4096) — kiểm thang luminance

---

## 15. Tiêu chí hoàn thành

Lấy §A13 làm chuẩn, cộng thêm các mục đo được của tài liệu này:

1. §A13 mục 1–13 pass.
2. `npm run typecheck` exit 0.
3. `npm test` exit 0.
4. `python3 scripts/check_contrast.py` exit 0.
5. `python3 scripts/playables_preflight.py ./dist --src ./src` **exit 0** — RPS không đạt được
   mục này; ta phải đạt (§5).
6. `node scripts/check-bundle.mjs` exit 0.
7. Bundle sau gzip ≤ 400 KiB (NFR-01) — kỳ vọng thực tế ~30 KiB.
8. QA a11y thủ công: chơi hết một ván chỉ bằng bàn phím; một ván chỉ bằng screen reader.

---

## 16. Rủi ro

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|---|
| R1 | Audio cần user gesture ⇒ trượt cert | tb | cao | `AudioContext` tạo lúc boot; resume ở input đầu tiên và `onResume`; test cả mute lẫn unmute |
| R2 | Save ghi ngoài SDK | **đang xảy ra ở RPS** | cao | Mock ngoài production bundle (§5a) + `check-bundle.mjs` + preflight quét `--src` |
| R3 | Bundle vượt ngân sách | thấp | tb | 0 file âm thanh, font subset; ước tính ~30 KiB gzip |
| R4 | Nhóm Accessibility từ chối palette | thấp (palette đã đo) | tb | `check_contrast.py` trong CI |
| R5 | Catalog đã có 2048 gần giống | tb | cao | IP-04 check trước khi build; dark/contrast theme là điểm khác biệt |
| R6 | WebView Android khởi tạo viewport 0 | tb | cao | Không giả định canvas size; layout từ `gameReady()` + `ResizeObserver`; test WebView thật |
| R7 | Input queue nuốt cú vuốt | tb | tb | Hàng đợi sâu 1, luôn có phản hồi (§7) |
| R8 | Gọi ads khi toggle portal chưa bật | tb | thấp | Checklist MO-04 trong release plan |
| R9 | Preflight trượt vì lý do chưa biết | tb | tb | Chạy preflight **sớm**, ngay khi có skeleton build, không đợi tới cuối |

R9 được thêm so với PRD vì §5 cho thấy preflight có những bài kiểm không hiển nhiên, và phát
hiện muộn sẽ tốn kém.

---

## 17. Nguồn tham khảo

| # | Nguồn |
|---|---|
| 1 | `docs/PRD.md` — yêu cầu chức năng, anchor `A`, tiêu chí nghiệm thu |
| 2 | `docs/DesignSystem.md` — token, palette đã đo, anatomy component |
| 3 | `../RockPaperScissor/src/platform/` — precedent platform layer đã ship |
| 4 | `../RockPaperScissor/docs/superpowers/specs/2026-09-24-rock-paper-scissor-design.md` — format spec |
| 5 | `.claude/skills/youtube-playables-game-dev/` — quy tắc cert, `playables_preflight.py` |
| 6 | Kết quả chạy `playables_preflight.py` lên RPS, 2026-10-08 — nguồn của §5 |

---

## Phụ lục A — Cấu trúc thư mục đích

```
2048/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ .gitignore
├─ assets/
│  └─ fonts/
│     ├─ inter-subset.woff2
│     └─ LICENSE.txt
├─ docs/
│  ├─ PRD.md
│  ├─ DesignSystem.md
│  └─ superpowers/specs/2026-10-08-2048-playables-design.md
├─ scripts/
│  ├─ playables_preflight.py
│  ├─ check_contrast.py
│  ├─ check-bundle.mjs
│  └─ subset-font.py
└─ src/
   ├─ main.ts
   ├─ game/
   │  ├─ rules.ts          applyMove, spawnTile, canMove
   │  ├─ board.ts          Board ↔ BoardData, tạo board đầu
   │  ├─ persist.ts        SaveData, serialize, parse, migrate
   │  ├─ rng.ts            Rng, mulberry32
   │  └─ *.test.ts
   ├─ platform/
   │  ├─ types.ts          GamePlatform, withTimeout
   │  ├─ youtube.ts        adapter ytgame
   │  ├─ mock.ts           dev-only, store trong bộ nhớ
   │  ├─ ytgame.d.ts       khai báo type SDK
   │  ├─ select.ts         chọn platform lúc boot
   │  └─ *.test.ts
   ├─ render/
   │  ├─ board.ts          pool tile, diff, animate
   │  ├─ hud.ts            score, best, badge +N
   │  └─ dialogs.ts        win, game over, settings
   ├─ input/
   │  ├─ pointer.ts        drag → Dir
   │  ├─ keyboard.ts       arrows/WASD/Esc
   │  └─ dpad.ts           4 nút, ẩn sau 3 s
   ├─ audio/
   │  └─ sfx.ts            tổng hợp WebAudio
   ├─ i18n/
   │  ├─ index.ts
   │  ├─ en.ts
   │  └─ vi.ts
   ├─ styles/
   │  ├─ tokens.css        §B11 nguyên văn
   │  └─ app.css
   └─ smoke.test.ts
   ```
