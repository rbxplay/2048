import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLATFORM_TIMEOUT_MS } from './types'
import { YouTubePlatform, isPlayablesEnv, toScoreValue } from './youtube'
import type { SaveData } from '../game/persist'
import type { Ytgame } from './ytgame'

function fakeSdk(overrides: Partial<Ytgame> = {}): Ytgame {
  const base = {
    SDK_VERSION: 'test',
    IN_PLAYABLES_ENV: true,
    game: {
      firstFrameReady: vi.fn(),
      gameReady: vi.fn(),
      loadData: vi.fn(async () => ''),
      saveData: vi.fn(async () => {}),
    },
    system: {
      getLanguage: vi.fn(async () => 'vi-VN'),
      onPause: vi.fn(),
      onResume: vi.fn(),
      isAudioEnabled: vi.fn(() => true),
      onAudioEnabledChange: vi.fn(),
    },
    engagement: { sendScore: vi.fn(async () => {}) },
    health: { logError: vi.fn() },
  }
  return { ...base, ...overrides } as unknown as Ytgame
}

function install(sdk: Ytgame | undefined): void {
  if (sdk === undefined) delete (window as { ytgame?: Ytgame }).ytgame
  else (window as { ytgame?: Ytgame }).ytgame = sdk
}

afterEach(() => {
  install(undefined)
  vi.useRealTimers()
})

describe('isPlayablesEnv', () => {
  it('false khi không có SDK', () => {
    install(undefined)
    expect(isPlayablesEnv()).toBe(false)
  })

  it('false khi SDK tồn tại nhưng IN_PLAYABLES_ENV false (chạy local)', () => {
    // Đây là cái bẫy: `typeof ytgame !== "undefined"` sẽ trả true ở đây và
    // đẩy local vào nhánh "YouTube thật" gọi toàn no-op.
    install(fakeSdk({ IN_PLAYABLES_ENV: false }))
    expect(isPlayablesEnv()).toBe(false)
  })

  it('true khi IN_PLAYABLES_ENV true (trong iframe YouTube)', () => {
    install(fakeSdk())
    expect(isPlayablesEnv()).toBe(true)
  })
})

