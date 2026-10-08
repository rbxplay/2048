#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""playables_preflight.py — kiểm tra trước khi nộp một game bundle lên YouTube Playables.

Đây là công cụ TỰ VIẾT (không phải của Google): nó chỉ kiểm những quy tắc khách quan hoá được
từ tài liệu certification chính thức. Luôn chạy thêm Playables bundle analyzer chính thức và
SDK Test Suite trước khi submit.

Dùng:
    python3 playables_preflight.py ./dist                # kiểm bundle đã build
    python3 playables_preflight.py ./dist --src ./src     # kiểm thêm mã nguồn
    python3 playables_preflight.py ./dist --json

Exit code: 0 = không có lỗi MUST nào; 1 = có ít nhất một lỗi MUST.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

MiB = 1024 * 1024
VIRTUAL_HOSTS = ('www.youtube.com', 'youtube.com', 'developers.google.com', 'google.com',
                 'localhost', '127.0.0.1', '0.0.0.0')

# Quy tắc kích thước (Playables certification > Stability and performance)
RULE_INITIAL_SHOULD = 15 * MiB        # initial bundle SHOULD < 15 MiB
RULE_INITIAL_TARGET = 5 * MiB         # hướng tới 5 MiB
RULE_FILE_MUST = 30 * MiB             # mỗi file MUST < 30 MiB
RULE_FILE_SHOULD = 512 * 1024         # mỗi file SHOULD < 512 KiB
RULE_TOTAL_MUST = 250 * MiB           # tổng bundle MUST < 250 MiB
RULE_SAVE_MUST = 3 * MiB              # cloud save MUST < 3 MiB
RULE_SAVE_SHOULD = 500 * 1024
RULE_MAX_FILES = 8000
FNAME_OK = re.compile(r'^[A-Za-z0-9._-]+$')
TEXT_EXT = {'.js', '.mjs', '.cjs', '.html', '.htm', '.css', '.json', '.txt', '.svg'}
SCAN_LIMIT = 8 * MiB                  # không quét file lớn hơn (wasm, atlas...)

# Mẫu cấm / rủi ro (kèm nhóm yêu cầu tương ứng). severity: 'error' | 'warn'
EXT_CALL_ALLOWED = ('youtube.com/game_api', 'www.youtube.com/game_api')
BANNED = [
    ('external-fetch', re.compile(r'fetch\s*\(\s*["\'`]https?://[^"\'`]+|\bimport\s*\(\s*["\'`]https?://[^"\'`]+|'
                                 r'<script[^>]+src\s*=\s*["\']https?://[^"\'>\s]+|<link[^>]+href\s*=\s*["\']https?://[^"\'>\s]+', re.I),
     'error',
     'MUST NOT make external calls (Privacy & Data) — mọi asset phải nằm trong bundle; chỉ SDK YouTube là ngoại lệ'),
    ('xhr-websocket', re.compile(r'XMLHttpRequest|new\s+WebSocket\s*\(|navigator\.sendBeacon', re.I),
     'warn', 'Kiểm tra: XHR/WebSocket/beacon chỉ được dùng với đường dẫn tương đối trong bundle'),
    ('third-party-ad-sdk', re.compile(r'\b(AdMob|UnityAds|ironSource|AppLovin|FacebookAds|GoogleAds|ImaAds)\b'),
     'error', 'MUST NOT display in-game advertising via off-platform services (Monetization)'),
    ('off-platform-payment', re.compile(r'\b(stripe|paypal|braintree|squareup|vnpay|momo)\b', re.I),
     'error', 'MUST NOT implement in-game purchases via off-platform services (Monetization)'),
    ('analytics-sdk', re.compile(r'\b(gtag|GoogleAnalytics|firebase\.analytics|mixpanel|amplitude|posthog|sentry|datadog)\b', re.I),
     'error', 'MUST NOT make external calls — analytics bên thứ ba là lỗi phổ biến nhất khiến build trượt'),
    ('non-sdk-storage', re.compile(r'\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie|PlayerPrefs|sys\.localStorage|sys\.save', re.I),
     'error', 'Progress MUST be saved only through the SDK (saveData/loadData); storage của browser/engine là lý do bị từ chối'),
    ('page-visibility-api', re.compile(r'document\.visibilityState|onvisibilitychange|addEventListener\(\s*["\']visibilitychange'),
     'error', 'MUST NOT use the Page Visibility API — dùng SDK onPause/onResume'),
    ('esc-preventDefault', re.compile(r'preventDefault[^;\n]{0,80}(Escape|Esc\b)', re.I),
     'error', 'MUST NOT call preventDefault() on Esc events (Design)'),
    ('cdn-asset', re.compile(r'https?://(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)', re.I),
     'error', 'Asset/thư viện từ CDN = external call; phải bundle local (kể cả font)'),
    ('wasm-eval', re.compile(r'\beval\s*\(|new\s+Function\s*\('),
     'warn', 'YouTube có thể từ chối game dùng eval()/WASM/Web workers nếu không đánh giá được — ghi chú để giải trình'),
    ('made-for-kids', re.compile(r'made\s*for\s*kids|just\s*for\s*kids', re.I),
     'error', 'Content MUST NOT be "made for kids" — phải phù hợp 13+ (Trust & Safety)'),
    ('login-screen', re.compile(r'(create\s+account|sign\s+in\s+to|<input[^>]+type=["\']password)', re.I),
     'error', 'MUST NOT display login/account-creation-like screens (Privacy & Data)'),
    ('share-prompt', re.compile(r'(share\s+(this\s+)?game|invite\s+friends|share\s+on)', re.I),
     'warn', 'MUST NOT display in-game sharing prompts (Design) — kiểm tra thủ công'),
    ('absolute-path', re.compile(r'(?:src|href)\s*=\s*["\']/(?![/\s])'),
     'error', 'MUST use relative paths only — đường dẫn tuyệt đối sẽ không load (Stability)'),
]

