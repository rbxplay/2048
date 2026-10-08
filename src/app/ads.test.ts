import { describe, expect, it } from 'vitest'
import { MIN_SESSION_MS, shouldRequestInterstitial, shouldRequestInterstitialFor } from './ads'

const T0 = 1_000_000

describe('shouldRequestInterstitial — §A8 / US-05 AC3', () => {
  it('không hiện trong 30 giây đầu của phiên', () => {
    expect(
      shouldRequestInterstitial({ gameOvers: 2, sessionStartedAt: T0 }, T0 + 29_000),
    ).toBe(false)
  })

  it('đúng mốc 30 giây thì được phép', () => {
    expect(
      shouldRequestInterstitial({ gameOvers: 2, sessionStartedAt: T0 }, T0 + MIN_SESSION_MS),
    ).toBe(true)
  })

  it('ván game over đầu tiên không hiện quảng cáo (tối đa 1 lần mỗi 2 ván)', () => {
    expect(shouldRequestInterstitial({ gameOvers: 1, sessionStartedAt: T0 }, T0 + 60_000)).toBe(
      false,
    )
  })

  it('ván thứ hai thì hiện', () => {
    expect(shouldRequestInterstitial({ gameOvers: 2, sessionStartedAt: T0 }, T0 + 60_000)).toBe(
      true,
    )
  })

  it('ván thứ ba không hiện', () => {
    expect(shouldRequestInterstitial({ gameOvers: 3, sessionStartedAt: T0 }, T0 + 60_000)).toBe(
      false,
    )
  })

  it('ván thứ tư hiện', () => {
    expect(shouldRequestInterstitial({ gameOvers: 4, sessionStartedAt: T0 }, T0 + 60_000)).toBe(
      true,
    )
  })

  it('chưa có ván nào thì không hiện', () => {
    expect(shouldRequestInterstitial({ gameOvers: 0, sessionStartedAt: T0 }, T0 + 60_000)).toBe(
      false,
    )
  })

  it('MIN_SESSION_MS là 30 giây', () => {
    expect(MIN_SESSION_MS).toBe(30_000)
  })
})

describe('shouldRequestInterstitialFor — một yêu cầu cho MỘT lần thua', () => {
  const now = T0 + 60_000

  it('chưa xin lần nào thì hành xử y như chính sách gốc', () => {
    expect(shouldRequestInterstitialFor({ gameOvers: 2, sessionStartedAt: T0 }, null, now)).toBe(
      true,
    )
    expect(shouldRequestInterstitialFor({ gameOvers: 1, sessionStartedAt: T0 }, null, now)).toBe(
      false,
    )
    expect(shouldRequestInterstitialFor({ gameOvers: 0, sessionStartedAt: T0 }, null, now)).toBe(
      false,
    )
  })

  it('đã xin cho lần thua này rồi thì thôi — dù chính sách vẫn cho phép', () => {
    expect(shouldRequestInterstitial({ gameOvers: 2, sessionStartedAt: T0 }, now)).toBe(true)
    expect(shouldRequestInterstitialFor({ gameOvers: 2, sessionStartedAt: T0 }, 2, now)).toBe(false)
  })

  it('lần thua khác thì chốt không chặn', () => {
    expect(shouldRequestInterstitialFor({ gameOvers: 4, sessionStartedAt: T0 }, 2, now)).toBe(true)
    // `null` và 0 là hai chuyện khác nhau: chưa xin lần nào ≠ đã xin ở lần thua 0.
    expect(shouldRequestInterstitialFor({ gameOvers: 2, sessionStartedAt: T0 }, 0, now)).toBe(true)
  })
})
