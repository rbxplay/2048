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
| D10 | **Phaser 4.2.1 là engine render. Toàn bộ UI nằm trong canvas** — board, HUD, dialog, Settings, D-pad | Người dùng chọn. Xem §2.1 để biết giá phải trả |
| D11 | **`Phaser.Scale.RESIZE`, KHÔNG dùng `FIT`** | `FIT` là CSS scaling → nhoè ở DPI cao, mâu thuẫn yêu cầu cert "crisp at every resolution and DPI" mà §B3 dẫn ra. Tài liệu Phaser ghi `RESIZE` là "No CSS scaling — 1:1 pixel mapping" |
| D12 | **Dựng tầng DOM ẩn song song cho accessibility** | Canvas không có cây accessibility. Accessibility là một trong 8 nhóm review của cert (§A1) |
| D13 | **NFR-01 nâng lên ≤ 2 MiB raw / ≤ 600 KiB gzip** | Phaser 4.2.1 đo được **1.31 MiB raw / 344 KiB gzip** (§13.4). Trần cert vẫn là 30 MiB MUST, ta ở ~5% |

### 2.1 Giá phải trả khi chọn Phaser

Số đo thật, không ước lượng:

| Hạng mục | Đo được |
|---|---|
| `phaser.min.js` raw | **1 375 976 byte = 1.31 MiB** |
| `phaser.min.js` gzip -9 | **352 222 byte = 344 KiB** |
| Trần cert initial bundle (MUST) | 30 MiB → ta ở **~5%** |
| Ngân sách NFR-01 cũ (400 KiB gzip) | Phaser chiếm **86%** → không đạt được |
| Ngân sách NFR-01 mới (600 KiB gzip) | Phaser + code + font ≈ 400 KiB → còn biên |

Hai hệ quả kiến trúc bắt buộc, không phải lựa chọn:

1. **`Scale.RESIZE` thay vì `FIT`** (D11). `FIT` áp CSS scaling lên canvas, đúng thứ §B3 cấm vì làm mờ ở DPI cao. `RESIZE` khớp canvas 1:1 với viewport, nên phải tự tính layout từ kích thước thật, cộng `Text.setResolution(devicePixelRatio)` cho chữ.

2. **Tầng DOM ẩn cho accessibility** (D12). Trong bản DOM/CSS, `role="grid"` và `aria-live` là miễn phí. Trong canvas thì không có gì cả, nên phải dựng một tầng DOM song song: live region cho trạng thái bàn cờ và điểm, cùng các điều khiển thật cho bàn phím. Đây là công việc thêm thật sự và là rủi ro R10 ở §16.

**Điều KHÔNG đổi:** màu token §B11 dùng nguyên vẹn (Phaser nhận số hex), toán học board §B3 dùng nguyên vẹn (nó chỉ là hình học), và toàn bộ `src/game/` cùng `src/platform/` không biết Phaser là gì.


---

## 3. Kiến trúc

### 3.1 Sơ đồ

```
index.html                      SDK <script> + màn loading tĩnh (DOM, hiện ngay first paint)
 ├─ #game-container             Phaser canvas — board + HUD + dialog + Settings + D-pad
 ├─ #a11y                       tầng DOM ẩn song song — live region + điều khiển bàn phím
 └─ src/main.ts                 composition root: boot → platform → session → Phaser
     ├─ src/game/               luật chơi thuần — KHÔNG biết Phaser là gì
     ├─ src/platform/           adapter SDK — KHÔNG biết Phaser là gì
     ├─ src/app/session.ts      state machine của ván — thuần
     ├─ src/phaser/             engine Phaser 4
     │  ├─ config.ts            GameConfig: Scale.RESIZE, DPR, màu
     │  ├─ scenes/Boot.ts       tạo player, đo font, chuyển scene
     │  ├─ scenes/Board.ts      board, tile pool, tween, input kéo
     │  ├─ views/hud.ts         text object cho điểm, kỷ lục, badge
     │  ├─ views/dialogs.ts     overlay WIN / GAME OVER
     │  ├─ views/settings.ts    slider, toggle, chọn theme
     │  └─ views/dpad.ts        4 nút cảm ứng
     ├─ src/a11y/               cầu nối canvas ↔ screen reader
     ├─ src/audio/              WebAudio tổng hợp SFX
     ├─ src/i18n/               en + vi
     └─ src/styles/             tokens.css — nguồn sự thật màu, đọc bởi cả Phaser
```

**Điểm quan trọng:** `src/styles/tokens.css` vẫn là nguồn sự thật của màu, nhưng Phaser cần giá trị hex chứ không phải `var(--t2)`. Nên `src/phaser/theme.ts` **đọc** token một lần lúc boot rồi chuyển thành bảng số, thay vì chép hex vào hai chỗ. Chép tay thì sớm muộn hai nguồn lệch nhau.