# Dấu hiệu thiếu (cần có trong bundle)
REQUIRED = [
    ('sdk-script', re.compile(r'youtube\.com/game_api/v1'),
     'index.html MUST load <script src="https://www.youtube.com/game_api/v1"> before game code'),
    ('first-frame-ready', re.compile(r'\.game\.firstFrameReady|firstFrameReady\s*\('),
     'MUST call firstFrameReady() while a loading/splash screen is visible'),
    ('game-ready', re.compile(r'\.game\.gameReady|gameReady\s*\('),
     'MUST call gameReady() only when the game is interactive'),
    ('load-data', re.compile(r'\.game\.loadData|loadData\s*\('),
     'MUST read progress with loadData() and await it before saveData()'),
    ('save-data', re.compile(r'\.game\.saveData|saveData\s*\('),
     'MUST save progress with saveData() (no other storage mechanism)'),
    ('audio-check', re.compile(r'isAudioEnabled|onAudioEnabledChange'),
     'MUST respect YouTube mute via isAudioEnabled()/onAudioEnabledChange()'),
    ('pause-resume', re.compile(r'onPause|onResume'),
     'MUST pause/resume via SDK onPause/onResume'),
    ('in-playables-env', re.compile(r'IN_PLAYABLES_ENV|typeof\s+ytgame|window\.ytgame'),
     'Nên có guard khi SDK vắng mặt (chạy local) và dùng IN_PLAYABLES_ENV để phát hiện môi trường'),
]


def scan_text_files(root: Path):
    """Trả về list (path, text) cho các file text nhỏ hơn SCAN_LIMIT."""
    out = []
    for p in root.rglob('*'):
        if not p.is_file() or p.suffix.lower() not in TEXT_EXT:
            continue
        try:
            if p.stat().st_size > SCAN_LIMIT:
                continue
            out.append((p, p.read_text(encoding='utf-8', errors='ignore')))
        except OSError:
            continue
    return out


