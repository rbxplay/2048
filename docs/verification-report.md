# Báo cáo nghiệm thu — Merge 2048

Ngày: 2026-10-08 · Nhánh `feat/2048-playables` · HEAD lúc đo: `f257187` (D1 tồn tại ở `f88e1a5`, sửa ở `b21797f`).
Phạm vi: Task 19. Lượt đo đầu không sửa mã sản phẩm; mọi lỗi ghi lại. Sau đó D1 được sửa ở `b21797f` (mã + test) và mục QA 4, 5, 7, 10 được kiểm lại. Mục 14 được sửa trên nhánh `fix/zoom-200-layout` và kiểm lại trên trình duyệt thật với viewport mô phỏng (một nửa kích thước, không phải Ctrl+= thật); D2, D3 chưa sửa.

## Tóm tắt

- Cổng chất lượng: `typecheck`, `test` (634/634 lúc đo ở `f257187`; 664/664 trên nhánh `fix/zoom-200-layout`), `build`, `contrast` **exit 0**.
  `check-bundle` và `preflight` **exit 1**, **đúng bằng baseline đã khai trong spec** (không lệch).
  *Cập nhật sau báo cáo này:* hai script đã được sửa để bắt việc DÙNG Web Storage và SDK Amplitude thật
  (spec, "Amend 2026-10-08 (2)"); trên cùng `dist`, `preflight` và `check-bundle` nay đều **exit 0**
  (Page Visibility kiểm ở `src/`; listener của Phaser vẫn có trong bundle). Các số trong bảng dưới là số đo của script cũ.
- Bundle: `dist/index.html` 1 426 044 byte, **gzip -9 = 370 503 byte (361,8 KiB)**, giới hạn 614 400 → **đạt NFR-01**.
- Request ngoài: chỉ `www.youtube.com` (SDK). Không font, ảnh, analytics.
- QA §A13 (14 mục): **ĐẠT 14 · KHÔNG ĐẠT 0 · CHƯA KIỂM 0** (mục 4 và 7 đạt sau sửa D1; mục 14 KHÔNG ĐẠT ở lần đo đầu, đạt **phần zoom** sau khi sửa bố cục — zoom 200 % mô phỏng bằng viewport một nửa, không phải Ctrl+= thật; vế "OS text scaling" của A11Y-10 **chưa kiểm**; ở viewport tối thiểu 260×360 nhãn tile ≥ 16384 có thể rộng hơn ô vài px; mục 12 chỉ kiểm qua cây a11y, không phải screen reader thật; mục 13 đạt theo thiết kế).
- **Lỗi sản phẩm nghiêm trọng (D1): soft-lock sau khi đóng dialog thắng/thua ở chế độ chuyển động mặc định — ĐÃ SỬA ở `b21797f`, kiểm lại trên trình duyệt thật.**
  Xem mục "Lỗi tìm thấy".

## 1. Cổng chất lượng (Step 1)

| Cổng | Lệnh | Exit | Ghi chú |
|---|---|---|---|
| typecheck + test + build | `npm run typecheck && npm test && npm run build` | **0** | Đo ở `f257187`: 30 file test, 634 test đạt. Sau `b21797f`: 637 test đạt, typecheck/build exit 0, bundle/preflight vẫn exit 1 đúng baseline (6 lỗi; 2 MUST) |
| contrast | `python3 scripts/check_contrast.py` | **0** | `RESULT: PASS` |
| bundle | `node scripts/check-bundle.mjs` | **1** | 6 lỗi, xem dưới |
| preflight | `npm run check:preflight` | **1** | 2 MUST + 2 SHOULD, xem dưới |

**So với baseline spec (§5, amend 2026-10-08):**

- `check-bundle`: đúng 6 lỗi, tất cả ở `index.html:13` — `localStorage` ×4 (`[bộ nhớ trình duyệt]`) và
  `visibilitychange` ×2 (`[Page Visibility API]`). **Khớp baseline.** Không có
  `[mock adapter lọt vào production bundle]`.
- `preflight`: 2 MUST — `analytics-sdk` (6 vị trí dòng 27, đều trong vendor Phaser) và `non-sdk-storage`
  (4 vị trí dòng 13); 2 SHOULD — file >512 KiB và `xhr-websocket` (dòng 35). **0 mục REQUIRED thiếu**
  (`game-ready`, `load-data`, `save-data`, `audio-check`, `pause-resume` đều không còn trong danh sách lỗi).
  **Khớp baseline.** (Spec nói `amplitude` ×8; preflight in số *vị trí dòng* là 6 — cùng một mục, không phải lệch.)