### 3.2 Nguyên tắc tách bạch

Ba quy tắc, kiểm được bằng đọc import:

1. **`src/game/` chỉ được import từ `src/game/`.** Không DOM, không Phaser, không `window`, không timer, không SDK, không `Math.random` trực tiếp. Đây là điều kiện để luật chơi test được trong môi trường thuần — và là lý do đổi engine từ DOM sang Phaser chỉ tốn 0 dòng trong `game/`.
2. **`src/phaser/` không quyết định luật.** Nó nhận `MoveOutcome` đã tính xong và chỉ hiển thị. Không có nhánh `if` nào trong scene đọc board để quyết định điều gì xảy ra tiếp.
3. **`src/platform/` không chứa luật chơi và không biết engine.** Nó chỉ chuyển tiếp sang SDK và luôn suy giảm an toàn.

### 3.3 Ranh giới trách nhiệm

| Module | Sở hữu | Không sở hữu |
|---|---|---|
| `game/` | board, luật merge, tính điểm, điều kiện win/over, serialize/parse save | thời gian, DOM, SDK, engine |
| `app/session.ts` | state machine của ván, milestone, ưu tiên overlay | DOM, Phaser, SDK |
| `platform/` | vòng đời SDK, cloud save, ads, mute, pause/resume | luật chơi, cấu trúc save, engine |
| `phaser/scenes/` | board, tile pool, tween, input kéo | luật chơi, trạng thái game |
| `phaser/views/` | HUD, dialog, Settings, D-pad vẽ trong canvas | luật chơi, trạng thái game |
| `a11y/` | cầu nối canvas ↔ screen reader, điều khiển bàn phím | luật chơi, hiển thị |
| `audio/` | tổng hợp SFX, gain, mute | quyết định khi nào phát (main quyết định) |
| `main.ts` | ghép nối vòng đời, milestone save | chi tiết của bất kỳ module nào |

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

