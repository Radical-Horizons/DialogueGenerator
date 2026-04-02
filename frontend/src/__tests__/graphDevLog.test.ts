import { describe, it, expect, vi, afterEach } from 'vitest'
import { graphDevWarn } from '../utils/graphDevLog'

describe('graphDevLog', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('graphDevWarn does not call console.warn when DEV is false', () => {
    vi.stubEnv('DEV', false)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    graphDevWarn('msg', { a: 1 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('graphDevWarn calls console.warn when DEV is true', () => {
    vi.stubEnv('DEV', true)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    graphDevWarn('msg', { a: 1 })
    expect(spy).toHaveBeenCalledWith('msg', { a: 1 })
  })
})