- Xác nhận độc lập mock không lọt vào `dist/`: `grep -c SPAWNED_BY_DEV_MOCK_ONLY dist/index.html` = **0**;
  `grep -c __mock dist/index.html` = **0**. Chuỗi đặc trưng của `mock.ts` không có trong artifact.

Kết luận: **không có finding mới ở các cổng này**; A13 #14 (preflight) và §14.2 vẫn "không đạt nguyên văn"
theo đúng hồ sơ đã ghi trong spec.

## 2. Đo bundle (Step 2)

```
ls -la dist/  →  index.html 1426044 byte (một file duy nhất)
gzip -9 -c dist/index.html | wc -c  →  370503
```

370 503 byte ≈ 361,8 KiB ≤ 614 400 byte (600 KiB). **Đạt NFR-01**, dư ~243 897 byte. (Vite tự báo
gzip 376,23 kB ở mức nén mặc định; số ghi ở đây là `gzip -9` theo brief.)

## 3. Request ngoài (Step 3)

Build **production** (`npm run preview`, cổng 4173), Chromium (Playwright), 200 phím mũi tên. Mọi request quan sát được:

| # | Request | Ghi chú |
|---|---|---|
| 1 | `GET http://localhost:4173/` | `index.html` |
| 2 | `GET https://www.youtube.com/game_api/v1` | script SDK trong `index.html` |
| 3 | `GET https://www.youtube.com/s/ytgame/9de0df05/ytgame.js` | SDK tự tải |
| — | `GET http://localhost:4173/favicon.ico` → 404 | trình duyệt tự xin; không có favicon (lỗi console `404` vô hại, không phải request ra ngoài) |

Không có font, ảnh, analytics, XHR/WebSocket. **Đạt** (chỉ nguồn ngoài là SDK của YouTube).
Lưu ý: ngoài YouTube, SDK thật chạy chế độ no-op (`The SDK is no-op…`), game vẫn chơi được.
Ván ở bước này chơi 200 nước, chưa tới hết nước; ván chơi đủ tới "Hết nước đi" nằm ở mục QA 11.

## 4. Phương pháp QA và build đã dùng

- **`window.__mock` KHÔNG tồn tại trong thực tế (finding D2).** `installMockOnWindow()` có định nghĩa ở
  `src/platform/mock.ts:124` nhưng **không nơi nào gọi** (`grep` toàn `src/`, `scripts/`: chỉ định nghĩa).
  Vì vậy các lệnh `__mock.pause()` / `__mock.emitAudioChange(false)` trong brief **không chạy được** trong
  dev build. Mock cũng lưu trong bộ nhớ nên không có cách tiêm save.
- Cách làm thay (không đụng mã sản phẩm): Playwright chặn `https://www.youtube.com/game_api/v1` và trả một
  **ytgame giả** (`IN_PLAYABLES_ENV: true`; `loadData` trả save do tôi tiêm; `onPause`/`onResume`/
  `onAudioEnabledChange` giữ callback để gọi tay; `saveData` ghi lại). Nhờ vậy game chạy qua **adapter
  YouTube thật** (`youtube.ts`) trên **build production** (`npm run preview`, `dist/` mới build).
  Đây vừa là "seed save" (mục 4, 5, ảnh greyscale) vừa là host giả (mục 8, 9).
- Mọi mục dưới đây kiểm trên **build production (preview)** trừ khi ghi khác; mục 4/7 có chạy thêm trên
  **dev server** (5173) để đối chiếu — cùng kết quả.
- Âm thanh đo bằng cách bọc `OscillatorNode.prototype.start` và đếm số lần gọi.
- Trình duyệt: Chromium 155 headless qua Playwright MCP. Không có thiết bị thật, không có screen reader thật.

## 5. Kết quả 14 mục QA (Step 4)