> **Amend 2026-10-08 — A13 #14 KHÔNG đạt nguyên văn, và đây là ghi nhận có bằng chứng, không phải
> chỗ sửa lặng lẽ.**
>
> Trạng thái cuối: `check:preflight` **vẫn exit 1**, còn đúng **2 mục MUST** — `non-sdk-storage`
> (`localStorage` ×4) và `analytics-sdk` (`amplitude` ×8). **Không mục REQUIRED nào còn thiếu**:
> cả năm call life-cycle ở trên (`game-ready`, `load-data`, `save-data`, `audio-check`,
> `pause-resume`) nay đều có trong bundle.
>
> **Phạm vi ảnh hưởng — ba mục của tài liệu này cùng đỏ vì MỘT nguyên nhân.** Ghi rõ để hồ sơ không
> bị đọc thành "chỉ §15 mục 5 trượt":
>
> - **§15 mục 5** — `python3 scripts/playables_preflight.py ./dist --src ./src` **exit 1**, đúng 2
>   mục MUST như trên.
> - **§15 mục 6** — `node scripts/check-bundle.mjs` cũng **exit 1**, **6 lỗi**, tất cả ở
>   `dist/index.html:13`: `localStorage` ×4 (`[bộ nhớ trình duyệt]`) và `visibilitychange` ×2
>   (`[Page Visibility API]`). Hai phép kiểm còn lại của chính script đó — tên file khớp
>   `[A-Za-z0-9._-]`, và có `index.html` ở gốc bundle — **đều đạt**; script báo lỗi theo từng mục
>   nên danh sách 6 dòng trên là đầy đủ.
> - **§14.2** — ý "`dist/` không chứa `localStorage` / `sessionStorage` / `indexedDB` /
>   `document.cookie` / `visibilitychange`" **không đạt**, đúng 6 lần khớp đó. Hai ý còn lại của
>   §14.2 (tên file hợp lệ; `dist/` chỉ có đường dẫn tương đối) không nằm trong 6 lỗi này — ý thứ
>   hai chỉ có mục SHOULD `[xhr-websocket]` của preflight nhắc tới, không phải một phép kiểm đỏ.
>
> Ba mục trên có chung một nguyên nhân duy nhất — vendor trong artifact — nên không mục nào sửa
> được riêng lẻ; chúng phải đi kèm hồ sơ như nhau.
>
> Cả hai mục đều đến từ **vendor, không từ code dự án**: số lần xuất hiện trong `dist/index.html`
> trùng khít với `node_modules/phaser/dist/phaser.min.js` (4 và 8), còn `src/` không có lần nào.
> Đo trên Phaser 4.2.1:
> - `localStorage` của Phaser là **feature-detect, không phải ghi**: `setItem` **0**, `removeItem`
>   **0**, `sessionStorage` **0**, `indexedDB` **0**, `document.cookie` **0**. Tham chiếu duy nhất
>   trong mã là `try{a.localStorage=!!localStorage.getItem}catch(t){a.localStorage=!1}`; các lần
>   khác là khai báo thuộc tính trong object mặc định của `Device.Features`.
> - `amplitude` ×8 là **false positive** của regex `analytics-sdk`: nó đến từ
>   `gameobjects/spritegpulayer/SpriteGPULayer.js`, một class game **không dùng**, chỉ bị kéo vào
>   vì `import Phaser from 'phaser'` lấy cả namespace.
> - `visibilitychange` ×2 **không** khớp regex sau minify (`addEventListener(e, …)`, đối số là biến).
>
> **Vì sao không cắt bỏ được:** một điều tra read-only đã kết luận **không tồn tại đường hợp lệ**.
> Tree-shaking bằng 0 trên cả năm entry khác nhau (default / named / chỉ `Game` / chỉ `Scene` /
> chỉ `GameObjects`) — đều ra ~1.76 MB, lệch dưới 64 byte. Không flag build nào trong bảy flag
> (`CANVAS_RENDERER`, `WEBGL_RENDERER`, `WEBGL_DEBUG`, `FEATURE_SOUND`, `EXPERIMENTAL`,
> `PLUGIN_CAMERA3D`, `PLUGIN_FBINSTANT`) gate hai module gây lỗi. Mọi entry hẹp hơn kể cả
> `phaser-core.js` đều kéo `Game`. Đường duy nhất tới exit 0 là **đổi tên token trong artifact đã
> build** — đã chứng minh chạy được, nhưng bị **bác bỏ**: nó làm artifact không khớp cổng kiểm
> trong khi hành vi không đổi, tức qua cổng bằng cách giấu chứ không bằng cách sửa.
>
> **Cách đọc lại (người quyết định: chủ dự án).** Điều khoản cert nguyên văn (Cloud saves §4) là
> *"Game MUST NOT use any other mechanism to save user progress"* — cấm **hành vi** lưu tiến trình,
> không cấm việc tên API xuất hiện trong bundle. Game chỉ lưu qua `saveData` và **không ghi gì**
> vào bộ nhớ trình duyệt, nên điều khoản được thoả trong khi cổng grep vẫn đỏ. Nếu tiêu chí được
> đọc là "bundle chứa chữ `localStorage` thì loại" thì gần như mọi thư viện JS đều bị loại.
> **Hệ quả: A13 #14 như viết KHÔNG đạt**, và các số đo trên phải đi kèm hồ sơ nộp.
>
> **Mục §6 thì có thật và đã xử.** `Phaser.Core.VisibilityHandler` được cài tự động, không có
> config để tắt. Đo được: lật visibility vẫn cho **36 frame/600 ms** — handler nội bộ của Phaser
> **không** dừng được vòng lặp (vì `TimeStep.pause()` chỉ ghi `_pauseTime` mà không ai đọc), nên nó
> không tạo đường pause thứ hai có ảnh hưởng state; chỉ `onPause` của SDK mới cho **0 frame**. Đã
> đặt `autoFocus: false` để game không giật focus của trang, và pause/resume chạy **chỉ** qua SDK
> với đủ bốn vế: vòng lặp, âm thanh, ghi save, và input/UI. Không patch vendor.
>
> **Amend 2026-10-08 (2) — hai script kiểm được sửa để bắt HÀNH VI, theo quyết định của chủ dự án.**
> Các số đo ở trên là của script **trước** khi sửa; giữ lại làm hồ sơ. Sau khi sửa:
>
> - `non-sdk-storage` (preflight) và nhóm "bộ nhớ trình duyệt" (`check-bundle.mjs`) chỉ bắn khi
>   `localStorage`/`sessionStorage` thật sự được **dùng**: gọi `setItem`/`getItem`/`removeItem`/
>   `clear`/`key`, truy cập `[...]`, gán thuộc tính, hoặc đem chính object đi chỗ khác (alias).
>   Dòng dò tính năng `!!localStorage.getItem` và thuộc tính `localStorage:!1` của Phaser không
>   khớp vế nào; preflight ghi chúng thành một dòng ghi chú kèm số lần. `indexedDB`,
>   `document.cookie`, `PlayerPrefs`, `sys.save` vẫn bắt theo tên như cũ.
> - `analytics-sdk` không còn bắt từ trần `amplitude` (tên tham số hoạt ảnh của Phaser) mà bắt dấu
>   hiệu của SDK Amplitude thật: lời gọi `amplitude.init(`/`.getInstance(`/`.track(`/…, tên miền
>   `amplitude.com`, package `@amplitude/…`, `amplitude-js`.
> - Đã thử trên mẫu: 8 kiểu dùng Web Storage và 2 kiểu dùng SDK Amplitude đều bị bắt; mẫu trích từ
>   Phaser thì không.
>
> - Page Visibility API (`check-bundle.mjs`) được kiểm ở **mã nguồn dự án** (`src/`, bỏ qua file
>   `*.test.*`), không kiểm ở bundle: `visibilitychange`, `document.visibilityState`,
>   `document.hidden`. Listener của `VisibilityHandler` trong Phaser luôn có trong `dist` và không
>   tắt được (xem đoạn §6 ngay trên); thứ cert cấm mà dự án kiểm soát được là mã của chính nó tự
>   nghe sự kiện. Số lần xuất hiện trong bundle được in thành ghi chú. Thiếu thư mục nguồn thì
>   script báo lỗi chứ không coi là đạt.
>
> **Kết quả trên `dist` hiện tại:** §15 mục 5 — preflight **exit 0**, 0 MUST (A13 #14 đạt nguyên
> văn). §15 mục 6 / §14.2 — `check-bundle.mjs` **exit 0**. Lưu ý khi nộp: hai cổng xanh nghĩa là
> **mã dự án** không dùng các API này; listener `visibilitychange` của engine vẫn nằm trong bundle,
> nên phần giải trình và số đo ở trên vẫn phải đi kèm hồ sơ.

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

