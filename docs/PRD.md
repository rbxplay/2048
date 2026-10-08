# 2048 — PRD (Product Requirements Document)

| Field | Value |
|---|---|
| Product | **2048** (working title — final title TBD, see §12) |
| Platform | **YouTube Playables** (web SPA embedded in YouTube) |
| Version | 1.0 |
| Date | 2026-10-08 |
| Status | **Ready to build** — requirements frozen enough for implementation |
| Audience of this document | the coding agent (Claude Code / Codex / opencode / Antigravity / Cursor / Hermes) and the human reviewing it |
| Companion documents | `2048-DesignSystem.md` (all visual/interaction tokens), `check_contrast.py` (re-derives every `[MEASURED]` number), skill `youtube-playables-game-dev` (platform rules, SDK wrapper, pre-flight checker) |
| Supersedes | `2048-playables-spec-and-design-system.md` (single combined file; kept as the merged source) |

## 0. How to use this document

1. **§1–§16 are the PRD**: goals, audience, user stories, the requirement indexes with IDs and levels, risks and
   release plan. Read these first.
2. **§17 is the detailed specification** (the `A`-prefixed sections). The `A` IDs are **stable anchors** — the
   requirement indexes in §5–§10 and the design system both reference them, so never renumber them.
3. Requirement language follows **RFC 2119**: MUST / MUST NOT = mandatory, SHOULD / SHOULD NOT = strong
   recommendation, MAY = optional. The English certification text governs over any paraphrase.
