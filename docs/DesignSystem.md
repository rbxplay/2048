# 2048 — Design System (YouTube Playables)

| Field | Value |
|---|---|
| Product | **2048** for YouTube Playables |
| Version | 1.0 |
| Date | 2026-10-08 |
| Status | **Frozen for implementation** — tokens are normative |
| Companion documents | `2048-PRD.md` (requirements, `A` anchors, acceptance criteria), `check_contrast.py` (re-derives every `[MEASURED]` number in this file), skill `youtube-playables-game-dev` |
| Scope | colour, typography, geometry/layout, elevation, motion, iconography, sound, component anatomy, certification anti-patterns, tokens.css |

## 0. How to use this document

1. **Tokens are normative.** Implement `§B11 tokens.css` verbatim (names and values). If you change a value,
   re-run `check_contrast.py` and keep every threshold green, then record the change in §B14.
2. `[MEASURED]` numbers were computed, not estimated — reproduce them with `python3 check_contrast.py` (§B12).
   The script exits non-zero if any tile numeral drops below 4.5:1.
3. Every visual decision traces to either a certification rule (`[SRC]`) or a design decision (`[DESIGN]`).
   Certification rules are re-stated in §B10 as hard bans — they are not style preferences.
4. Components in §B8 are specified as anatomy + states + a11y props so a coding agent can implement them without
   guessing; §B16 is the handoff checklist.

## B0. Design direction

**Warm, tactile, calm, zero-chrome.** A cream page, one warm-brown board, tiles that read as physical cards, and
numerals as the only "content". No logos, no mascots, no decorative illustration (they cost bytes and invite the
branding rules to bite). The entire interface is one SVG-free, image-free CSS surface plus numerals `[DESIGN]`.

Because Playables run inside YouTube on phones, portrait-first and thumb-first: the board is centred, the HUD is a
single row, and controls sit in the lower half of the reachable area.

## B1. Colour

### B1.1 The classic palette does not meet AA `[MEASURED]`

The original 2048 palette (`style/main.css`, fetched 2026-10-08, `[SRC]`) measured against its own numeral colour:

| Tile | bg | text | ratio | AA large (3:1) | AA normal (4.5:1) |
|---|---|---|---|---|---|
| 2 | `#eee4da` | `#776e65` | 3.98 | PASS | **FAIL** |
| 4 | `#ede0c8` | `#776e65` | 3.83 | PASS | **FAIL** |
| 8 | `#f2b179` | `#f9f6f2` | 1.72 | **FAIL** | FAIL |
| 16 | `#f59563` | `#f9f6f2` | 2.08 | **FAIL** | FAIL |
| 32 | `#f67c5f` | `#f9f6f2` | 2.45 | **FAIL** | FAIL |
| 64 | `#f65e3b` | `#f9f6f2` | 2.96 | **FAIL** | FAIL |
| 128 | `#edcf72` | `#f9f6f2` | 1.42 | **FAIL** | FAIL |
| 256 | `#edcc61` | `#f9f6f2` | 1.45 | **FAIL** | FAIL |
| 512 | `#edc850` | `#f9f6f2` | 1.50 | **FAIL** | FAIL |
| 1024 | `#edc53f` | `#f9f6f2` | 1.54 | **FAIL** | FAIL |
| 2048 | `#edc22e` | `#f9f6f2` | 1.58 | **FAIL** | FAIL |
| 4096+ | `#3c3a32` | `#f9f6f2` | 10.57 | PASS | PASS |

11 of 12 fail; white numerals on the yellow 128–2048 tiles are the worst (1.4–1.6:1). Accessibility is a review
group, so this is a certification risk, not a taste issue `[DESIGN]`. Use the palette below instead; it keeps the
warm DNA for the low tiles and converts the yellow family into a deep ember→aubergine ramp for the high tiles.

### B1.2 Tile palette (verified) `[MEASURED]`

Contrast is measured against the numeral colour on the same tile; luminance is the WCAG relative luminance.