Preflight tìm các call bằng regex literal trên **nội dung file**, không phân tích cú pháp:

```python
('game-ready',  re.compile(r'\.game\.gameReady|gameReady\s*\('), ...)
('load-data',   re.compile(r'\.game\.loadData|loadData\s*\('), ...)
('save-data',   re.compile(r'\.game\.saveData|saveData\s*\('), ...)
('audio-check', re.compile(r'isAudioEnabled|onAudioEnabledChange'), ...)
```

RPS viết `this.#sdk?.game?.gameReady?.()`. Chuỗi `gameReady?.()` có `?.` xen giữa tên và `(`
nên **`gameReady\s*\(` không khớp**, và minifier giữ nguyên `?.`. Cả bốn check life-cycle trượt
vì cùng một lý do.

**Một chi tiết quyết định ai là bề mặt bị kiểm:** preflight chỉ quét các đuôi file

```
.js  .mjs  .cjs  .html  .htm  .css  .json  .txt  .svg
```

**`.ts` không nằm trong danh sách.** Nên với một dự án TypeScript:

- `--src ./src` **không quét được file `.ts` nào** — kể cả `ytgame.d.ts` có khai báo
  `gameReady(): void`.
- Bề mặt thật sự bị kiểm là **`dist/`**, tức bundle đã build và đã minify.

Hệ quả: khai báo type **không** thoả mãn check này. Tên call phải xuất hiện dưới dạng literal
trong **JS đã build**.

**Cách sửa cho 2048:** lấy SDK ra biến cục bộ, kiểm tra sự tồn tại bằng `if`, rồi gọi tên method
trực tiếp. Vừa an toàn hơn vì tách guard khỏi call, vừa để lại literal trong bundle.

```ts
notifyGameReady(): void {
  const sdk = currentSdk()
  if (sdk === undefined) return
  const game = sdk.game
  if (game === undefined) return
  try {
    game.gameReady()          // literal — preflight thấy trong dist
  } catch {
    // nền tảng lỗi không được làm hỏng game
  }
}
```

Áp dụng cho: `firstFrameReady()`, `gameReady()`, `loadData()`, `saveData()`, và
`isAudioEnabled` / `onAudioEnabledChange`.

### 5c. Preflight có điểm mù với TypeScript — bù bằng script riêng

Vì `.ts` không được quét (§5b), **toàn bộ mã nguồn TypeScript nằm ngoài tầm kiểm của preflight**.
Một dòng `localStorage` viết trong `src/platform/mock.ts` sẽ không bị preflight phát hiện ở tầng
nguồn — nó chỉ lộ ra khi đã lọt vào `dist/`.

Đây đúng là cách RPS trượt: `mock.ts` dùng bộ nhớ trình duyệt, và lỗi chỉ hiện ở `dist/index.html`.

**Cách bù cho 2048:** `scripts/check-bundle.mjs` (§13.3) quét `dist/` và là lá chắn thật sự. Nó
chạy trong `npm run check:bundle`, độc lập với preflight, và bắt:

```
bộ nhớ trình duyệt · Page Visibility API · request ngoài · SDK quảng cáo bên thứ ba
```

Cộng thêm hai biện pháp ở tầng nguồn:

- **Mock adapter dùng store trong bộ nhớ**, không dùng bộ nhớ trình duyệt — để kể cả khi nó có
  lọt vào bundle thì cũng vô hại, và để nó không bao giờ lọt (nhánh dev bị loại lúc build, §5a).
- **Không viết các literal cấm trong bất kỳ file nào**, kể cả comment `.ts`. Không phải vì
  preflight bắt — nó không bắt — mà vì một `grep` của người review sẽ thấy, và vì nếu sau này có
  file `.js` nào trong `src/` thì preflight sẽ bắt thật. Comment tiếng Việt gọi đó là
  "bộ nhớ trình duyệt".

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
  created2048: boolean                                       // nước đi này VỪA tạo ra tile 2048
  over: boolean                                              // hết nước đi
}

export type MoveContext = { rng: Rng; nextId: () => number }
export function applyMove(board: Board, dir: Dir, ctx: MoveContext): MoveOutcome
export function spawnTile(board: Board, rng: Rng, nextId: () => number):
  { board: Board; spawn: { id: number; at: Pos; value: number } } | null
export function canMove(board: Board): boolean
```

`rng` và `nextId` tiêm vào qua `MoveContext` ⇒ test được tỉ lệ 90:10 trên 10 000 lần spawn và board
cố định, không cần mock `Math.random`.

`created2048` nghĩa là **nước đi này vừa tạo ra** tile 2048 — không phải "ván đã từng đạt 2048".
`applyMove` là hàm thuần nên không biết ván đã thắng chưa; việc mở overlay WIN hay không thuộc về
`app/session.ts`. Cách này cũng chính xác hơn: thắng chỉ đến từ merge, không bao giờ từ tile sinh ra.

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
      created2048 = có merge nào tạo ra 2048
      over = not canMove(board)
  return { board, scoreDelta, moved, slides, merges, spawn, created2048, over }
```

`mergedThisMove` là cờ **cục bộ trong một lần gọi**, không nằm trong `Tile` lưu trữ. Đây là thứ
đảm bảo `2 2 2 2` + trái ra `4 4` chứ không ra `8` (§A3, US-02 AC3, A13 mục 2).

### 6.4 Ma trận hành vi

| Tình huống | `moved` | spawn | moves | score | Ghi chú |
|---|---|---|---|---|---|
| Input hợp lệ có thay đổi | `true` | có | +1 | `+= scoreDelta` | |
| Input không thay đổi gì | `false` | **không** | **không** | không đổi | §A3, A13 mục 3 |
| Merge xảy ra | `true` | có | +1 | `+= scoreDelta` | |
| Vừa tạo tile 2048 | `true` | có | +1 | `+= scoreDelta` | `created2048 = true`, mở WIN |
| Board đầy, không còn cặp kề bằng nhau | `true`/`false` | theo luật | | | `over = true`, mở GAME OVER |
| Đang ở WIN/GAME OVER overlay | — | — | — | — | input bị bỏ qua |

---

## 7. Vòng đời một nước đi

```
input (pointer drag hoặc bàn phím)
  │
  ├─ KHÔNG có hàng đợi — xem ghi chú bên dưới
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

**Không có hàng đợi input — và đó là chủ ý.** PRD §7 nói "hàng đợi sâu tối đa 1", nhưng hàng đợi chỉ
cần khi ta gate logic theo animation. Ta không làm vậy: logic áp dụng ngay, tween chạy sau và chỉ đọc
kết quả. Không có gì để nuốt, nên rủi ro R7 (một cú vuốt bị nuốt im lặng) biến mất **theo cấu trúc**
chứ không nhờ một cái hàng đợi. Hệ quả phụ có lợi: nhịp chơi giống hệt giữa bản thường và bản
reduced-motion, đúng yêu cầu §B5.

**Reduced motion:** commit state tức thì, tile hiện bằng fade 120 ms, **không gate input** trên
animation (§B5). Nhịp chơi phải giống hệt bản thường.

---

## 8. Render (Phaser 4)

### 8.1 GameConfig

```ts
// src/phaser/config.ts
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,                       // WebGL, fallback Canvas
  parent: 'game-container',
  backgroundColor: theme.page,
  scale: {
    mode: Phaser.Scale.RESIZE,             // D11: KHÔNG dùng FIT
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    roundPixels: false,                    // giữ độ nét của số khi chia tỉ lệ
  },
  scene: [Boot, Board],
}
```

`RESIZE` khớp canvas 1:1 với viewport nên không có CSS scaling. Đây là điều kiện để giữ đúng
yêu cầu cert *"crisp rendering at every resolution and DPI"* mà §B3 dẫn ra.

`roundPixels: false` là cố ý: bật nó làm chữ số bị nhảy nửa pixel ở DPI lẻ.

### 8.2 Bố cục tính từ kích thước thật

Không có CSS để lo phần layout, nên mọi thứ tính bằng tay từ `scale.width` / `scale.height`:

```ts
// src/phaser/layout.ts — hàm THUẦN, test được không cần Phaser
export type Layout = {
  boardSide: number
  gap: number
  cell: number
  boardX: number      // gốc trái-trên của bàn cờ, toạ độ game
  boardY: number
  hudY: number
  dpadY: number
}