4. Provenance tags used in both documents: `[SRC]` = verbatim from an authoritative source (the original 2048
   source code or Google's Playables certification documentation), `[MEASURED]` = computed by a script in this
   repo (reproducible), `[DESIGN]` = a decision made here, changeable as long as the MUST rules and the measured
   colour thresholds still hold.
5. Anything not nailed down by a MUST is a `[DESIGN]` choice: implement it as written, or improve it and record
   the change — but never violate §7 (non-functional) or §8 (accessibility).

### Glossary

| Term | Meaning |
|---|---|
| Tile | a numbered block on the board; value is a power of two |
| Slot | an empty cell of the board (decorative surface, §B1.3 of the design system) |
| Move | one directional input that slides all tiles; only counts if the board changed |
| Merge | two equal tiles combining into one tile of double value |
| Milestone | a game event that triggers persistence (start, threshold, win, game over, pause, 30 s tick) |
| Save | the single JSON blob persisted through the Playables SDK (`saveData`) |
| SPA | single-page application — required by the platform |
| Post-compression size | size after the CDN serves the file gzip/brotli-compressed; this is what the bundle limits are measured on |
| SDK Test Suite | Google's hosted harness that replays a build and logs every SDK call and the real bundle size |
| Developer Portal | Google's portal where the game, its metadata and its monetization toggles are configured |

## 1. Problem, opportunity & rationale

- **Context.** Playables is a short-session, mobile-first catalog inside YouTube. Simple, instantly-readable
  mechanics travel well; anything needing a tutorial, a content pipeline or a server is a bad fit.
- **Why 2048.** The mechanic is fully specified and deterministic (no balancing, no level design, no live
  content, no multiplayer), so the product is: game logic + design tokens + SDK integration. Engineering risk is
  low; the realistic failure modes are certification details (audio, save, pause, accessibility, bundle size),
  which this PRD pins down explicitly.
- **Reuse position.** The canonical implementation (Gabriele Cirulli, 2014) is **MIT licensed** `[SRC]`; the
  rules are reimplemented here from §17 rather than copied, so the shipped artifact only carries original code,
  art and audio (§12).
- **Honest limits.** This document contains no invented market or competitor numbers. Platform analytics expose
  only plays (7 / 28 / all-time), age, country and gender today `[SRC]` — no retention, DAU, session time or
  crash reports per game — so §2 measures success at session level and through local save-derived metrics.

## 2. Goals, non-goals and success metrics

**Goals**

| ID | Goal |
|---|---|
| G1 | A player understands the game and makes a valid move within 5 seconds of `gameReady()`, with no tutorial |
| G2 | A full run is playable start→game over on a phone, one-handed, in 2–5 minutes |
| G3 | Progress survives app switches, reloads and version upgrades via SDK cloud save |
| G4 | The build passes certification on the first submission attempt |
| G5 | The whole product stays under 1.5 MiB initial bundle so load time is never the bottleneck |

**Non-goals (v1).** Accounts · leaderboards · multiplayer · IAP (unavailable) · analytics · servers · level or
XP progression · board sizes other than 4×4 · daily challenges · themes store.

**Success metrics**

| ID | Metric | Target | How measured |
|---|---|---|---|
| M1 | Median session length | 2–5 min | derived locally from `stats.games` + timestamps in the save (no analytics allowed) |
| M2 | Initial bundle (post-compression) | ≤ 400 KiB gzip, ≤ 1.5 MiB raw | SDK Test Suite on the uploaded build + official bundle analyzer |
| M3 | Crash-free sessions | zero reproducible crashes; 30-min soak on mid Android | manual + DevTools; no crash reporting exists on the platform |
| M4 | Frame budget | ≤ 8 ms/frame on a mid Android phone; heap peak ≤ 60 MB | DevTools performance profile in the WebView |
| M5 | Colour accessibility | all 13 tile numerals and all UI text ≥ 4.5:1 | `python3 check_contrast.py` → exit 0 |
| M6 | Time to first move | < 5 s after `gameReady()` | manual timing on mobile web |

## 3. Audience, platforms and session shape

- **Primary audience:** 13+, casual, mobile-first, Vietnamese-speaking primary market with an English mirror
  (§10). Session shape: pick up, play one run, put down; no return obligation, no streak pressure.
- **Platforms to support:** YouTube desktop web (Chrome, Firefox, Edge), YouTube mobile web, YouTube for Android,
  YouTube for iOS — the four environments certification tests `[SRC]`.
- **Devices and views:** 320×568 through 1920×1080, both orientations, foldables (and mid-game resize),
  DPR 1–3. The game must never lock orientation or block device posture changes `[SRC]`.
- **Inputs:** touch (primary), mouse (required for every interaction), keyboard (arrows/WASD, SHOULD), optional
  on-screen D-pad for accessibility and discoverability.
- **Network:** irrelevant at runtime — the game makes no external requests at all `[SRC]`; only the SDK's own
  script loads from YouTube.

## 4. User stories and acceptance criteria

**US-01 — First play without a tutorial**
As a new player I want to understand instantly what to do, so that I start playing without reading.
- AC1: on `gameReady()` the board shows 2 tiles and one line of hint text; no modal blocks input.
- AC2: a pointer drag or arrow key produces a visible slide and spawns one new tile.
- AC3: the hint disappears after the first valid move and never returns in the same save.

**US-02 — Core loop**
As a player I want to merge tiles and watch my score grow, so that the loop feels rewarding.
- AC1: merging two equal tiles replaces them with their sum at the far edge in the move direction.
- AC2: score increases by exactly the merged value; a `+N` badge animates once.
- AC3: a tile merges at most once per move (`2 2 2 2` + left ⇒ `4 4`, not `8`) `[SRC]`.
- AC4: an input that changes nothing produces an invalid-move feedback, no spawn, no move count change.

**US-03 — Progress persistence**
As a player I want to close YouTube and come back to the same board.
- AC1: board, score, best, moves and settings restore after reload.
- AC2: a save written by an older build loads without a crash, missing fields defaulted.
- AC3: no `localStorage`/`sessionStorage`/`indexedDB`/cookie write exists in the shipped bundle.

**US-04 — Winning**
As a player I want to be rewarded when I reach 2048, and to continue if I want.
- AC1: creating a 2048 tile opens the win overlay with the final score.
- AC2: "Keep playing" resumes the same run; the overlay also offers "New game".
- AC3: the win is recorded (`won: true`) in the save and does not block `sendScore`.

**US-05 — Losing and retrying**
As a player I want a clear end state and a fast retry.
- AC1: the game-over overlay appears only when the board is full and no adjacent equal pair exists `[SRC]`.
- AC2: "Retry" starts a fresh run with 2 tiles and score 0 while `best` is preserved.
- AC3: an interstitial may be requested at most every second game over, never within the first 30 s of a session.

**US-06 — My audio settings are respected**
As a player I want the game silent when YouTube is muted.
- AC1: with YouTube muted, the game produces no audio output at all `[SRC]`.
- AC2: toggling YouTube mute mid-run takes effect immediately.
- AC3: the in-game control is an SFX/noise volume slider, not a master mute `[SRC: SHOULD NOT]`.

**US-07 — Interruptions**
As a player I want to switch apps and come back without losing anything.
- AC1: `onPause()` freezes the run, mutes audio and writes a save `[SRC]`.
- AC2: `onResume()` continues from the exact same state; no time-based penalty accrues while paused.
- AC3: no `visibilitychange` listener exists in the build `[SRC: MUST NOT]`.

**US-08 — Accessibility**
As a keyboard, screen-reader or reduced-motion user I want to play on equal terms.
- AC1: the whole game is playable with arrows/WASD alone, with a visible focus ring.
- AC2: the board is exposed as a 4×4 grid of values; score/best announced politely (≤ 1 announcement / 2 s).
- AC3: with `prefers-reduced-motion: reduce`, board state updates instantly, input is never gated on animation.
- AC4: every button has a ≥ 44×44 px target.

**US-09 — Rewarded undo (optional, v1.1)**
As a player I want a second chance without paying.
- AC1: the option appears only after a move, only once per run, and only when the player taps it.
- AC2: it calls `requestRewardedAd('undo-last-move')`; if no ad is available the game continues silently.
- AC3: the undo restores the previous board+score from the in-memory snapshot, never from a fabricated state.

## 5. Functional requirements index

| ID | Requirement | Level | Spec |
|---|---|---|---|
| FR-01 | 4×4 board, 16 cells | MUST | §A3 |
| FR-02 | Exactly 2 starting tiles | MUST | §A3 |
| FR-03 | New tile is 2 with p=0.9, 4 with p=0.1 | MUST | §A3 |
| FR-04 | Full-line slide + one merge per tile per move | MUST | §A3, §A4 |
| FR-05 | Score += merged value | MUST | §A3, §A7 |
| FR-06 | No spawn and no move count on a no-op input | MUST | §A3 |
| FR-07 | Win at 2048, then optional "keep playing" | MUST | §A3 |
| FR-08 | Game over iff board full and no adjacent equal pair | MUST | §A3 |
| FR-09 | New game / retry always available; `best` preserved | MUST | §A7 |
| FR-10 | Settings: SFX volume, haptics toggle, reduced-motion toggle | MUST | §A11, design system §B8 |
| FR-11 | End-of-content notice (win / game-over overlay with final score) | MUST | §A7 |
| FR-12 | No exit/quit control, no share prompt, no outbound link, no login-like screen | MUST NOT | §A2, design system §B10 |
| FR-13 | Optional rewarded undo, once per run | MAY | §A8 |
| FR-14 | Board size parameterised so 5×5 is possible later | MAY | §17 §A3 |

## 6. Integration requirements index (SDK)

| ID | Requirement | Level | Spec |
|---|---|---|---|
| INT-01 | SDK script `<script src="https://www.youtube.com/game_api/v1">` before any game code | MUST | §A5 |
| INT-02 | `firstFrameReady()` while a loading screen is visible | MUST | §A5 |
| INT-03 | `await loadData()` before the first `saveData()` | MUST | §A5, §A6 |
| INT-04 | `gameReady()` only when the player can interact | MUST | §A5 |
| INT-05 | `saveData()` at milestones (start, thresholds, win, over, pause, ≥1 s debounce) | MUST / SHOULD | §A5, §A6 |
| INT-06 | Progress stored only through the SDK — no browser or engine storage | MUST NOT | §A6 |
| INT-07 | Older/newer/corrupt saves load without crashing | MUST | §A6 |
| INT-08 | `sendScore({value: best})` value identical to `best` in the save | MUST | §A7 |
| INT-09 | Respect `isAudioEnabled()` / `onAudioEnabledChange()`; no master mute button | MUST / SHOULD NOT | §A9 |
| INT-10 | Pause/resume only via `onPause`/`onResume`; Page Visibility API banned | MUST / MUST NOT | §A5 |
| INT-11 | Flush save on pause | SHOULD | §A5 |
| INT-12 | Ads only through SDK ad APIs, with fallback, plus the portal monetization toggle | MUST | §A8 |
| INT-13 | No external URL/service calls from the game | MUST NOT | §A2 |
| INT-14 | Single-page application, no obfuscated code | MUST | §A2 |

Reference implementation for INT-01…INT-11: the framework-neutral wrapper `assets/playables-bootstrap.js` in the
`youtube-playables-game-dev` skill (already written and tested: no-SDK fallback for local dev, UTF-16-safe save,
version-tolerant load, ad fallbacks). Use it rather than re-implementing the life-cycle.

## 7. Non-functional requirements index

| ID | Requirement | Target | Level |
|---|---|---|---|
| NFR-01 | Initial bundle (post-compression) | ≤ 400 KiB gzip / ≤ 1.5 MiB raw | target (limits: < 30 MiB MUST, < 15 MiB SHOULD) |
| NFR-02 | Total bundle | ≤ 3 MiB | target (limit < 250 MiB) |
| NFR-03 | File count | ≤ 40 | target (limit ≤ 8000) |
| NFR-04 | Largest single file | ≤ 512 KiB, music loop ≤ 300 KiB | SHOULD |
| NFR-05 | Cloud save payload | ≤ 1 KiB (limit < 3 MiB, SHOULD < 500 KiB) | MUST |
| NFR-06 | Interactive | < 3 s on mobile web | SHOULD (< 5 s) |
| NFR-07 | JS heap peak | ≤ 60 MB | target (limit 512 MB) |
| NFR-08 | Frame time | ≤ 8 ms/frame @60 fps, no per-frame allocation in the hot path | target |
| NFR-09 | Relative paths only; filenames `[A-Za-z0-9._-]` | 100 % of files | MUST |
| NFR-10 | Absolute paths, external requests, WASM, `eval()`, Web workers | none | MUST NOT / risk |
| NFR-11 | Resize mid-game keeps state; nothing clipped 320×568 → 1920×1080 | verified | MUST |

## 8. Accessibility requirements index

| ID | Requirement | Threshold | Spec |
|---|---|---|---|
| A11Y-01 | Tile numeral vs its tile fill | ≥ 4.5:1 (all 13 values) | design system §B1.2 |
| A11Y-02 | UI text vs background | ≥ 4.5:1 | design system §B1.3 |
| A11Y-03 | Focus indicator vs adjacent colours | ≥ 3:1, always visible on keyboard focus | design system §B1.3, §B8 |
| A11Y-04 | Full keyboard play; `Esc` closes dialogs; `preventDefault()` on Esc forbidden | — | §A11 |
| A11Y-05 | Screen-reader exposure: 4×4 grid of values, `aria-live` score (≤ 1 / 2 s) | — | §A11 |
| A11Y-06 | Reduced motion honoured (instant state change, no gating of input) | — | design system §B5 |
| A11Y-07 | Target size | ≥ 44×44 px (48 px D-pad) | design system §B8 |
| A11Y-08 | Value never conveyed by colour alone — numeral always present, palette luminance strictly monotonic | — | design system §B1.2 |
| A11Y-09 | Haptic feedback has an on/off control | — | §A1, §A11 |
| A11Y-10 | Browser zoom to 200 % and OS text scaling do not clip or overlap UI | — | §A11 |

## 9. Monetization requirements index

| ID | Requirement | Level | Spec |
|---|---|---|---|
| MO-01 | No off-platform ads or purchases of any kind | MUST NOT | §A8 |
| MO-02 | Interstitial only via `requestInterstitialAd()`, at a natural break, with fallback | MUST | §A8 |
| MO-03 | Rewarded only via `requestRewardedAd('<unique-readable-id>')`, player-initiated, IDs free of user data | MUST | §A8 |
| MO-04 | Portal monetization toggle must be enabled to match the code | MUST | §A8 |
| MO-05 | Ads must never gate core play (every ad path has a non-ad fallback) | MUST | §A8 |
| MO-06 | Mute + pause behaviour still honoured while ads are active | MUST | §A9 |

## 10. Localization requirements index

| ID | Requirement | Level | Spec |
|---|---|---|---|
| LM-01 | Language from `await ytgame.system.getLanguage()` | MUST | §A10 |
| LM-02 | Bundle at least `en` and `vi` strings | MUST | §A10 |
| LM-03 | Font subset covers all UI diacritics; no external font requests | MUST | §A10, design system §B2 |
| LM-04 | Strings ≤ 28 chars so the HUD never reflows | SHOULD | §A10 |
| LM-05 | Logical CSS properties (`margin-inline`, `padding-inline`) for RTL safety | SHOULD | §A10 |

## 11. Design requirements

The visual, motion and component contract lives in **`2048-DesignSystem.md`** and is normative for anything the
player sees: colour tokens and their measured contrast, typography and tile-size formulas, board geometry,
elevation rules, motion timings, icon set, sound tokens, component anatomy and the certification anti-pattern
list. Requirements from certification that constrain design `[SRC]`: responsive and state-preserving on resize,
centred letterboxing if the viewport is not filled, no orientation lock, touch **and** mouse for every
interaction, no UI errors, `Esc` closes dialogs, crisp rendering at every resolution and DPI, no branding/logo in
metadata, and the flat bans (exit button, share prompts, outbound links, extra agreements, Playables-look-alike
icons).

## 12. Content, IP and legal

| ID | Requirement | Level |
|---|---|---|
| IP-01 | All code original or MIT-attributed; ship the licence notice if any MIT code is reused `[SRC]` | MUST |
| IP-02 | Original art and audio, or licences documented in the repo (music + personality rights cleared) `[SRC]` | MUST |
| IP-03 | Final product name must not imply YouTube/Google endorsement and must not use third-party logos `[SRC]` | MUST |
| IP-04 | Verify the Playables catalog for an existing near-identical game before submitting; differentiate or choose another concept `[SRC: MUST NOT duplicate]` | MUST |
| IP-05 | Audience 13+, never "made for kids" `[SRC]` | MUST |

## 13. Data and privacy

| ID | Requirement | Level |
|---|---|---|
| DP-01 | No PII collected, no input field asking for personal data, no login-looking screen `[SRC]` | MUST NOT |
| DP-02 | No analytics/telemetry of any kind; no network calls beyond the SDK script `[SRC]` | MUST NOT |
| DP-03 | No clipboard reads unless the player explicitly pastes; no QR-like graphics `[SRC]` | MUST NOT |
| DP-04 | Persisted data limited to the save schema in §A6 (board, score, best, stats, settings) | MUST |
| DP-05 | Dev/staging links never shared outside certification testing `[SRC]` | MUST NOT |

## 14. Release and certification plan

| Step | Action | Evidence to capture |
|---|---|---|
| 1 | Access: Playables interest form, then Channel Manager on the onboarded channel | approval e-mail, portal access |
| 2 | Build: implement FR/INT/NFR, run `check_contrast.py` and the skill pre-flight checker | exit codes, size report |
| 3 | Local test: SDK Test Suite against the uploaded build; verify call order and post-compression size | Test Suite log |
| 4 | Environment test: desktop web, mobile web, Android app, iOS app + real WebView + foldable sim | per-environment notes with build hash |
| 5 | Portal: metadata (title, genre, description), bundle ZIP, thumbnail (no branding), monetization toggles | portal screenshots |
| 6 | Create release → Verify and test → **Submit for Certification** (no other release pending) `[SRC]` | submission id |
| 7 | After approval: staged rollout; ship updates as new bundles without unpublishing the game | release notes |

DoR (before coding starts): §17 rules frozen, DS tokens frozen, save schema agreed, title/IP check done.
DoD: §17 §A13 acceptance list + §4 stories all pass, plus M2–M6 thresholds met.

## 15. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Audio treated as needing a user gesture → certification failure (documented top cause) `[SRC]` | med | high | start the AudioContext at boot; resume on first input and on `onResume`; test with YouTube muted and unmuted |
| R2 | Save written outside the SDK (a careless `localStorage` line) | med | high | INT-06 + pre-flight checker rule + grep the built bundle before every upload |
| R3 | Bundle grows past budget by shipping uncompressed music/art | low | med | asset budget in §A12; compress audio, subset the font; verify with the SDK Test Suite (post-compression) |
| R4 | Accessibility group rejects the design (classic palette fails AA on 11/12 tiles) `[MEASURED]` | high if classic palette used | med | ship the verified palette in DS §B1.2 + run `check_contrast.py` in CI |
| R5 | Catalog already contains a near-identical 2048 | med | high | IP-04 check before building; prepare a differentiated variant (themes, 5×5, daily seed) |
| R6 | WebView initialises with viewport 0 → nothing draws on Android only | med | high | never assume canvas size; drive layout from `gameReady()` and a `ResizeObserver`; test a real WebView |
| R7 | Input queue bug: a swallowed swipe feels broken | med | med | queue at most one input, always give feedback, keep logic independent of animation state |
| R8 | Ads API called without the portal toggle → silent no-op, monetization not as intended | med | low | MO-04 checklist item in the release plan |

## 16. Open questions and v1.1 backlog

| # | Question / idea | Owner | Needed by |
|---|---|---|---|
| Q1 | Final product title and thumbnail copy (IP-03/IP-04 constraints) | product | before portal upload |
| Q2 | Ship the rewarded "undo" / "continue" in v1 or v1.1? | product | before ads integration |
| Q3 | Which two locales ship first (vi + en, or en only)? | product | before string freeze |
| Q4 | Music: original loop vs SFX-only launch | audio | before asset freeze |
| B1 | 5×5 board mode (code already parameterised) | eng | v1.1 |
| B2 | Daily seeded challenge using the same save schema (no server: seed = date) | eng | v1.1 |
| B3 | Colour-blind and high-contrast themes exposed in settings (tokens exist) | design | v1.1 |
| B4 | Haptics vocabulary refinement per merge tier | design | v1.1 |

## 17. Appendix — detailed specification (stable `A` anchors)

The sections below are the frozen engineering detail behind the indexes above. Do not renumber them.

## A0. Product summary

A faithful, single-screen, offline-capable 2048 for the YouTube Playables catalog: 4×4 grid, slide to merge equal
tiles, reach 2048, score = sum of merge values, one game session with optional "keep playing" after winning.

- Session shape `[DESIGN]`: one tutorial-free session, target median session 2–5 minutes; no levels, no XP,
  no accounts, no purchases (Playables has no IAP `[SRC]`).
- Content: original art, original SFX/music, original tile surface treatment. No third-party assets.
- Deliberately **not** a reskin of the original: see §A1 compliance.

## A1. Identity, IP and certification blockers (do these first)

| Item | Requirement | Action |
|---|---|---|
| Code licence | The canonical implementation is **MIT, © 2014 Gabriele Cirulli** `[SRC]` (LICENSE.txt of `gabrielecirulli/2048`, fetched 2026-10-08) | If any code is reused, keep the MIT notice + attribution in the bundle. Safer for a shipped product: reimplement from this spec (the rules are not copyrightable, the code is) `[DESIGN]` |
| Title & branding | Playables **MUST NOT** use branding/logo in thumbnail, title or description `[SRC: cert Design]` | Ship under an original name (e.g. `Merge 2048`, `Tiles: Merge to 2048`); never use the YouTube logo, never use another company's logo |
| Duplicate content | **MUST NOT** duplicate an existing Playable `[SRC: cert Trust & safety]` | Before submitting, search the Playables catalog for existing 2048/merge games; if a near-identical one exists, ship a differentiated mode (themes, board sizes, daily seed) or pick another concept |
| Audience | 13+, **MUST NOT** be "made for kids" `[SRC: cert Trust & safety]` | No cartoon-child framing, no toy branding in metadata |
| Assets | Music/SFX/art rights **MUST** be cleared `[SRC]` | Generate or commission original audio; keep licence files for every asset in the repo |
| Accessibility | One of the 8 review groups is **Accessibility** `[SRC]` | Part B is built to meet AA; the classic palette does not (see §B2) |
| Haptics | MAY be used, but **MUST** have an on/off control if used `[SRC: cert Design]` | Ship a settings toggle, default ON on touch, OFF on desktop |

## A2. Platform hard limits (from the Playables certification requirements)

Copied here so the coder never has to open another file. English source text governs.

| # | Limit | Level |
|---|---|---|
| 1 | Initial bundle (everything loaded before `gameReady()`) < 30 MiB, SHOULD < 15 MiB, target 5 MiB | MUST |
| 2 | Total bundle < 250 MiB | MUST |
| 3 | Any single file < 30 MiB, SHOULD < 512 KiB | MUST / SHOULD |
| 4 | Cloud save < 3 MiB, SHOULD < 500 KiB; final flush ≤ 64 KiB best-effort | MUST |
| 5 | Interactive < 5 s | SHOULD |
| 6 | No reproducible crash; must not crash the YouTube app | MUST |
| 7 | Peak JS heap ≤ 512 MB | MUST |
| 8 | Standard web APIs only; must run in Edge/Chrome/Firefox + YouTube Android/iOS | MUST |
| 9 | **Relative paths only** in the bundle | MUST |
| 10 | Filenames `[A-Za-z0-9._-]` only | MUST |
| 11 | ≤ 8000 files | MUST |
| 12 | **No external calls** whatsoever (no analytics, no CDN fonts/assets, no third-party ad or payment SDK) | MUST |
| 13 | Progress saved **only** via the SDK (`saveData`/`loadData`) | MUST |
| 14 | Must be a **Single Page Application**; **no obfuscation** | MUST |
| 15 | No Page Visibility API; pause/resume only via `onPause`/`onResume` | MUST NOT / MUST |
| 16 | No exit/quit button, no clickable outbound links, no share prompts, no login-like screens, no QR-like codes | MUST NOT |
| 17 | Ads only via SDK ad APIs, and the matching monetization toggle must be enabled in the Developer Portal | MUST |
| 18 | WASM / `eval()` / Web workers are grounds for Google to refuse review if they cannot evaluate the game | risk |

`[DESIGN]` 2048 needs none of the risky mechanisms: it is pure DOM/CSS + a few hundred lines of JS, no WASM, no
workers, no `eval`. That alone removes the largest class of rejections.

## A3. Rules (exact reference behaviour)

| Rule | Value | Tag |
|---|---|---|
| Board | 4×4, 16 cells | `[SRC]` (`new GameManager(4, …)`, `Grid(size)`) |
| Starting tiles | **2** random tiles placed before the first move | `[SRC]` `this.startTiles = 2` |
| New tile value | **2 with probability 0.9, 4 with probability 0.1** | `[SRC]` `Math.random() < 0.9 ? 2 : 4` |
| Spawn position | uniform over empty cells; never on a cell that was just merged into? — the original spawns uniformly over empty cells (a merged cell from this move is a legal respawn position) | `[SRC]` |
| Move | all tiles slide as far as possible in the direction; each tile merges **at most once per move**; merge only equal values | `[SRC]` |
| Merge result | the two tiles become one tile of double value, placed at the far end in the move direction | `[SRC]` |
| Scoring | **score += merged tile value** (so merging two 8s adds 16) | `[SRC]` `self.score += merged.value` |
| Spawn timing | a new tile spawns **only if the move changed the board** | `[SRC]` |
| Win | first time a **2048** tile exists → win state | `[SRC]` `if (merged.value === 2048) self.won = true` |
| After win | "keep playing" continues the same run past 2048 | `[SRC]` `keepPlaying`, `isGameTerminated()` |
| Game over | no empty cell **and** no adjacent equal pair in any direction | `[SRC]` `movesAvailable()` |
| Undo | not in the original | `[SRC]` — see §A9 for an optional rewarded-ad undo `[DESIGN]` |
| Board size / difficulty | fixed 4×4 for v1; 5×5 is a v1.1 option (the reference code is size-parametric) | `[DESIGN]` |

**Move resolution algorithm** `[DESIGN — derived from the reference]`

```
onInput(dir):
  if state != PLAYING: ignore (except menu/dialog handling)
  if input queue busy animation: queue at most 1 input (drop older)
  snapshot = board.copy()
  for each line (row or column) in traversal order opposite to dir:
      tiles = nonEmptyTiles(line)                       // preserve order
      for i in 0..len-2:
          if tiles[i].value == tiles[i+1].value and not tiles[i].mergedThisMove:
              tiles[i].value *= 2
              score += tiles[i].value
              tiles[i+1].remove()                       // record merge for animation
              tiles[i].mergedThisMove = true
      compact(line, dir)                                // slide to the far edge
  if board == snapshot:                                 // no change
      play "invalid move" feedback; do NOT spawn; do NOT consume the move counter
  else:
      spawnRandomTile()                                 // 90% 2 / 10% 4
      moves += 1
      if anyTileIs(2048) and not won: won = true; enter WIN overlay
      if not movesAvailable(): enter GAME OVER
      saveIfMilestone()
  render(animations for slides + merges + spawn)
```

**Rendering contract** `[DESIGN]`: the logical board is the source of truth; the view diffs old→new and plays
slide (100 ms) → merge pop (200 ms) → spawn appear (200 ms) per §B6. Never let animation state feed back into the
logic (that is what makes 2048 clones desync on slow devices).

## A4. Input model

| Input | Behaviour | Requirement driver |
|---|---|---|
| Pointer drag (touch, mouse, pen) — primary | pointerdown → track; commit when displacement ≥ `max(24 px, 0.18 × boardSide)` in a dominant axis; the axis with the larger absolute delta wins; ignore diagonal ambiguity below 1.2× ratio | Playables **MUST** support touch *and* mouse for every interaction `[SRC: cert Design]` |
| Keyboard arrows + WASD | same as drag; `Esc` closes the open dialog; **never** `preventDefault()` on Esc | keyboard is SHOULD, Esc rule is MUST `[SRC]` |
| On-screen D-pad (optional, enabled by default on touch) | 4 buttons, ≥ 44×44 CSS px each, positioned bottom-centre, auto-hides after 3 s of drag usage | accessible fallback + discoverability `[DESIGN]` |
| Swipe during animation | queue at most one; never drop a *different* direction silently without feedback | no missed input `[SRC: cert Design]` |
| Orientation / posture | never lock orientation, never block foldables; re-layout on resize keeping state | MUST `[SRC]` |
| Pause triggers | only SDK `onPause`/`onResume`; no `visibilitychange` | MUST NOT `[SRC]` |

## A5. States, screens and the SDK call map

```
BOOT ──(SDK script loaded first)──▶ firstFrameReady()        [splash: logo-free title + "Đang tải…" spinner]
   │
   ▼
LOAD ── await loadData() ──▶ parse/migrate ──▶ (resume run | new run)
   │
   ▼
READY ──▶ gameReady()                                       [only when the player can actually move tiles]
   │
   ├── PLAYING ── input ──▶ slide/merge/spawn ──▶ saveData() at milestones (see below)
   │      │
   │      ├── 2048 reached  ──▶ WIN overlay   ──▶ [Keep playing] → PLAYING │ [New game] → NEW GAME
   │      └── no moves left ──▶ GAME OVER overlay ──▶ [Retry] → NEW GAME
   │
   ├── PAUSED (onPause) ──▶ freeze rAF loop, mute, saveData(), hide D-pad
   └── RESUMED (onResume) ──▶ resume rAF, restore audio per isAudioEnabled()
```

**Required call order** `[SRC: cert Integration]`: SDK `<script>` before game code → `firstFrameReady()` while the
splash is visible → `await loadData()` before any `saveData()` → `gameReady()` only when the player can interact.

| Moment | SDK call | Level |
|---|---|---|
| Splash visible | `ytgame.game.firstFrameReady()` | MUST |
| Before first save | `await ytgame.game.loadData()` | MUST |
| Player can move | `ytgame.game.gameReady()` | MUST |
| After each completed move that changed the board, and on every game start/end/win | `ytgame.game.saveData(json)` (debounced ≥ 1 s, flushed on state change) | MUST (milestones) / SHOULD |
| `onPause()` fires | stop the loop, mute, flush save | MUST pause all execution / SHOULD save |
| `onResume()` | resume loop + audio state | MUST |
| New personal best | `ytgame.engagement.sendScore({value: best})` where `best` is **the same value stored in the save** | MUST if used |
| Mute state changes | `isAudioEnabled()` on boot + `onAudioEnabledChange(cb)` | MUST |
| Interstitial (see §A9) | `ytgame.ads.requestInterstitialAd()` with try/catch fallback | MUST have fallback |
| Rewarded (see §A9) | `ytgame.ads.requestRewardedAd('<unique-readable-id>')` | player-initiated only |

`[DESIGN]` Save milestones for 2048: game start, every merge that creates a new personal-best score crossing a
1000-point threshold, win, game over, pause, and every 30 s of active play. Debounce to ≥ 1 s to stay far below
the 64 KiB final-flush budget.

## A6. Save schema (SDK cloud save)

```jsonc
{
  "v": 1,                       // schema version — MUST be first thing checked when loading
  "board": [[0,2,0,4],[0,0,0,2],[0,0,0,0],[0,0,0,0]],  // 4 rows × 4 ints, 0 = empty; powers of two only
  "score": 128,
  "best": 4096,                 // MUST equal the value sent via sendScore()
  "won": false,                 // reached 2048 in this run
  "keepPlaying": false,
  "moves": 42,
  "stats": { "games": 7, "bestTile": 512, "totalScore": 22140 },
  "settings": { "haptics": true, "reducedMotion": false, "dpad": "auto" },
  "lastSavedAt": "2026-10-08T09:31:12Z"
}
```

- Size `[DESIGN]`: measure this payload — it is ~450–700 bytes; the limit is 3 MiB (`< 500 KiB` SHOULD), i.e. a
  ~4000× margin. Never store per-move history.
- **Migration** `[SRC: MUST]`: `loadData()` may return a save from an older build. Wrap parse+map in try/catch;
  unknown/newer `v` → keep the run but do not crash; missing fields → defaults; a corrupt payload must fall back
  to a new run instead of throwing.
- **Storage ban** `[SRC: MUST NOT]`: no `localStorage`, `sessionStorage`, `indexedDB`, cookies, or engine storage
  — the only persistence is `saveData`/`loadData`.
- UTF-16 safety `[DESIGN]`: the reference wrapper (`playables-bootstrap.js` §save) strips lone surrogates before
  saving; reuse it instead of calling the SDK raw.

## A7. Scoring, progression, session

- Score = sum of merged values `[SRC]`; displayed with thousands separators per locale, tabular numerals.
- `best` persists across runs in the cloud save and **must equal** the value passed to `sendScore` `[SRC: MUST]`.
- No level progression. "Content end" signal required by certification `[SRC: cert Design — MUST notify when
  content ends]` is satisfied by the GAME OVER overlay (explicit "no moves left" message + the final score), and
  by an explicit "you reached 2048" WIN overlay.
- Stats kept locally in the save: games played, best tile, total score (no server, no analytics — analytics are
  banned `[SRC]`).

## A8. Ads plan (only via the SDK, with fallbacks)

| Slot | Trigger | Rules |
|---|---|---|
| Pre-roll | none in code | YouTube inserts it itself and it cannot be disabled `[SRC: sdk-api]` |
| Interstitial | after the GAME OVER screen is dismissed — at most once every 2nd game over, never within the first 30 s of a session | natural break; MUST have fallback for no-fill; MUST be enabled in the Developer Portal too `[SRC]` |
| Rewarded (optional, v1.1) | player explicitly taps "Watch an ad to undo the last move" (once per run) and "Watch an ad to continue after game over" (once per 10 games) | player-initiated only; **each reward type uses its own readable ID** (`undo-last-move`, `continue-after-gameover`); IDs carry no user data; always handle "no ad available" `[SRC]` |

`[DESIGN]` Ads must never gate core play: every ad path has a non-ad fallback (the game simply continues), which
is also the certification-safe pattern. If ads are not enabled in the portal, the code paths must no-op silently.

## A9. Audio plan

- Everything bundled: no CDN, no streaming, no autoplay of a network URL `[SRC]`.
- Mute discipline `[SRC: MUST]`: read `ytgame.system.isAudioEnabled()` on boot, subscribe
  `onAudioEnabledChange`, and when YouTube is muted the game must produce **no audio output at all** and its own
  in-game audio controls must not affect the output. **No in-game master mute button** `[SHOULD NOT]` — provide a
  separate SFX volume slider (0–100%) instead.
- WebAudio unlock `[DESIGN]`: YouTube may auto-focus the game, so do not require a user gesture before audio
  starts (a classic rejection cause). Create the `AudioContext` at boot; if it starts `suspended`, resume it on
  the first input *and* on `onResume`, and never block gameplay on audio.

| SFX token | Event | Suggested duration | Files |
|---|---|---|---|
| `sfx.move` | valid slide | 60–90 ms | 1 loop-free sample |
| `sfx.merge` | merge (pitch scales with value, +2 semitones per doubling, capped) | 120 ms | 1 sample + pitch shift |
| `sfx.spawn` | new tile appears | 60 ms | reuse `sfx.move` at lower gain |
| `sfx.invalid` | no-op move | 80 ms | 1 sample |
| `sfx.win` | 2048 reached | 1.2 s | 1 sample |
| `sfx.over` | game over | 1.0 s | 1 sample |
| `music.loop` | optional ambient loop | 30–60 s, loopable | mono/stereo, keep ≤ 512 KiB |

## A10. Localisation

- Language via `await ytgame.system.getLanguage()` `[SRC]`; bundle strings for at minimum `en`, `vi`
  (the game is numbers-only by nature, so the string surface is tiny).
- Strings to localise (complete list v1): title, "New game", "Keep playing", "Undo", "Score", "Best", "Moves",
  "No moves left", "You made 2048!", "Settings", "Sound", "Haptics", "Reduced motion", "Watch an ad to undo",
  "Ad not available".
- Never rely on text for understanding: tile values are numerals (language-neutral). No RTL layout work needed
  beyond using logical CSS properties (`margin-inline`, `padding-inline`) `[DESIGN]`.
- No external fonts: bundle a subsetted WOFF2 (digits + Latin basic + the few Vietnamese diacritics used in the
  UI strings) `[SRC: no external calls]`.

## A11. Accessibility requirements (from the Accessibility review group × WCAG AA)

| Requirement | Implementation | Level |
|---|---|---|
| Text contrast | All tile numerals and UI text ≥ 4.5:1 against their own surface (§B2 verified table) | AA |
| Non-text contrast | Focus indicator ≥ 3:1 against adjacent colours (measured 4.26:1 light / 3.92:1 dark) | AA |
| Keyboard | Full play with arrows/WASD; visible focus ring; logical tab order; `Esc` closes dialogs without `preventDefault` | MUST `[SRC]` + AA |
| Screen reader | Board exposed as a 4×4 grid with cell values; score/best in `aria-live="polite"`; game over announced | `[DESIGN]` |
| Motion | Respect `prefers-reduced-motion` and an in-game toggle: replace slide/pop with instant state change + 120 ms fade; no flashing | `[DESIGN]` |
| Colour independence | Value is always shown as a numeral; the tile palette also forms a monotonic luminance ladder (0.82 → 0.02) so it reads correctly in greyscale | `[MEASURED]` |
| Target size | All buttons ≥ 44×44 CSS px (WCAG 2.5.8 AAA-ish / platform ergonomics); D-pad buttons ≥ 48 px on touch | `[DESIGN]` |
| Haptics | Toggle in settings; default on for touch, off otherwise | MUST `[SRC]` |
| Resize | State survives any viewport change; nothing is clipped at 320×568 up to 1920×1080 and in foldables | MUST `[SRC]` |

## A12. Performance & asset budget

| Budget | Target | Rationale |
|---|---|---|
| Initial bundle (pre-`gameReady`) | ≤ 1.5 MiB uncompressed / ≤ 400 KiB gzipped | far under the 30 MiB MUST and 15 MiB SHOULD; a 2048 game has no excuse to be heavy `[DESIGN]` |
| Total bundle | ≤ 3 MiB | hard cap is 250 MiB |
| File count | ≤ 40 | cap is 8000 |
| Largest single file | ≤ 512 KiB SHOULD — keep the music loop ≤ 300 KiB | SHOULD |
| JS heap peak | ≤ 60 MB | cap 512 MB |
| Frame time | ≤ 8 ms/frame at 60 fps on a mid Android phone; no per-frame allocations in the hot path | `[DESIGN]` |
| First paint | < 1 s locally; interactive < 3 s | SHOULD < 5 s |

Implementation constraints `[DESIGN]`: one `requestAnimationFrame` loop that idles when nothing animates (event
driven, not a permanent spin); transform/opacity-only animations; DOM tiles created once and reused (pooled),
never re-created per move; CSS containment on the board.

## A13. QA / acceptance criteria (Definition of Done)

Functional
1. New run starts with exactly **2** tiles, values ∈ {2,4}; over 10 000 spawns the 2:4 ratio is 90:10 ±1 % `[SRC]`.
2. Merging two equal tiles adds their sum to the score and never double-merges in one move `[SRC]`.
3. A no-op move does not spawn a tile and does not increment the move counter `[SRC]`.
4. Reaching 2048 opens the WIN overlay with "keep playing"; the run continues past 2048 `[SRC]`.
5. Game over iff the board is full and no adjacent equal pair exists `[SRC]`.
6. Reload mid-run restores board, score, best and settings from the cloud save; a save from `v0` (unknown keys)
   loads without crashing `[SRC: MUST]`.
7. `best` in the save always equals the last value sent to `sendScore` `[SRC: MUST]`.

Platform
8. SDK Test Suite (uploaded build) shows the call order firstFrameReady → loadData → gameReady, and reports the
   real post-compression initial-bundle size within budget `[SRC]`.
9. Zero external requests in the network panel during a full session `[SRC: MUST NOT]`.
10. Audio: with YouTube muted → no sound at all; toggling YouTube mute mid-run mutes immediately; audio works
    without any user gesture `[SRC: MUST + FAQ]`.
11. Pause (tab switch / app backgrounded) freezes the game and saves; resume continues correctly; no
    `visibilitychange` listener exists in the build `[SRC: MUST NOT]`.
12. Tested on: YouTube desktop web (Chrome + Firefox), YouTube mobile web, YouTube for Android, YouTube for iOS;
    plus a real WebView and a foldable simulation; and with the viewport resized mid-game `[SRC]`.
13. No exit button, no outbound link, no share prompt, no login-like screen, no QR-like graphic `[SRC: MUST NOT]`.

Quality gates
14. `scripts/playables_preflight.py ./dist --src ./src` → exit 0.
15. Official Playables bundle analyzer report shows no oversized/suspicious files.
16. Lighthouse-style check: bundle ≤ budget, no console errors/warnings, no `localStorage` references in `dist`.

## A14. Out of scope for v1

Accounts, leaderboards, multiplayer (Playables multiplayer is experimental `[SRC]`), in-app purchases (not
available `[SRC]`), analytics, cloud features beyond the SDK save, board sizes other than 4×4, level/progression
systems, daily challenges (v1.1 candidate), themes marketplace.

---

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