| # | Kiểm | Trạng thái | Cách kiểm và quan sát |
|---|---|---|---|
| 1 | 2 tile đầu, tỉ lệ 90:10 | **ĐẠT** | Phủ tự động: `src/game/rules.test.ts` — "10 000 lần spawn cho tỉ lệ 2:4 = 90:10 ±1 % (A13 mục 1)" và "đúng 2 tile, giá trị thuộc {2, 4} (FR-02, A13 mục 1)". Không kiểm tay lại. |
| 2 | merge không double | **ĐẠT** | Phủ tự động: `rules.test.ts` — "2 2 2 2 + trái ⇒ 4 4, KHÔNG ra 8", "4 2 2 + trái ⇒ 4 4 (ô đã merge không merge tiếp)". Không kiểm tay lại. |
| 3 | no-op không spawn | **ĐẠT** | Phủ tự động: `rules.test.ts` — "moved false ⇒ board giữ nguyên", "hàng đã dồn sát mép trái ⇒ moved false". Quan sát thêm trên trình duyệt: nước `←` vô hiệu ở mục 5 không đổi bàn cờ. |
| 4 | win ở 2048, keep playing | **ĐẠT** (kiểm lại sau `b21797f`) | Lần đầu KHÔNG ĐẠT do D1. Kiểm lại sau `b21797f` (xem D1), build production, chuyển động mặc định: tiêm board `[[1024,1024,0,0],…]`, `←` ra 2048 và dialog "You made 2048!"; "Keep playing" (chuột thật vào nút canvas), "New game" và ✕ đều đóng dialog sau ~800 ms; phím mũi tên sau đó di chuyển tile bình thường (`↓` đưa 2048 xuống hàng dưới). Dialog không còn kẹt `closing`. |
| 5 | game over đúng điều kiện | **ĐẠT** (phần phát hiện hết nước) | (a) Tiêm board chỉ còn 1 ô trống, bấm nước cuối: dialog "Hết nước đi" + live region assertive; nước `←` vô hiệu trước đó không làm gì; sau đó `↑` bị bỏ qua. (b) Chơi thật bằng phím từ ván mới tới "Hết nước đi" sau 161 lần bấm (điểm 2 280). Quan sát TRƯỚC khi sửa: "Chơi lại" bị kẹt như mục 4 (ván mới được tạo nhưng input chết, D1). Kiểm lại sau `b21797f`: bấm Retry trên dialog "No moves left" bằng chuột thật, dialog đóng và phím mũi tên di chuyển tile. Mục này chấm điều kiện thua, không chấm đường thoát. |
| 6 | reload giữ board | **ĐẠT** (có điều kiện, xem D3) | 6 nước, rồi `onPause` giả lập (như YouTube rời trang) → `saveData` được gọi 1 lần; nạp lại với blob đó → board **y hệt** 16 ô. **Điều kiện:** sau 6 nước, **trước** khi pause, `saveData` được gọi **0 lần** (save theo mốc §9.4). Một F5 trần không kèm pause giữa chừng ván ngắn sẽ mất board. |
| 7 | Esc đóng dialog, KHÔNG chặn mặc định | **ĐẠT** (kiểm lại sau `b21797f`) | `Escape` thật: `defaultPrevented = false` (đo lần đầu, không đổi) → không chặn mặc định. Sau sửa D1, `Esc` trên dialog thắng đóng dialog canvas và input chạy lại (tile di chuyển) với chuyển động mặc định. Esc đóng Settings cũng cho input chạy lại. |
| 8 | audio tắt khi YouTube mute | **ĐẠT** | Qua ytgame giả (không phải `__mock`, xem D2): 4 nước → 12 lần `OscillatorNode.start`; sau `onAudioEnabledChange(false)` 4 nước → **0**; bật lại → 12. |
| 9 | pause/resume | **ĐẠT** | Qua ytgame giả: `onPause` → D-pad (DOM) bị ẩn, `saveData` gọi 1 lần, 2 phím mũi tên khi pause **không đổi** board và **0** âm thanh; `onResume` → phím hoạt động trở lại. |
| 10 | resize giữa lúc tween | **ĐẠT** (giới hạn) | Bấm phím rồi đổi viewport liên tiếp 360×640 → 900×500 → 520×800 → 300×700 → 360×640 khi tween còn chạy: board vẽ lại đúng ô, không tile mồ côi, không lỗi console. Hạn chế: không bắt được khung hình giữa tween. Quan sát TRƯỚC khi sửa: cùng cơ chế `tweens.killAll()` gây D1 nên resize lúc dialog mờ dần có khả năng làm kẹt (lúc đó chưa kiểm). Kiểm lại sau `b21797f`: resize ~200 ms sau khi bấm Keep playing và ~200 ms sau khi đóng Settings (Esc) — input vẫn chạy lại ở cả hai; resize khi tile đang trượt chưa đo lại. |
| 11 | bàn phím chơi hết ván | **ĐẠT** | Chỉ phím mũi tên, từ ván mới tới "Hết nước đi" (161 phím). Quan sát TRƯỚC khi sửa: riêng việc *thoát* dialog bằng bàn phím lỗi (D1); đường thoát đã kiểm lại ở mục 4, 5, 7 sau `b21797f`, còn lượt 161 phím chưa chạy lại. |
| 12 | screen reader | **ĐẠT qua cây a11y — KHÔNG phải screen reader thật** | Không chạy NVDA/VoiceOver/Orca. Đã kiểm cây a11y của Chromium (`ariaSnapshot`) và DOM: `grid "Bàn cờ 4 nhân 4"`, `aria-rowcount=4`, `aria-colcount=4`, **4** `row` thật × **4** `gridcell` = 16; ô trống đọc "trống", ô có số đọc giá trị; vùng `aria-live="polite" aria-atomic="true"` công bố điểm ("0" rồi "8" sau nước ghi điểm); vùng `aria-live="assertive"` công bố "Bạn đạt 2048!" / "Hết nước đi"; 4 nút di chuyển + Cài đặt + thanh âm lượng, công tắc Rung/Giảm chuyển động, combobox Giao diện đều có tên. **Cần chạy lại bằng screen reader thật trước khi nộp.** |
| 13 | theme dark và contrast | **ĐẠT** (theo thiết kế; xem ghi chú) | Đổi qua ô `<select>` DOM (không bấm nút trong panel canvas). `light → dark`: nền trang, HUD, mặt bàn, ô trống, D-pad đổi cùng lúc; **tile KHÔNG đổi màu** vì bảng tile (`TILE_HEX`) dùng chung cho light/dark theo thiết kế (`src/theme/palette.ts`, `phaser/theme.ts`). `→ contrast`: **cả 15 tile đổi thành nền trắng/chữ đen cùng một lúc**, nền trang đen. Ảnh: `docs/verification/theme-dark.png`, `theme-contrast.png`. Nếu chủ dự án đọc "mọi tile đổi màu" nghĩa là cả light↔dark, mục này là KHÔNG ĐẠT. |
| 14 | zoom 200 % | **ĐẠT phần zoom** (kiểm lại sau khi sửa bố cục; lần đầu KHÔNG ĐẠT; OS text scaling chưa kiểm) | **Sau sửa** (nhánh `fix/zoom-200-layout`, build production, ytgame giả, vẫn mô phỏng bằng viewport một nửa — **không phải Ctrl+= thật**): ở 640×360, 260×400, 320×568, 384×512, 512×384, 960×540, 1280×720 và 260×360 (viewport tối thiểu cam kết) HUD, board, D-pad nằm trọn trong khung và không đè nhau; 640×360 và 512×384 đặt D-pad bên phải board (board 280 / 304 px), 260×400 co board còn 188 px. Ở mỗi cỡ: 4 nút D-pad canvas bấm chuột được, phím mũi tên chạy, đổi dọc ↔ ngang giữa ván giữ nguyên board (đọc qua cây a11y), dialog thắng / thua và card Cài đặt không bị cắt, D-pad nằm dưới lớp phủ. Lúc chơi không có thanh cuộn (`scrollWidth/Height` = viewport); khi dialog mở thì có — đó là quan sát phụ có từ trước, xem mục 7. Ảnh: `zoom200-640x360-sau-sua.png`, `zoom200-260x400-sau-sua.png`. Giới hạn: ở 260×360 ô chỉ 32 px, nhãn 6 ký tự `16384+` (sàn chữ 11 px) rộng hơn ô vài px. **Lần đo đầu (KHÔNG ĐẠT):** mô phỏng zoom 200 % bằng viewport một nửa (không phải Ctrl+= thật). 1280×720 → 640×360: bàn cờ và HUD vừa khung nhưng **D-pad bị cắt**, chỉ thấy mép trên nút "↑" (`docs/verification/zoom200-640x360.png`). 520×800 → 260×400: **bàn cờ bị cắt hai bên** (cột 1 và 4 tràn ra ngoài), D-pad chỉ lộ nút "↑" (`zoom200-260x400.png`). Không có thanh cuộn (`scrollWidth/Height` = viewport) nên người dùng không với tới phần bị cắt. |