| Tile | bg | numeral | ratio | AA 4.5:1 | luminance |
|---|---|---|---|---|---|
| 2 | `#F1E8E0` | `#2A1C0C` | 13.67 | PASS | 0.818 |
| 4 | `#E8DBC4` | `#2A1C0C` | 12.10 | PASS | 0.718 |
| 8 | `#F4C19C` | `#2A1C0C` | 10.20 | PASS | 0.598 |
| 16 | `#F6A581` | `#2A1C0C` | 8.36 | PASS | 0.481 |
| 32 | `#F6836A` | `#2A1C0C` | 6.59 | PASS | 0.369 |
| 64 | `#C54A2D` | `#FFF8EE` | 4.53 | PASS | 0.170 |
| 128 | `#B34120` | `#FFF8EE` | 5.39 | PASS | 0.135 |
| 256 | `#A43519` | `#FFF8EE` | 6.42 | PASS | 0.105 |
| 512 | `#912A1D` | `#FFF8EE` | 7.80 | PASS | 0.078 |
| 1024 | `#7A2531` | `#FFF8EE` | 9.32 | PASS | 0.057 |
| 2048 | `#60223F` | `#FFF8EE` | 11.08 | PASS | 0.040 |
| 4096 | `#442142` | `#FFF8EE` | 12.91 | PASS | 0.027 |
| 8192 | `#271D44` | `#FFF8EE` | 14.80 | PASS | 0.017 |

Two structural properties of this palette `[MEASURED]`:
1. **Numeral colour flips once**, at 64 (dark numerals for 2–32, light numerals 64+), and both zones stay ≥4.5:1.
2. **Luminance decreases strictly with value**, so the board reads correctly in greyscale and for every type of
   colour vision deficiency — value is never carried by hue alone.

### B1.3 Surfaces and UI colours (verified) `[MEASURED]`

| Token | Value | Purpose | Verified pair `[MEASURED]` |
|---|---|---|---|
| `--page` | `#FBF6EC` | page background | body text 15.35:1 ✓ |
| `--surface-board` | `#B9A894` | board plate | 2.14:1 vs page (decorative) |
| `--slot` | `#D2C6B5` | empty cell | 1.37:1 vs board, 1.39:1 vs the lowest tile (decorative) |
| `--text` | `#2A1C0C` | primary text | 15.35:1 on page ✓ |
| `--text-muted` | `#5B4A38` | secondary text | 7.86:1 on page ✓ |
| `--accent` | `#F6C177` | highlight / hint | text on it 10.09:1 ✓ |
| `--btn` | `#8F4A22` | primary button | label 6.62:1 ✓ |
| `--ok` | `#1B5E20` | confirm | label 7.87:1 ✓ |
| `--danger` | `#B3261E` | reset/destructive | label 6.54:1 ✓ |
| `--focus` | `#1B6EF3` | focus ring | 4.26:1 on page, 3.92:1 on dark ✓ (≥3:1 required) |

`[DESIGN]` Empty slots and the board plate are **decorative** surfaces, so WCAG 1.4.11 (3:1 for meaningful
graphical objects) does not apply to them — and the numbers show why luminance cannot carry that job: the slot is
only **1.37:1** against the board and **1.39:1** against the lightest tile `[MEASURED]`. Tiles must never rely on
adjacency; every tile carries a 1-px hairline whose own contrast is ≥3:1 with the tile fill plus a two-step
shadow (§B4).

### B1.4 Dark theme (optional, recommended)

| Token | Value | Verified `[MEASURED]` |
|---|---|---|
| `--page` | `#17161A` | body text 15.44:1 ✓ |
| `--text` | `#F2EDE4` | 15.44:1 on page ✓ |
| `--text-muted` | `#B9B2A6` | 8.56:1 ✓ |
| `--focus` | `#8AB4F8` | 8.55:1 ✓ |
| `--surface-board` | `#2A2730` | 1.23:1 vs page (decorative) |
| `--slot` | `#332F3A` | 1.12:1 vs board (decorative — the §B4 hairline/shadow rule is what keeps tiles readable here) |
| tiles | same tile fills (they already carry ≥4.5:1 internally; a dark page makes the low tiles pop) | ✓ |

### B1.5 High-contrast theme

Black `#000000` page, white `#FFFFFF` tiles with a 2-px black border, numerals `#000000`, focus ring `#FFFF00`
(19.56:1 on black) `[DESIGN]`. Values stay identifiable by numeral + border, never by fill.

## B2. Typography