describe('toScoreValue', () => {
  it('kẹp về số nguyên không âm', () => {
    expect(toScoreValue(12.7)).toBe(12)
    expect(toScoreValue(-5)).toBe(0)
    expect(toScoreValue(Number.NaN)).toBe(0)
    expect(toScoreValue(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('YouTubePlatform — vòng đời gọi đúng tên API', () => {
  it('notifyFirstFrame gọi firstFrameReady', () => {
    const sdk = fakeSdk()
    install(sdk)
    new YouTubePlatform().notifyFirstFrame()
    expect(sdk.game.firstFrameReady).toHaveBeenCalledOnce()
  })

  it('notifyGameReady gọi gameReady', () => {
    const sdk = fakeSdk()
    install(sdk)
    new YouTubePlatform().notifyGameReady()
    expect(sdk.game.gameReady).toHaveBeenCalledOnce()
  })

  it('không throw khi SDK vắng mặt', () => {
    install(undefined)
    const p = new YouTubePlatform()
    expect(() => p.notifyFirstFrame()).not.toThrow()
    expect(() => p.notifyGameReady()).not.toThrow()
  })
})

describe('YouTubePlatform — load và save', () => {
  const save: SaveData = {
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

  it('load đọc và parse dữ liệu SDK trả về', async () => {
    const sdk = fakeSdk()
    sdk.game.loadData = vi.fn(async () => JSON.stringify(save))
    install(sdk)
    const p = new YouTubePlatform()
    const got = await p.load()
    expect(got!.score).toBe(4)
  })

  it('load trả null khi SDK trả chuỗi rỗng', async () => {
    install(fakeSdk())
    expect(await new YouTubePlatform().load()).toBeNull()
  })

  it('save ghi qua saveData sau khi load xong', async () => {
    const sdk = fakeSdk()
    install(sdk)
    const p = new YouTubePlatform()
    await p.load()
    await p.save(save)
    expect(sdk.game.saveData).toHaveBeenCalledOnce()
    expect(sdk.game.saveData).toHaveBeenCalledWith(JSON.stringify(save))
  })

  it('saveData reject KHÔNG làm gián đoạn ván đấu', async () => {
    const sdk = fakeSdk()
    install(sdk)
    const p = new YouTubePlatform()
    await p.load()
    sdk.game.saveData = vi.fn(async () => {
      throw new Error('hết chỗ')
    })
    await expect(p.save(save)).resolves.toBeUndefined()
  })

  it('bỏ qua save khi loadData chưa xong', async () => {
    const sdk = fakeSdk()
    install(sdk)
    const p = new YouTubePlatform()
    await p.save(save)
    expect(sdk.game.saveData).not.toHaveBeenCalled()
  })

  // Test quan trọng nhất của file này. Xem spec §4.3.
  it('loadData TREO ⇒ KHÔNG BAO GIỜ save nữa (không ghi đè kỷ lục bằng 0)', async () => {
    vi.useFakeTimers()
    const sdk = fakeSdk()
    sdk.game.loadData = vi.fn(() => new Promise<string>(() => {}))
    install(sdk)
    const p = new YouTubePlatform()

    const loading = p.load()
    await vi.advanceTimersByTimeAsync(PLATFORM_TIMEOUT_MS + 1)
    expect(await loading).toBeNull()

    await p.save(save)
    expect(sdk.game.saveData).not.toHaveBeenCalled()
  })

  it('loadData REJECT ⇒ cũng không bao giờ save nữa', async () => {
    const sdk = fakeSdk()
    sdk.game.loadData = vi.fn(async () => {
      throw new Error('hỏng')
    })
    install(sdk)
    const p = new YouTubePlatform()
    expect(await p.load()).toBeNull()
    await p.save(save)
    expect(sdk.game.saveData).not.toHaveBeenCalled()
  })

  it('loadData trả JSON hỏng ⇒ coi như load thành công với ván mới, save vẫn chạy', async () => {
    const sdk = fakeSdk()
    sdk.game.loadData = vi.fn(async () => '{rác')
    install(sdk)
    const p = new YouTubePlatform()
    expect(await p.load()).toBeNull()
    await p.save(save)
    expect(sdk.game.saveData).toHaveBeenCalledOnce()
  })
})

describe('YouTubePlatform — audio, pause, ads, điểm', () => {
  it('isAudioEnabled false khi YouTube đang mute', () => {
    const sdk = fakeSdk()
    sdk.system.isAudioEnabled = vi.fn(() => false)
    install(sdk)
    expect(new YouTubePlatform().isAudioEnabled()).toBe(false)
  })

  it('isAudioEnabled mặc định true khi không có SDK', () => {
    install(undefined)
    expect(new YouTubePlatform().isAudioEnabled()).toBe(true)
  })

  it('onAudioEnabledChange chuyển tiếp callback', () => {
    const sdk = fakeSdk()
    install(sdk)
    const cb = vi.fn()
    new YouTubePlatform().onAudioEnabledChange(cb)
    expect(sdk.system.onAudioEnabledChange).toHaveBeenCalledWith(cb)
  })

  it('onPause/onResume chuyển tiếp callback', () => {
    const sdk = fakeSdk()
    install(sdk)
    const p = new YouTubePlatform()
    const a = vi.fn()
    const b = vi.fn()
    p.onPause(a)
    p.onResume(b)
    expect(sdk.system.onPause).toHaveBeenCalledWith(a)
    expect(sdk.system.onResume).toHaveBeenCalledWith(b)
  })

  it('requestInterstitial trả false khi SDK không có ads', async () => {
    install(fakeSdk())
    expect(await new YouTubePlatform().requestInterstitial()).toBe(false)
  })

  it('requestInterstitial trả true khi ads chạy xong', async () => {
    const sdk = fakeSdk({ ads: { requestInterstitialAd: vi.fn(async () => {}) } })
    install(sdk)
    expect(await new YouTubePlatform().requestInterstitial()).toBe(true)
  })

  it('requestInterstitial trả false khi ads reject', async () => {
    const sdk = fakeSdk({
      ads: {
        requestInterstitialAd: vi.fn(async () => {
          throw new Error('không có quảng cáo')
        }),
      },
    })
    install(sdk)
    expect(await new YouTubePlatform().requestInterstitial()).toBe(false)
  })

  it('reportScore gửi số nguyên đã kẹp', async () => {
    const sdk = fakeSdk()
    install(sdk)
    await new YouTubePlatform().reportScore(12.9)
    expect(sdk.engagement.sendScore).toHaveBeenCalledWith({ value: 12 })
  })

  it('logError gọi health.logError KHÔNG tham số', () => {
    const sdk = fakeSdk()
    install(sdk)
    new YouTubePlatform().logError()
    expect(sdk.health.logError).toHaveBeenCalledWith()
  })

  it("getLanguage trả 'en' khi SDK treo", async () => {
    vi.useFakeTimers()
    const sdk = fakeSdk()
    sdk.system.getLanguage = vi.fn(() => new Promise<string>(() => {}))
    install(sdk)
    const p = new YouTubePlatform().getLanguage()
    await vi.advanceTimersByTimeAsync(PLATFORM_TIMEOUT_MS + 1)
    expect(await p).toBe('en')
  })

  it('mọi method không throw khi SDK hỏng hoàn toàn', async () => {
    install({} as Ytgame)
    const p = new YouTubePlatform()
    await expect(p.init()).resolves.toBeUndefined()
    await expect(p.load()).resolves.toBeNull()
    await expect(p.getLanguage()).resolves.toBe('en')
    await expect(p.reportScore(1)).resolves.toBeUndefined()
    await expect(p.requestInterstitial()).resolves.toBe(false)
    expect(() => p.notifyFirstFrame()).not.toThrow()
    expect(() => p.notifyGameReady()).not.toThrow()
    expect(() => p.logError()).not.toThrow()
    expect(() => p.onPause(() => {})).not.toThrow()
    expect(() => p.onResume(() => {})).not.toThrow()
    expect(() => p.onAudioEnabledChange(() => {})).not.toThrow()
    expect(p.isAudioEnabled()).toBe(true)
  })
})