export function computeLayout(width: number, height: number): Layout
```

Công thức lấy nguyên từ §B3 (`gap = boardSide * 0.03`, `cell = (boardSide − 5×gap) / 4`), chỉ đổi
đầu ra từ biến CSS sang toạ độ game. Bàn cờ căn giữa; nếu viewport rộng hơn cao thì thừa ra hai
bên được lấp bằng `backgroundColor` — đúng luật "fill the viewport, or centre + letterbox" `[SRC]`.

### 8.3 Tile pool và tween

Mỗi tile là một `Phaser.GameObjects.Container` gồm một `Rectangle` (nền) và một `Text` (số).
Pool khoá theo `Tile.id` — cùng lý do như §6.1: id ổn định nên **di chuyển chính container đó**
thay vì tạo lại, đúng yêu cầu §A12 *"never re-created per move"*.

| Hoạt động | Cách làm | Thời lượng |
|---|---|---|
| Slide | `this.tweens.add({ targets: container, x, y, ease: 'Sine.easeInOut' })` | `--dur-slide` 100 ms |
| Merge pop | tween `scale` 1 → 1.18 → 1 trên container | `--dur-pop` 200 ms |
| Spawn appear | `scale` 0 → 1 + `alpha` 0 → 1, delay 100 ms | `--dur-appear` 200 ms |
| Badge `+N` | `Text` tween `y` và `alpha` | `--dur-badge` 600 ms |

Chỉ tween `x`, `y`, `scale`, `alpha` — không đụng `width`/`height`.

**Reduced motion:** `this.tweens.killAll()` rồi đặt thẳng vị trí cuối. `Phaser.Scene.tweens.timeScale`
không dùng được vì nó làm chậm chứ không bỏ; phải rẽ nhánh tường minh.

**Resize giữa lúc tween** (Review Focus mục 3): `scale.on('resize')` → `tweens.killAll()` → tính lại
layout → đặt mọi tile về đúng vị trí cuối. Không làm vậy thì tween đang chạy theo toạ độ cũ và tile
bay sai chỗ.

### 8.4 Theme và font

- `src/phaser/theme.ts` đọc `tokens.css` một lần lúc boot (qua `getComputedStyle(document.documentElement)`)
  và đổi `#RRGGBB` sang số `0xRRGGBB` cho Phaser. Không chép hex vào code.
- `Text` cho numeral tile: `fontFamily` là font đã bundle, `setResolution(window.devicePixelRatio)`
  để nét ở DPI cao, và `fontSize` theo công thức §B2 (`cell × k`, k = 0.51 / 0.42 / 0.33 / 0.28).
- Đổi theme lúc chạy: cập nhật lại bảng màu và `setFill` cho mọi tile đang có, không dựng lại scene.

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

Canvas không có cây accessibility, nên phần lớn A11Y trong PRD **không** tự có. Đây là công việc
phải làm tường minh, và là rủi ro R10.

### 12.1 Tầng DOM ẩn song song (`#a11y`)

Một `div` có `position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)`
— ẩn khỏi mắt thường nhưng **vẫn trong cây accessibility** (khác hẳn `display: none` và
`visibility: hidden`, hai thứ này gỡ luôn khỏi cây a11y). Bên trong gồm:

| Phần tử | Vai trò | Cập nhật khi |
|---|---|---|
| `div[role="grid"]` với 16 `div[role="gridcell"]` | phơi bàn cờ thành lưới 4×4, `aria-label` là giá trị từng ô | sau mỗi nước đi |
| `div[aria-live="polite"]` cho điểm | thông báo điểm, **throttle ≤ 1 lần / 2 giây** | khi điểm đổi |
| `div[aria-live="assertive"]` cho kết cục | "Bạn đạt 2048" / "Hết nước đi" | khi mở overlay |
| `<button>` thật cho mọi hành động | D-pad, Settings, các nút trong dialog | dựng một lần |
| `<input type="range">` và checkbox thật | slider SFX, haptics, reduced motion, theme | dựng một lần |

