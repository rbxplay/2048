import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLATFORM_TIMEOUT_MS, withTimeout } from './types'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('trả giá trị thật khi promise xong trước hạn', async () => {
    await expect(withTimeout(Promise.resolve('xong'), 50, 'dự phòng')).resolves.toBe('xong')
  })

  it('trả dự phòng khi quá hạn — KHÔNG reject', async () => {
    vi.useFakeTimers()
    const treo = new Promise<string>(() => {})
    const p = withTimeout(treo, 1000, 'dự phòng')
    await vi.advanceTimersByTimeAsync(1001)
    await expect(p).resolves.toBe('dự phòng')
  })

  it('trả dự phòng khi promise reject — KHÔNG reject', async () => {
    await expect(withTimeout(Promise.reject(new Error('lỗi')), 50, 'dự phòng')).resolves.toBe(
      'dự phòng',
    )
  })

  it('không resolve hai lần khi promise xong sát hạn', async () => {
    vi.useFakeTimers()
    const p = withTimeout(Promise.resolve('thật'), 100, 'dự phòng')
    await vi.advanceTimersByTimeAsync(200)
    await expect(p).resolves.toBe('thật')
  })

  it('hằng số timeout khớp sample chính thức của Google', () => {
    expect(PLATFORM_TIMEOUT_MS).toBe(2000)
  })
})
