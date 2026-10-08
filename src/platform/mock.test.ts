import { describe, expect, it, vi } from 'vitest'
import { DEV_MOCK_MARKER, MockPlatform } from './mock'
import type { SaveData } from '../game/persist'

function sample(): SaveData {
  return {
    v: 1,
    board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    score: 4,
    best: 4,
    won: false,
    keepPlaying: false,
    moves: 1,
    stats: { games: 1, bestTile: 2, totalScore: 4 },
    settings: { haptics: true, reducedMotion: false, dpad: 'auto', theme: 'light', sfxVolume: 0.7 },
    lastSavedAt: '',
  }
}

describe('MockPlatform — lưu trữ trong bộ nhớ', () => {
  it('chưa lưu gì thì load trả null', async () => {
    const p = new MockPlatform()
    await p.init()
    expect(await p.load()).toBeNull()
  })

  it('save rồi load đi về nguyên vẹn', async () => {
    const p = new MockPlatform()
    await p.init()
    await p.save(sample())
    const back = await p.load()
    expect(back!.score).toBe(4)
    expect(back!.board).toEqual(sample().board)
  })

  it('saved() trả chuỗi đã lưu, để soi từ DevTools', async () => {
    const p = new MockPlatform()
    await p.init()
    await p.save(sample())
    expect(p.saved()).toContain('"score":4')
  })

  it('không throw khi chưa init', async () => {
    const p = new MockPlatform()
    await expect(p.load()).resolves.toBeNull()
    await expect(p.save(sample())).resolves.toBeUndefined()
  })
})

describe('MockPlatform — pause/resume để test thủ công', () => {
  it('pause gọi callback đã đăng ký', () => {
    const p = new MockPlatform()
    const cb = vi.fn()
    p.onPause(cb)
    p.pause()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('resume gọi callback đã đăng ký', () => {
    const p = new MockPlatform()
    const cb = vi.fn()
    p.onResume(cb)
    p.resume()
    expect(cb).toHaveBeenCalledOnce()
  })
})

describe('MockPlatform — audio và ads', () => {
  it('isAudioEnabled mặc định true, đổi được', () => {
    const p = new MockPlatform()
    expect(p.isAudioEnabled()).toBe(true)
    p.emitAudioChange(false)
    expect(p.isAudioEnabled()).toBe(false)
  })

  it('emitAudioChange gọi callback với trạng thái mới', () => {
    const p = new MockPlatform()
    const cb = vi.fn()
    p.onAudioEnabledChange(cb)
    p.emitAudioChange(false)
    expect(cb).toHaveBeenCalledWith(false)
  })

  it('requestInterstitial trả true (giả lập có quảng cáo)', async () => {
    await expect(new MockPlatform().requestInterstitial()).resolves.toBe(true)
  })
})

describe('MockPlatform — ngôn ngữ', () => {
  it('đặt được lang từ ngoài', async () => {
    const p = new MockPlatform()
    p.lang = 'vi-VN'
    expect(await p.getLanguage()).toBe('vi-VN')
  })
})

describe('sentinel', () => {
  it('marker đủ đặc trưng để grep trong dist', () => {
    // check-bundle.mjs tìm đúng chuỗi này trong dist/ và fail nếu thấy.
    // Đổi giá trị này thì phải đổi cả scripts/check-bundle.mjs.
    expect(DEV_MOCK_MARKER).toBe('SPAWNED_BY_DEV_MOCK_ONLY')
  })
})