**Chốt số:** ĐẠT = mục 1–14 (**14**; mục 4 và 7 đạt sau khi sửa D1 ở `b21797f`, mục 14 đạt sau khi sửa bố cục ở nhánh
`fix/zoom-200-layout` — cả ba là KHÔNG ĐẠT ở lần đo đầu); KHÔNG ĐẠT = **0**;
CHƯA KIỂM = **0**. Tổng 14. Mục 12 là "đạt qua cây a11y", mục 13 là "đạt theo thiết kế", mục 14 là "đạt với zoom mô phỏng", mục 5/6/10/11 có điều kiện ghi trong bảng.

## 6. Ảnh greyscale 4 giá trị (Step 5)

`docs/verification/board-2-64-512-4096-mau.png` (màu) và `…-greyscale.png` (CSS `filter: grayscale(1)` trên
`<html>`, chụp bằng Playwright). Board tiêm sẵn 2, 64, 512, 4096 (theme sáng, "Giảm chuyển động" bật để không có dialog).
Thang xám đọc được và **đơn điệu**: 2 sáng nhất → 64 xám trung → 512 xám đậm → 4096 gần đen. Độ sáng tương đối
(WCAG) tính từ `TILE_HEX`: 2 = 0,818 · 64 = 0,170 · 512 = 0,078 · 4096 = 0,027. Chữ đảo từ tối sang sáng ở 64 trở lên
vẫn đọc rõ trên nền xám. **Đạt §B15.** (Hai bậc 512 và 4096 gần nhau: 0,078 vs 0,027 — vẫn phân biệt được bằng
mắt trong ảnh, nhưng chênh lệch nhỏ nhất của thang.)