def check_bundle(bundle: Path, extra_src: Path | None):
    errors, warnings, notes = [], [], []
    if not bundle.is_dir():
        return {'errors': [f'Không phải thư mục: {bundle}'], 'warnings': [], 'notes': [], 'files': [], 'total': 0}

    files = [p for p in bundle.rglob('*') if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    rel = lambda p: str(p.relative_to(bundle))

    # index.html ở gốc bundle
    if not (bundle / 'index.html').is_file():
        errors.append('Thiếu index.html ở gốc bundle (Stability: game phải chạy từ index.html)')

    # số file
    if len(files) > RULE_MAX_FILES:
        errors.append(f'Tổng số file {len(files)} > 8000 (MUST). Gộp atlas/asset.')

    # tên file
    bad_names = [rel(p) for p in files if not FNAME_OK.match(p.name)]
    if bad_names:
        errors.append(f'{len(bad_names)} file có tên không hợp lệ (chỉ được dùng [A-Za-z0-9._-]): '
                      + ', '.join(bad_names[:5]) + (' ...' if len(bad_names) > 5 else ''))

    # kích thước từng file
    over_must = [(rel(p), p.stat().st_size) for p in files if p.stat().st_size >= RULE_FILE_MUST]
    over_should = [(rel(p), p.stat().st_size) for p in files
                   if RULE_FILE_SHOULD <= p.stat().st_size < RULE_FILE_MUST]
    if over_must:
        errors.append('File vượt MUST 30 MiB: '
                      + ', '.join(f'{n} ({s/MiB:.1f} MiB)' for n, s in over_must[:5]))
    if over_should:
        over_should.sort(key=lambda x: -x[1])
        warnings.append(f'{len(over_should)} file vượt ngưỡng SHOULD 512 KiB (lớn nhất: '
                        + ', '.join(f'{n} {s/1024:.0f} KiB' for n, s in over_should[:5]) + ')')

    # tổng bundle
    if total >= RULE_TOTAL_MUST:
        errors.append(f'Tổng bundle {total/MiB:.1f} MiB ≥ 250 MiB (MUST)')
    elif total > 40 * MiB:
        warnings.append(f'Tổng bundle {total/MiB:.1f} MiB — chấp nhận được nhưng nên lazy-load (SHOULD)')

    # ước lượng initial bundle thô: html + js/css + asset được nhắc trong index.html
    idx = (bundle / 'index.html')
    if idx.is_file():
        html = idx.read_text(encoding='utf-8', errors='ignore')
        refs = re.findall(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', html)
        est = idx.stat().st_size
        for r in refs:
            if r.startswith(('http', 'data:', '#')):
                continue
            cand = (bundle / r.lstrip('./')).resolve()
            if cand.is_file():
                est += cand.stat().st_size
        if est >= RULE_INITIAL_SHOULD:
            warnings.append(f'Ước lượng initial bundle thô ~{est/MiB:.1f} MiB (SHOULD < 15 MiB, '
                            'nhắm 5 MiB) — đo chính xác bằng SDK Test Suite / bundle analyzer chính thức')
        else:
            notes.append(f'Ước lượng initial bundle thô ~{est/MiB:.1f} MiB (đo chính xác bằng SDK Test Suite)')

    # quét mã (dedupe theo đường dẫn thật, tránh quét trùng khi --src trùng bundle)
    candidates = list(scan_text_files(bundle))
    if extra_src and extra_src.is_dir():
        candidates += scan_text_files(extra_src)
    seen_paths, targets = set(), []
    for p, text in candidates:
        rp = p.resolve()
        if rp in seen_paths:
            continue
        seen_paths.add(rp)
        targets.append((p, text))

    violations = {}
    for pat_name, rx, sev, why in BANNED:
        hits = []
        for p, text in targets:
            for m in rx.finditer(text):
                mt = m.group(0)
                if any(h in mt for h in EXT_CALL_ALLOWED):   # SDK YouTube là ngoại lệ hợp lệ
                    continue
                line = text[:m.start()].count('\n') + 1
                hits.append(f'{p.name}:{line}')
                if len(hits) >= 6:
                    break
            if len(hits) >= 6:
                break
        if hits:
            violations[pat_name] = (sev, why, hits)
    for name, (sev, why, hits) in violations.items():
        (errors if sev == 'error' else warnings).append(
            f'[{name}] {why} → {", ".join(hits)}')

    present = {name for name, rx, _ in REQUIRED
               for _, text in targets if rx.search(text)}
    missing = [(n, why) for n, rx, why in REQUIRED if n not in present]
    for n, why in missing:
        (errors if n in ('sdk-script', 'first-frame-ready', 'game-ready',
                         'load-data', 'save-data', 'audio-check', 'pause-resume') else warnings).append(
            f'[{n}] không thấy trong bundle/source: {why}')

    return {
        'errors': errors, 'warnings': warnings, 'notes': notes,
        'files': len(files), 'total': total,
        'largest': sorted(((rel(p), p.stat().st_size) for p in files), key=lambda x: -x[1])[:10],
    }


def main():
    ap = argparse.ArgumentParser(description='Preflight check cho game bundle YouTube Playables')
    ap.add_argument('bundle', help='thư mục bundle đã build (chứa index.html)')
    ap.add_argument('--src', help='thêm thư mục mã nguồn để quét', default=None)
    ap.add_argument('--json', action='store_true', help='in JSON')
    a = ap.parse_args()

    res = check_bundle(Path(a.bundle), Path(a.src) if a.src else None)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(f"Bundle   : {a.bundle}")
        print(f"Files    : {res['files']}   Tổng: {res['total']/MiB:.2f} MiB")
        if res['largest']:
            print('Lớn nhất : ' + ', '.join(f'{n} {s/1024:.0f} KiB' for n, s in res['largest'][:5]))
        print()
        if res['errors']:
            print(f'❌ MUST ({len(res["errors"])}):')
            for e in res['errors']:
                print('  -', e)
        else:
            print('✅ Không có lỗi MUST nào bị phát hiện.')
        if res['warnings']:
            print(f'\n⚠️  SHOULD / cần soát ({len(res["warnings"])}):')
            for w in res['warnings']:
                print('  -', w)
        if res['notes']:
            print('\nℹ️  Ghi chú:')
            for n in res['notes']:
                print('  -', n)
        print('\nNhớ chạy: Playables bundle analyzer chính thức + SDK Test Suite + test 4 môi trường.')
    return 1 if res['errors'] else 0


if __name__ == '__main__':
    sys.exit(main())