Nút và ô nhập là **DOM thật**, không phải hình vẽ trong canvas. Nhờ vậy bàn phím, screen reader,
zoom 200 % và target ≥ 44 px đều đạt mà không phải tự dựng lại.

### 12.2 Đồng bộ hai chiều

Canvas là nguồn sự thật về hiển thị; DOM a11y là **bản chiếu chỉ-đọc** của cùng state. Không có
đường nào từ DOM quay lại sửa state ngoài việc phát cùng một `Dir` hoặc cùng một action — tức là
DOM a11y đi qua đúng `applyInput` / `applyAction` như canvas. Không có đường thứ hai vào logic.

### 12.3 Phần còn lại

| Yêu cầu | Cách làm trong Phaser |
|---|---|
| Tương phản numeral | Palette §B1.2 đã đo, dùng nguyên |
| Focus ring | CSS `:focus-visible` trên các phần tử DOM thật ở §12.1 |
| Bàn phím | `attachKeyboardInput` như cũ, nối vào cùng `applyInput` |
| `Esc` đóng dialog | Không `preventDefault()` — §A11 MUST, giữ nguyên |
| Reduced motion | Rẽ nhánh tường minh trong scene (§8.3), không dùng `timeScale` |
| Target ≥ 44 px | DOM thật + nút vẽ trong canvas đều đặt đúng kích thước |
| Zoom 200 % | Canvas theo `RESIZE` nên tự khớp; DOM a11y không bị cắt |
| Haptics | `navigator.vibrate` khi có, toggle trong Settings |

> **Amend 2026-10-08 (3) — "Zoom 200 %: canvas theo `RESIZE` nên tự khớp" là SAI, và sàn 280 px của
> §B3:139 không còn tuyệt đối, theo quyết định của chủ dự án.**
>
> `RESIZE` chỉ làm canvas khớp viewport; nó không làm BỐ CỤC khớp. Đo ở lượt nghiệm thu
> (`docs/verification-report.md` mục 14): zoom 200 % chia đôi viewport CSS, và ở 640×360 D-pad bị cắt
> dưới đáy, ở 260×400 board bị cắt hai bên — vì `computeLayout` giữ `boardSide ≥ 280` tuyệt đối và
> luôn xếp D-pad dưới board. A11Y-10 (PRD) thắng sàn đó. Quy tắc mới của `src/phaser/layout.ts`:
>
> 1. Xếp dọc HUD → board → D-pad nếu giữ được board ≥ 280 px. Mọi viewport đã lọt từ trước cho
>    **đúng những con số cũ** (có test hồi quy khoá số).
> 2. Không thì D-pad sang **bên phải** board nếu cách đó cho board lớn hơn (§B3:152-154 đã tính tới
>    việc dời sang cạnh ở tỉ lệ rộng). Ví dụ 640×360: board 280, D-pad bên phải.
> 3. Cả hai không giữ nổi 280 thì board **co lại** cho vừa (260×400: 188 px). Đệm trên nhường
>    trước (16 → 4 px). Vẫn là px thật — không `transform: scale()`, không zoom camera. D-pad giữ
>    nguyên nút 48 px, khe 8 px. Hàng HUD không co theo board (giữ ~280 px, hoặc gần hết bề ngang
>    viewport nếu hẹp hơn) để hai thẻ điểm không đè nhau.
> 4. Numeral của tile có sàn 11 px (§B2 "Min text size"); chỉ chạm tới khi ô < 39,3 px.
>
> Cam kết "không cắt, không đè" áp dụng từ viewport **260×360** trở lên (tức 520×720 ở zoom 200 %),
> kiểm bằng test quét lưới trong `src/phaser/layout.test.ts`. Nhỏ hơn thì HUD 48 px + D-pad 160 px
> đã ăn gần hết chiều cao; hàm vẫn trả số hữu hạn và không để gì đè nhau, nhưng không hứa lọt màn.



## 13. Build và đóng gói

### 13.1 Stack

Vite + TypeScript + vitest + `vite-plugin-singlefile` + **Phaser 4.2.1**.

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

Phaser được import dạng ESM (`import Phaser from 'phaser'`) để Rollup tree-shake được phần không
dùng. Thực tế cắt được rất ít — 2048 dùng scene, tween, text, input, scale, nên gần như toàn bộ
engine ở lại. Đừng trông vào việc này để tiết kiệm.

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
| `check_contrast.py` | §B12 của Design System | phải exit 0 |
| `check-bundle.mjs` | viết mới | `dist/` không chứa chuỗi cấm + không chứa sentinel của mock |
| `subset-font.py` | viết mới | sinh WOFF2 subset (chạy một lần, output commit) |