## 7. Lỗi tìm thấy (D1 đã sửa ở `b21797f`; D2, D3 chưa sửa — chờ quyết định)

### D1 — Soft-lock sau khi đóng dialog thắng/thua (nghiêm trọng, mất khả năng chơi) — ĐÃ SỬA

- **Điều kiện:** chuyển động mặc định (cài đặt "Giảm chuyển động" tắt, `prefers-reduced-motion` không bật). Build production và dev đều bị.
- **Tái hiện (đo ở `f257187`/`f88e1a5`, trước khi sửa; đã chạy 4 lần, cả hai build):**
  1. Tiêm save có board `[[1024,1024,0,0],[0,…],…]`, mở game, bấm `←` → dialog "Bạn đạt 2048!".
  2. Bấm "Chơi tiếp", hoặc "Ván mới", hoặc nút ✕, hoặc `Esc`.
  3. Kết quả: dialog canvas **không biến mất** (vẫn hiện, mờ một nửa), mọi phím mũi tên sau đó **không làm board đổi** — vĩnh viễn, tới khi tải lại.
  4. Tương tự ở ván thua: "Chơi lại" tạo ván mới (điểm về 0) nhưng dialog "Hết nước đi" vẫn phủ và input chết.
  5. Với "Giảm chuyển động" bật: mọi đường trên chạy đúng. Ảnh: `docs/verification/defect-dialog-ket-sau-van-moi.png`.
- **Nguyên nhân (đọc mã trước khi sửa):** `dialogs.close()` đặt `phase='closing'` rồi dùng tween mờ 800 ms (`scene.tweens`);
  tween này chỉ gọi `finishClose()` ở `onComplete`. Ngay sau đó action (`keep-playing` / `new-game` / `retry`)
  chạy `syncAll` → `scene.renderBoard()` → `#abortTweens()` → **`this.tweens.killAll()`** (`src/phaser/scenes/Board.ts:389`).
  `killAll` huỷ **mọi** tween trong scene, kể cả tween mờ của dialog, và **không chạy `onComplete`** → `phase` kẹt `'closing'`.
  `overlayCoversScreen('closing')` là true nên `onDir` chặn mọi input (`main.ts`). Đường `onResize` và `playOutcome` cũng gọi `killAll`.