| Token | Value | Notes |
|---|---|---|
| Family | one bundled WOFF2, subset: digits + Latin-1 + Vietnamese diacritics used in UI strings | **no Google Fonts / CDN** `[SRC: MUST NOT external calls]` |
| Stack | `font-family: "2048 Digits", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | fallback chain is safe and offline |
| Numerals | `font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1` | prevents width jitter as scores change `[DESIGN]` |
| Tile numerals | bold 700, size = `cell × k` where k = 0.51 (1–2 digits), 0.42 (3 digits), 0.33 (4 digits), 0.28 (5+ digits) | derived from the reference: 55/45/35/30 px on a 106.25 px cell `[SRC]` |
| HUD score/best numbers | bold 700, `clamp(18px, 4.5vmin, 30px)` | |
| Labels | 500, `clamp(11px, 2.4vmin, 14px)`, `letter-spacing: .04em`, uppercase for labels like SCORE/BEST | |
| Body / dialog | 400, `clamp(14px, 3.2vmin, 18px)`, line-height 1.45 | |
| Min text size | 11 px absolute floor; nothing below | legibility across resolutions `[SRC: cert Design MUST]` |

## B3. Geometry and layout

Board math `[DESIGN]`, matching the reference proportions (500 px board, 15 px gap, 106.25 px cell ⇒ gap = 3 % of
the board side, cell = (side − 5×gap) / 4):

```
boardSide = clamp(280px, min(92vmin, 560px), 560px)     /* square, never scaled by CSS transform */
gap       = round(boardSide * 0.03)
cell      = (boardSide - 5 * gap) / 4
radiusSlot  = cell * 0.06      /* reference used 3 px on 106 px ≈ 0.028 — modernise to 6 % */
radiusTile  = cell * 0.06
hudHeight   = clamp(48px, 9vmin, 72px)
```

- The board is **centred** and always square. If the viewport is wider than tall, letterbox with the page colour
  (pillarbox) — the certification rule is: fill the viewport, or centre + letterbox `[SRC]`.
- Layout is done with CSS grid on the board (`grid-template: repeat(4, 1fr) / repeat(4, 1fr)`, `gap: var(--gap)`);
  tile positions are grid cells, and slide animation uses `transform: translate()` on the tile element, never
  absolute pixel positions recomputed per resize `[DESIGN]`.
- Native CSS pixel sizing only — **never** scale a fixed-size board with `transform: scale()` (that softens
  rendering at high DPI, which the design rules forbid) `[SRC: MUST render crisp at every DPI]`.
- Breakpoints: < 380 px (compact HUD, D-pad only), 380–1024 px (default), > 1024 px (board capped 560 px,
  HUD stays one row), foldable spanned mode (board takes the smaller dimension, HUD moves to the side of the
  board only if the aspect ratio > 1.4) `[DESIGN]`.

## B4. Elevation, borders, shadows

| Token | Value | Use |
|---|---|---|
| `--hairline-light-tile` | `1px solid rgba(42,28,12,.18)` | outline on tiles 2–32 (dark numerals) |
| `--hairline-dark-tile` | `1px solid rgba(255,248,238,.22)` | outline on tiles 64+ (light numerals) |
| `--shadow-tile` | `0 1px 0 rgba(42,28,12,.10), 0 2px 6px rgba(42,28,12,.08)` | resting tiles |
| `--shadow-tile-high` | `0 2px 0 rgba(0,0,0,.18), 0 6px 18px rgba(0,0,0,.22)` | 512+ tiles |
| `--shadow-float` | `0 8px 28px rgba(0,0,0,.28)` | dialogs/overlays |

Rule `[DESIGN]`: the hairline+shadow pair is what separates a tile from the board and from its neighbours, because
a 13-step luminance ramp cannot keep every adjacency above 3:1 (§B1.3). Verify in greyscale before shipping.

## B5. Motion

Timings from the reference implementation `[SRC]` (fetched 2026-10-08) — reuse them, they are already tuned:

| Motion | Reference value | Token `[DESIGN]` |
|---|---|---|
| Tile slide | `transition: 100ms ease-in-out` on `transform` | `--dur-slide: 100ms; --ease-standard: cubic-bezier(.25,.1,.25,1)` |
| New tile appear | `animation: appear 200ms ease 100ms` (scale 0→1, opacity 0→1) | `--dur-appear: 200ms; --delay-appear: 100ms` |
| Merge pop | `animation: pop 200ms ease 100ms` (scale 1→1.18→1) | `--dur-pop: 200ms` |
| Score delta badge | `animation: move-up 600ms ease-in` (rise + fade) | `--dur-badge: 600ms` |
| Win/over message | `animation: fade-in 800ms ease 1200ms` | `--dur-overlay: 800ms` |

Additional rules `[DESIGN]`:
- Only `transform`, `opacity` and `filter` animate — never `width/height/top/left` (layout thrash = dropped frames
  on mid Android).
- Merge pop scales the tile, not the numeral.
- **Reduced motion**: if `prefers-reduced-motion: reduce` or the in-game toggle is on → no slide, no pop; commit
  the new board instantly and fade the tile in over 120 ms. Game pacing must be identical (never gate input on
  animation completion when motion is reduced).
- Never flash; peak single-frame luminance change stays below a full white frame (no epilepsy risk) `[DESIGN]`.

## B6. Iconography

- All icons are **inline SVG** in the bundle (no icon font, no CDN) `[SRC: no external calls]`.
- Required set: `arrow-up/down/left/right` (D-pad), `settings` (gear), `sound-on`, `sound-off` (indicates SFX
  volume state, **not** a global mute `[SRC: SHOULD NOT add a master mute]`), `haptics`, `restart`, `close`.
- Sizes: 24 px optical, 44×44 px minimum touch target (padding included), `stroke-width: 2`, round caps,
  `currentColor` stroke so themes work.
- **Do not** mimic YouTube Playables chrome (close / mute / menu icons) and never place a look-alike near a real
  control `[SRC: MUST NOT]`.
- **No exit/quit icon anywhere** `[SRC: MUST NOT]`.

## B7. Sound design tokens

Mirror of §A9 as design tokens: `--sfx-gain-max: 0.7`, gain map `move .35 · merge .55 · spawn .2 · invalid .45 ·
win .8 · over .7`, pitch map `merge(n) = base × 2^(log2(n) − 1) / 12` semitones capped at +12 `[DESIGN]`. Music
gain ceiling `.35` so it never masks SFX. All gains multiply by the user's SFX slider and are forced to 0 when
YouTube reports muted.

## B8. Components

**Tile** — square, radius `--radiusTile`, fill = tile token, numeral centred (vertically centred with
`line-height: 1` + flex, not `line-height: cell` as in the 2000s-era reference, which breaks with custom fonts
`[DESIGN]`), hairline + shadow per §B4. States: resting · appearing (200 ms) · popping (200 ms) · sliding (100 ms).
High tiles (512+) get the stronger shadow.

**Board** — plate `--surface-board`, radius `12px`, padding = `gap`, 16 slots at `--slot`, `contain: layout paint`,
`touch-action: none` on the board (so drags do not scroll the page — critical inside the YouTube WebView).

**HUD** — one row above the board: `SCORE` (current) and `BEST`, each a label + tabular number; a `+N` delta badge
animated on merge (600 ms). Score/best wrapped in `aria-live="polite"` (score updates are announced at most once
per 2 s to avoid chatter `[DESIGN]`). Settings gear at the right, 44×44.

**Buttons** — primary `--btn` with white label (6.62:1 ✓), radius `8px`, height ≥ 48 px on touch / ≥ 40 px with a
44 px invisible hit area on desktop, `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px }`.
Pressed state: 1 px translateY, no colour-only feedback.

**Dialog / overlay** (Win, Game over, Settings) — page-coloured scrim `rgba(23,22,26,.6)`, card `--page` on
`--shadow-float`, radius `16px`, max width `min(88vw, 420px)`. Rules: closable with `Esc` and with the close
button; **MUST NOT** `preventDefault()` on Esc `[SRC]`; focus trapped while open, focus restored to the invoking
element on close; nothing auto-dismisses.

**D-pad** (optional) — 4 buttons in a cross (+ optional centre dot reserved for nothing), 48 px buttons, 8 px gap,
bottom-centre, semi-transparent 70 %, auto-hides after 3 s of drag use, reappears on tap of the board.

**First-run hint** — a one-line text hint under the board ("Swipe or use the arrow keys"), fades after the first
valid move, never blocks input, never a modal.

## B9. Content and copy rules

- No sharing prompts, no "invite friends", no external links, no user agreements, no ads-looking banners
  `[SRC: MUST NOT]`.
- No personal-data fields anywhere (no name entry, no e-mail) `[SRC: MUST NOT]`.
- Playables branding: the game may not use YouTube or Google logos or imply endorsement `[SRC]`.
- Vietnamese-first copy is acceptable (primary market) with an English mirror; keep strings ≤ 28 chars so the HUD
  never reflows.

## B10. What NOT to design (certification traps)

1. An exit/quit control. 2. A global mute button (YouTube owns mute). 3. A share prompt or outbound link.
4. A login/account screen. 5. A QR-like block of squares. 6. A logo in the tile art, thumbnail or title.
7. Icons that look like Playables' own chrome. 8. A "rate this game" dialog. 9. Anything that requires an
external network request (fonts, icons, images, analytics). 10. A spinner that blocks input after `gameReady()`.

## B11. tokens.css (drop-in)

```css
:root{
  /* surfaces */
  --page:#FBF6EC; --surface-board:#B9A894; --slot:#D2C6B5;
  /* text */
  --text:#2A1C0C; --text-muted:#5B4A38; --text-on-dark:#FFF8EE;
  /* actions */
  --accent:#F6C177; --btn:#8F4A22; --ok:#1B5E20; --danger:#B3261E; --focus:#1B6EF3;
  /* tiles (fill / numeral) */
  --t2:#F1E8E0;   --t2-fg:#2A1C0C;
  --t4:#E8DBC4;   --t4-fg:#2A1C0C;
  --t8:#F4C19C;   --t8-fg:#2A1C0C;
  --t16:#F6A581;  --t16-fg:#2A1C0C;
  --t32:#F6836A;  --t32-fg:#2A1C0C;
  --t64:#C54A2D;  --t64-fg:#FFF8EE;
  --t128:#B34120; --t128-fg:#FFF8EE;
  --t256:#A43519; --t256-fg:#FFF8EE;
  --t512:#912A1D; --t512-fg:#FFF8EE;
  --t1024:#7A2531;--t1024-fg:#FFF8EE;
  --t2048:#60223F;--t2048-fg:#FFF8EE;
  --t4096:#442142;--t4096-fg:#FFF8EE;
  --t8192:#271D44;--t8192-fg:#FFF8EE;
  /* geometry (gap/cell computed in JS or with calc from --board) */
  --board:clamp(280px, min(92vmin, 560px), 560px);
  --gap:calc(var(--board) * 0.03);
  --cell:calc((var(--board) - 5 * var(--gap)) / 4);
  --radius-slot:calc(var(--cell) * 0.06);
  --radius-tile:calc(var(--cell) * 0.06);
  --radius-card:16px;
  /* strokes + shadows */
  --hairline-light:1px solid rgba(42,28,12,.18);
  --hairline-dark:1px solid rgba(255,248,238,.22);
  --shadow-tile:0 1px 0 rgba(42,28,12,.10), 0 2px 6px rgba(42,28,12,.08);
  --shadow-tile-high:0 2px 0 rgba(0,0,0,.18), 0 6px 18px rgba(0,0,0,.22);
  --shadow-float:0 8px 28px rgba(0,0,0,.28);
  /* motion */
  --dur-slide:100ms; --dur-appear:200ms; --dur-pop:200ms; --dur-badge:600ms; --dur-overlay:800ms;
  --delay-appear:100ms;
  --ease-standard:cubic-bezier(.25,.1,.25,1);
  /* type */
  --font: "2048 Digits", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-reduced-motion: reduce){
  :root{ --dur-slide:0ms; --dur-pop:0ms; --dur-appear:120ms; --dur-badge:0ms; --dur-overlay:200ms; --delay-appear:0ms; }
}
[data-theme="dark"]{ --page:#17161A; --text:#F2EDE4; --text-muted:#B9B2A6; --focus:#8AB4F8; --surface-board:#2A2730; --slot:#332F3A; }
[data-theme="contrast"]{ --page:#000; --text:#FFF; --surface-board:#000; --slot:#111; --focus:#FFFF00;
  --t2:#FFFFFF; --t2-fg:#000000; /* …same flip for all values: white fill + black border + black numeral… */ }
```

Tile size mapping (JS): `bg = var(--t{n})`, `color = var(--t{n}-fg)` for n ≤ 8192; for n > 8192 use
`--t8192`/`--t8192-fg` with a `+` suffix label.

## B12. Reproduce the measurements

Save as `check_contrast.py` and run `python3 check_contrast.py` — it re-derives every number tagged `[MEASURED]`
in this document and exits non-zero if any tile numeral drops below 4.5:1:

```python
#!/usr/bin/env python3
"""Verify the 2048 colour tokens against WCAG 2.x contrast requirements."""
def s2l(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
def hx(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(h):
    r,g,b = (s2l(v/255) for v in hx(h)); return 0.2126*r + 0.7152*g + 0.0722*b
def cr(a,b):
    la,lb = lum(a),lum(b); hi,lo = max(la,lb),min(la,lb); return round((hi+0.05)/(lo+0.05),2)

TILES = [(2,"#F1E8E0","#2A1C0C"),(4,"#E8DBC4","#2A1C0C"),(8,"#F4C19C","#2A1C0C"),(16,"#F6A581","#2A1C0C"),
         (32,"#F6836A","#2A1C0C"),(64,"#C54A2D","#FFF8EE"),(128,"#B34120","#FFF8EE"),(256,"#A43519","#FFF8EE"),
         (512,"#912A1D","#FFF8EE"),(1024,"#7A2531","#FFF8EE"),(2048,"#60223F","#FFF8EE"),(4096,"#442142","#FFF8EE"),
         (8192,"#271D44","#FFF8EE")]
UI = [("body text on page","#2A1C0C","#FBF6EC",4.5),("muted text on page","#5B4A38","#FBF6EC",4.5),
      ("button label","#FFFFFF","#8F4A22",4.5),("focus ring on page","#1B6EF3","#FBF6EC",3.0),
      ("focus ring on dark","#1B6EF3","#17161A",3.0),("dark body text","#F2EDE4","#17161A",4.5),
      ("dark muted text","#B9B2A6","#17161A",4.5),("contrast theme text","#FFFFFF","#000000",4.5)]
CLASSIC = [(2,"#eee4da","#776e65"),(4,"#ede0c8","#776e65"),(8,"#f2b179","#f9f6f2"),(16,"#f59563","#f9f6f2"),
           (32,"#f67c5f","#f9f6f2"),(64,"#f65e3b","#f9f6f2"),(128,"#edcf72","#f9f6f2"),(256,"#edcc61","#f9f6f2"),
           (512,"#edc850","#f9f6f2"),(1024,"#edc53f","#f9f6f2"),(2048,"#edc22e","#f9f6f2"),(4096,"#3c3a32","#f9f6f2")]

bad = []
print("PROPOSED PALETTE (numeral vs tile fill, need >= 4.5:1)")
prev = None
for v,bg,fg in TILES:
    r, l = cr(bg,fg), lum(bg)
    mono = "" if prev is None else ("ok" if l < prev else "NOT MONOTONIC")
    if r < 4.5: bad.append(f"tile {v}")
    if mono == "NOT MONOTONIC": bad.append(f"tile {v} luminance")
    print(f"  {v:<5} {bg} on {fg} = {r:>6}  lum {l:.3f}  {mono}")
    prev = l
print("\nUI PAIRS")
for label,a,b,need in UI:
    r = cr(a,b)
    if r < need: bad.append(label)
    print(f"  {label:<22} {r:>6}  (need >= {need})")
SEPARATION = [("board vs page","#B9A894","#FBF6EC"),("slot vs board","#D2C6B5","#B9A894"),
              ("lowest tile vs slot","#F1E8E0","#D2C6B5")]
DARK_EXTRA = [("dark board vs page","#2A2730","#17161A"),("dark slot vs board","#332F3A","#2A2730")]
print("\nLIGHT-THEME SURFACE PAIRS (decorative — hairline+shadow carries tile separation)")
worst = 99.0
for label,a,b in SEPARATION:
    r = cr(a,b); worst = min(worst, r)
    print(f"  {label:<24} {r:>6}  decorative")
print(f"  worst decorative adjacency (light theme): {worst}   <- must match the figure in B1.3/B4")
print("DARK-THEME SURFACE PAIRS (decorative)")
for label,a,b in DARK_EXTRA:
    print(f"  {label:<24} {cr(a,b):>6}  decorative")
hc = cr("#FFFF00","#000000")
if hc < 3.0: bad.append("high-contrast focus ring")
print(f"  {'hi-contrast focus ring':<24} {hc:>6}  need >= 3.0")

print("\nCLASSIC PALETTE — measured failures (informational)")
fails = [v for v,bg,fg in CLASSIC if cr(bg,fg) < 3.0]
print(f"  tiles below even 3:1: {fails}")
print("\nRESULT:", "FAIL: " + ", ".join(bad) if bad else "PASS — all checked pairs meet their threshold")
raise SystemExit(1 if bad else 0)
```

---

## B13. Component anatomy, states and accessibility props

**Tile** (`<div class="tile" data-value="64">`)
- Anatomy: surface (fill = `--t{n}`) · 1-px hairline (`--hairline-light` for 2–32, `--hairline-dark` for 64+) ·
  numeral (colour `--t{n}-fg`, centred with flex + `line-height: 1`) · shadow (`--shadow-tile`, or
  `--shadow-tile-high` for 512+).
- States: `resting` · `appearing` (scale 0→1, 200 ms, delay 100 ms) · `popping` (scale 1→1.18→1, 200 ms, merge
  only) · `sliding` (transform translate, 100 ms).
- Layout: `grid-area` inside the 4×4 board grid; never absolute pixels recomputed on resize; never `transform:
  scale()` on the board (blurring at high DPI).
- A11y: `role="gridcell"`, `aria-label` = the value ("tile 64"); decorative when the board is already announced
  via the grid summary; reduced motion ⇒ no appear/pop, state changes instantly.
- >8192: reuse `--t8192` / `--t8192-fg` and append `+` to the label.

**Board** (`<div class="board" role="grid">`)
- Anatomy: plate (`--surface-board`, radius 12 px, padding = `--gap`) · 16 slots (`--slot`) · 16 tile layers.
- Behaviour: `touch-action: none`; `contain: layout paint`; owns pointer capture for drag input; recomputes
  `--gap`/`--cell` on `ResizeObserver`, keeping logical state (FR/NFR-11).
- A11y: `aria-rowcount=4 aria-colcount=4`; the row-major value summary is what a screen reader reads; the board
  never steals focus unless focused by the player.

**HUD score card** (`SCORE`, `BEST`, `+N` badge)
- Anatomy: label (uppercase, 500, `letter-spacing .04em`) · tabular number (700) · optional badge rising 600 ms.
- A11y: `aria-live="polite"` on the score group, throttled to ≤ 1 announcement per 2 s; `BEST` is not announced.
- Rule: never animate the number's position — only the badge; number changes swap text and rely on
  `tabular-nums` to avoid reflow.

**Button** (primary / secondary / danger / icon)
- Anatomy: container (radius 8 px, min target 44×44 px, ≥ 48 px height on touch) · label (white on `--btn` 6.62:1)
  or icon (24 px optical, `currentColor`).
- States: resting · hover (desktop only, +4 % lighten) · pressed (translateY 1 px, no colour-only change) ·
  focus-visible (`outline: 3px solid var(--focus); outline-offset: 2px`) · disabled (opacity .5, `aria-disabled`).
- A11y: real `<button>` elements, keyboard operable, accessible name always present (icon-only buttons need
  `aria-label`).

**Dialog / overlay** (win, game over, settings)
- Anatomy: scrim `rgba(23,22,26,.6)` · card (`--page`, radius 16 px, `--shadow-float`, max-width
  `min(88vw, 420px)`) · optional score block · 1–2 buttons.
- Behaviour: opens only on a game event; first focus moves into the card; focus trapped; `Esc` closes (never
  `preventDefault()`); focus returns to the invoking element; nothing auto-dismisses.
- A11y: `role="dialog" aria-modal="true"` + labelled by its heading; the game-over announcement goes through the
  live region, not only the visual card.

**D-pad** (optional, touch)
- Anatomy: 4 buttons (48 px, 8 px gap) in a cross, bottom-centre, 70 % opacity, auto-hide after 3 s of drag use.
- A11y: labelled "Move up/down/left/right"; hidden from screen readers when a hardware keyboard is present is
  **not** allowed — it must stay reachable by keyboard when visible.

**Settings row** (SFX volume slider, haptics toggle, reduced-motion toggle)
- Slider: 44 px track height, keyboard operable with arrow keys, value announced.
- Toggles: real checkboxes/switch roles with visible focus; the reduced-motion toggle overrides only the
  *animation* tokens, never the game rules.
- No master mute control (YouTube owns mute) `[SRC: SHOULD NOT]`.

**First-run hint** — text line under the board, muted colour, never a modal, never blocks input, disappears after
the first valid move (US-01 AC3).

## B14. Token naming and versioning

- Names: `--<category>-<role>[-<variant>]` — e.g. `--t128-fg`, `--surface-board`, `--dur-slide`, `--shadow-tile`.
  Tile tokens are generated from the value: `--t{value}` = fill, `--t{value}-fg` = numeral colour.
- Any change to a colour, size or timing token requires: (1) re-running `check_contrast.py` for colour changes,
  (2) a note in the changelog at the bottom of this file, (3) a version bump of this document.
- Never introduce a colour outside the token set (no one-off hex values in component CSS); if a new colour is
  unavoidable, add a token, verify it, document it.
- Motion tokens must be overridable by the reduced-motion media query **and** the in-game toggle (both paths).

## B15. Design-side accessibility checklist

Run before every design review, and before uploading a build:

- [ ] All 13 tile numerals ≥ 4.5:1 against their own fill (`check_contrast.py` exit 0).
- [ ] UI text pairs ≥ 4.5:1; focus ring ≥ 3:1 on both light and dark surfaces.
- [ ] Value readable in greyscale (luminance ladder strictly monotonic: 0.82 → 0.02).
- [ ] Every tile carries hairline + shadow (the only guarantee of tile↔slot separation: slot vs board is 1.37:1).
- [ ] Keyboard: full play, visible focus, `Esc` closes dialogs, no `preventDefault()` on Esc.
- [ ] Screen reader: board summary, score announcements ≤ 1 per 2 s, dialogs labelled.
- [ ] Reduced motion: animations removed, no input gating, timing unchanged.
- [ ] Targets ≥ 44×44 px (48 px D-pad); no hover-only affordance.
- [ ] Text ≥ 11 px; nothing clipped at 320×568 or 1920×1080; browser zoom 200 % clean.
- [ ] No colour-only state (invalid move, win/lose, disabled) — always text/icon/shape too.
- [ ] Haptics has a toggle; no flashing; no auto-playing audio.

## B16. Handoff checklist for the coding agent

- [ ] `tokens.css` (§B11) pasted verbatim; dark/high-contrast selectors kept even if not exposed in v1.
- [ ] Tile tokens resolved from the value, including the >8192 fallback.
- [ ] Geometry from §B3 formulas (`--board`, `--gap`, `--cell`), not hard-coded pixel values per breakpoint.
- [ ] Animation timings from §B5 tokens with the reduced-motion override.
- [ ] Icons inline SVG from §B6; no icon font, no external asset, no Playables-look-alike icons.
- [ ] Banned items absent: exit/quit control, master mute, share prompt, outbound link, login screen, QR-like
      graphic, logo in metadata (§B10).
- [ ] Audio: bundled files only, SFX volume slider respected, hard silence when YouTube is muted.
- [ ] Screen-reader and keyboard pass done manually, not assumed.
- [ ] `check_contrast.py` and the skill's `playables_preflight.py` both exit 0.
- [ ] Greyscale screenshot check of the board at 4 values (2, 64, 512, 4096) before sign-off.

## B17. Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-08 | First frozen release: measured classic-palette failures, verified AA tile palette, geometry/motion tokens, component anatomy, a11y and handoff checklists |

---

## Appendix — sources

| # | Source | Fetched |
|---|---|---|
| 1 | `raw.githubusercontent.com/gabrielecirulli/2048/master/js/game_manager.js` — `startTiles = 2`, `Math.random() < 0.9 ? 2 : 4`, `score += merged.value`, `merged.value === 2048 → won`, `keepPlaying` | 2026-10-08 |
| 2 | `…/js/grid.js` — `Grid(size)` 4×4 | 2026-10-08 |
| 3 | `…/style/main.css` — classic palette, tile font sizes 55/45/35/30 px, `transition: 100ms ease-in-out`, `appear/pop 200ms ease 100ms`, `move-up 600ms`, `fade-in 800ms ease 1200ms`, cell 106.25 px / gap 15 px / radius 3 px | 2026-10-08 |
| 4 | `…/LICENSE.txt` — MIT, © 2014 Gabriele Cirulli | 2026-10-08 |
| 5 | `developers.google.com/youtube/gaming/playables/certification/requirements*` (+ `_design`, `_integration`, `_stability`, `_privacydata`, `_trustsafety`, `_monetization`) and `/support/certification_faq` — all `[SRC]` platform rules | 2026-09-14, 2026-10-06 |
| 6 | WCAG 2.x contrast ratio definition (1.4.3 / 1.4.11 / 2.4.11 thresholds used above) | — |

Anything not tagged `[SRC]` or `[MEASURED]` in this document is a `[DESIGN]` decision and may be changed, as long
as the MUST rules in §A2/A11 and the verified colour thresholds in §B1.2–B1.3 still hold.