### 13.4 Ngân sách bundle (NFR-01 đã sửa — D13)

| Hạng mục | Đo được / ước tính |
|---|---|
| Phaser 4.2.1 `phaser.min.js` | **1.31 MiB raw / 344 KiB gzip** (đo thật, không ước lượng) |
| Code game (TS, sau minify) | ~60–90 KiB raw |
| Font WOFF2 subset | 15–25 KiB |
| CSS (tokens + a11y) | ~4 KiB |
| Âm thanh | **0** — tổng hợp |
| **Tổng** | **~1.45 MiB raw / ~400 KiB gzip** |
| **NFR-01 mới** | ≤ 2 MiB raw / ≤ 600 KiB gzip → **đạt, biên ~200 KiB** |
| Trần cert (MUST) | 30 MiB → ta ở **~5%** |


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
- chạm 2048 ⇒ `created2048 === true`
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
7. Bundle sau gzip ≤ 600 KiB (NFR-01 đã sửa, D13) — kỳ vọng thực tế ~400 KiB, trong đó Phaser chiếm 344 KiB.
8. QA a11y thủ công: chơi hết một ván chỉ bằng bàn phím; một ván chỉ bằng screen reader; kiểm bàn cờ đọc đúng thành lưới 4×4.

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
| R10 | **Canvas không có cây accessibility ⇒ nhóm Accessibility từ chối** | **cao** | **cao** | Tầng DOM ẩn song song (§12.1). Đây là rủi ro mới lớn nhất khi chuyển sang Phaser. Phải test bằng screen reader thật, không được đoán |
| R11 | Dùng nhầm `Scale.FIT` ⇒ CSS scaling ⇒ mờ ở DPI cao ⇒ trượt yêu cầu crisp-rendering | tb | tb | Chốt `Scale.RESIZE` trong `config.ts` (D11) + chụp ảnh kiểm ở DPR 1 / 2 / 3 |
| R12 | Đổi theme lúc chạy mà không vẽ lại tile đang có ⇒ hai bảng màu trộn lẫn | tb | thấp | Một hàm `applyTheme()` duy nhất đi qua mọi tile đang sống (§8.4) |

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
├─ assets/fonts/{inter-subset.woff2, LICENSE.txt}
├─ docs/
│  ├─ PRD.md
│  ├─ DesignSystem.md
│  ├─ verification-report.md
│  └─ superpowers/{specs,plans}/
├─ scripts/
│  ├─ playables_preflight.py
│  ├─ check_contrast.py
│  ├─ check-bundle.mjs
│  ├─ gen-tokens.mjs        sinh tokens.css từ theme/palette.ts
│  └─ subset-font.py
└─ src/
   ├─ main.ts               composition root — mỏng, chỉ ghép nối
   ├─ game/                 THUẦN — không biết Phaser, không biết SDK
   │  ├─ rng.ts             Rng, mulberry32
   │  ├─ board.ts           Board ↔ BoardData, tile id, truy vấn
   │  ├─ rules.ts           applyMove, spawnTile, createStartBoard
   │  └─ persist.ts         SaveData, serialize, parse, migrate
   ├─ app/
   │  ├─ session.ts         state machine của ván, milestone, ưu tiên overlay
   │  ├─ ads.ts             chính sách interstitial
   │  └─ haptics.ts
   ├─ platform/             không biết Phaser
   │  ├─ types.ts           GamePlatform, withTimeout
   │  ├─ youtube.ts         adapter ytgame
   │  ├─ mock.ts            dev-only, store trong bộ nhớ
   │  ├─ ytgame.d.ts        khai báo type SDK
   │  └─ select.ts          chọn platform lúc boot
   ├─ theme/palette.ts      NGUỒN SỰ THẬT của màu
   ├─ phaser/
   │  ├─ config.ts          GameConfig, Scale.RESIZE
   │  ├─ theme.ts           palette → số cho Phaser
   │  ├─ layout.ts          computeLayout — hàm thuần
   │  ├─ tileSpec.ts        nhãn và cỡ chữ theo giá trị
   │  ├─ input.ts           bàn phím
   │  ├─ scenes/{Boot.ts, Board.ts}
   │  └─ views/{hud.ts, dialogs.ts, settings.ts, dpad.ts}
   ├─ a11y/
   │  ├─ bridge.ts          tầng DOM song song cho screen reader
   │  └─ bridge.css
   ├─ audio/sfx.ts          tổng hợp WebAudio, 0 file
   ├─ i18n/{index.ts, en.ts, vi.ts}
   └─ styles/tokens.css     SINH RA từ theme/palette.ts
```