- **Vì sao test không bắt được:** các test của `dialogs`/`actions` dùng scene giả; không test nào chạy tween thật cùng `renderBoard`.
- **Mức độ:** chặn đường thắng→chơi tiếp và thua→chơi lại — hai luồng cốt lõi (US-05). Người chơi buộc phải tải lại trang.
- **Gợi ý hướng sửa (đã áp dụng ở `b21797f`):** để Board chỉ kill tween của chính nó (theo tập target) thay vì `killAll()`, hoặc đóng dialog sau `renderBoard`.
- **Đã sửa:** `BoardScene.#abortTweens()` không còn gọi `tweens.killAll()`; nó chỉ `killTweensOf` container và nền của
  các tile trong pool (đích của mọi tween Board), rồi vẫn giải phóng `#absorbing`. Dialog và settings sống cùng scene nên
  tween mờ dần của chúng không còn bị giết, `finishClose()` chạy đúng và `phase` về `'closed'`. Mã: commit sửa D1
  (`b21797f`). Test: `src/phaser/boardScene.test.ts` (3 test, 2 đỏ trước khi sửa).
- **Kiểm lại trên trình duyệt thật (build production, chuyển động mặc định, ytgame giả):** Keep playing, New game, ✕, Esc trên
  dialog thắng; Retry trên dialog thua; mở/đóng Settings bằng Esc; đổi theme (canvas) rồi đóng; resize giữa lúc dialog
  thắng và Settings đang mờ dần — tất cả: input chạy lại sau ~1 s.
- **Settings** dùng cùng mẫu `'closing'` nên cùng lộ ra (resize khi card mờ dần chạm `#abortTweens`); cùng gốc, đã được sửa bởi thay đổi trên.


### D2 — `window.__mock` không bao giờ được cài

`installMockOnWindow` không được gọi ở đâu cả, nên hướng dẫn DevTools trong `mock.ts` và brief (mục QA 8, 9) không dùng được.
Không ảnh hưởng production (mock không lọt bundle). Chỉ là công cụ dev/QA còn thiếu một lời gọi.

### D3 — Không có mốc save khi mới chơi vài nước

Sau 6 nước chưa có lần `saveData` nào; chỉ pause/mốc 30 s/1000 điểm/win/over mới ghi. Đúng §9.4 nhưng nghĩa là F5 trần sau vài nước làm mất ván. Trên YouTube `onPause` sẽ flush nên rủi ro thực tế thấp; ghi để chủ dự án biết.

### Quan sát phụ (chưa điều tra sâu)

- **Thanh cuộn dọc xuất hiện khi dialog mở ở chế độ chuyển động mặc định** (520×800: `scrollHeight` 820 > `clientHeight` 800, thấy ở dialog thắng và dialog thua, biến mất sau khi tải lại). Chưa xác định nguyên nhân (nghi `a11y-dialog-host` hoặc chuyển focus). *Đo thêm khi kiểm lại mục 14:* xảy ra cả khi "Giảm chuyển động" bật và ở mọi cỡ viewport, trên cả bản trước khi sửa bố cục (1280×720: `scrollHeight` 740 > 720, thanh cuộn chiếm 15 px nên canvas còn 1265 px; 260×400 có cả thanh cuộn ngang). Không do bố cục canvas gây ra và **chưa sửa**; nó làm canvas hẹp/thấp đi 15 px trong lúc dialog mở.
- **Không có favicon** → `404` trên `/favicon.ico` (lỗi console đỏ nhưng không ảnh hưởng game).
- **Nhãn "Merge 2048"** nằm trong một vùng `aria-live="polite"` của cây a11y (màn loading tĩnh còn trong DOM), nên screen reader có thể đọc cả tên game khi vào trang.

## 8. Việc chưa làm / giới hạn

- Không có screen reader thật; không có thiết bị cảm ứng thật; không zoom trình duyệt thật bằng Ctrl+= (mục 14 trước và sau khi sửa đều đo bằng viewport một nửa); chưa kiểm OS text scaling.
- Không chạy SDK Test Suite chính thức và bundle analyzer của Playables (preflight đã nhắc).
- Không kiểm 4 môi trường của cert (preflight nhắc).
- Mục QA 10 không bắt khung giữa tween.

## 9. Phụ lục — file ảnh

`docs/verification/`: `board-2-64-512-4096-mau.png`, `board-2-64-512-4096-greyscale.png`, `theme-dark.png`,
`theme-contrast.png`, `zoom200-640x360.png`, `zoom200-260x400.png` (trước khi sửa mục 14), `zoom200-640x360-sau-sua.png`,
`zoom200-260x400-sau-sua.png` (sau khi sửa), `defect-dialog-ket-sau-van-moi.png`.
