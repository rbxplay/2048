#!/usr/bin/env node
// Kiểm bundle production không chứa thứ bị certification cấm.
//
// Lý do tồn tại: project anh em RockPaperScissor ship `localStorage` trong
// dist/index.html vì mock adapter bị bundle chung. Xem spec §5a. Preflight của
// Google bỏ qua file .ts nên nó KHÔNG bắt được lỗi này ở tầng nguồn — script
// này là lá chắn thật sự.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = process.argv[2] ?? './dist'

// Không có dist thì báo rõ ràng, đừng để lộ stack trace ENOENT — người chạy
// cần biết mình quên build, không cần biết readdirSync nằm ở dòng nào.
if (!statSync(DIST, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`❌ check-bundle: không thấy thư mục ${DIST} — chạy \`npm run build\` trước.`)
  process.exit(1)
}

const STORAGE = String.raw`\b(?:localStorage|sessionStorage)`
const STORAGE_USE = [
  STORAGE + String.raw`\s*(?:\.\s*(?:setItem|getItem|removeItem|clear|key)\s*\(|\[)`,
  STORAGE + String.raw`\s*\.\s*[A-Za-z_$][\w$]*\s*=(?!=)`,
  String.raw`[=(,:?]\s*(?:(?:window|globalThis|self)\s*\.\s*)?(?:localStorage|sessionStorage)\s*[;,)}\n]`,
].join('|')
const STORAGE_NAME = new RegExp(STORAGE, 'g')

const BANNED = [
  // Web Storage: bắt việc DÙNG, không bắt cái tên. Engine (Phaser `Device.Features`)
  // có dòng dò tính năng `!!localStorage.getItem` và thuộc tính `localStorage:!1` —
  // không đọc, không ghi gì. Cert cấm cơ chế lưu tiến trình khác SDK, tức cấm hành vi.
  // Ba vế: gọi method / truy cập `[...]`; gán thuộc tính; đem chính object đi chỗ khác
  // (alias — vế này để `const s = localStorage; s.setItem()` không lọt).
  ['bộ nhớ trình duyệt', new RegExp(STORAGE_USE + String.raw`|\bindexedDB\b|document\.cookie`)],
  ['Page Visibility API', /document\.visibilityState|visibilitychange/],
  ['request ngoài', /(?:fetch|import)\s*\(\s*["'`]https?:\/\/|<link[^>]+href\s*=\s*["']https?:\/\//i],
  ['SDK quảng cáo bên thứ ba', /\b(AdMob|UnityAds|ironSource|AppLovin)\b/],
  // §5a: mock adapter không được lọt vào bundle production.
  // Chuỗi này khai báo ở src/platform/mock.ts (DEV_MOCK_MARKER).
  ['mock adapter lọt vào production bundle', /SPAWNED_BY_DEV_MOCK_ONLY/],
]

// SDK YouTube là ngoại lệ hợp lệ duy nhất.
const ALLOWED = ['youtube.com/game_api']

const NAME_OK = /^[A-Za-z0-9._-]+$/
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.htm', '.css', '.json', '.svg'])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const files = walk(DIST)
const errors = []
let storageNames = 0

for (const f of files) {
  const rel = relative(DIST, f)
  for (const seg of rel.split('/')) {
    if (!NAME_OK.test(seg)) errors.push(`tên file không hợp lệ: ${rel}`)
  }
  const dot = rel.lastIndexOf('.')
  const ext = dot === -1 ? '' : rel.slice(dot)
  if (!TEXT_EXT.has(ext)) continue
  const text = readFileSync(f, 'utf8')
  storageNames += text.match(STORAGE_NAME)?.length ?? 0
  for (const [label, rx] of BANNED) {
    const re = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g')
    for (const m of text.matchAll(re)) {
      const hit = m[0]
      if (ALLOWED.some((a) => hit.includes(a))) continue
      const line = text.slice(0, m.index).split('\n').length
      errors.push(`[${label}] ${rel}:${line} → ${hit.slice(0, 60)}`)
    }
  }
}

if (!files.some((f) => relative(DIST, f) === 'index.html')) {
  errors.push('thiếu index.html ở gốc bundle')
}

if (errors.length > 0) {
  console.error(`❌ check-bundle: ${errors.length} lỗi`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`✅ check-bundle: ${files.length} file, không có chuỗi cấm`)
if (storageNames > 0) {
  console.log(`ℹ️  tên Web Storage xuất hiện ${storageNames} lần nhưng không có lời gọi nào dùng nó (dò tính năng của engine)`)
}
