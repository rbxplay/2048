import { describe, expect, it } from 'vitest'
import { choosePlatformKind } from './select'

describe('choosePlatformKind', () => {
  it('trong Playables ⇒ youtube, bất kể dev hay không', () => {
    expect(choosePlatformKind({ inPlayables: true, isDev: true })).toBe('youtube')
    expect(choosePlatformKind({ inPlayables: true, isDev: false })).toBe('youtube')
  })

  // Đây là §5a: mock KHÔNG được lọt vào bundle production.
  it('ngoài Playables + production ⇒ youtube, KHÔNG BAO GIỜ mock', () => {
    expect(choosePlatformKind({ inPlayables: false, isDev: false })).toBe('youtube')
  })

  it('ngoài Playables + dev ⇒ mock', () => {
    expect(choosePlatformKind({ inPlayables: false, isDev: true })).toBe('mock')
  })
})
