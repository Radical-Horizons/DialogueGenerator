import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createChunkCoalescer } from './chunkCoalescer'

describe('createChunkCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('livre en un seul appel tous les deltas d’un intervalle', () => {
    const onFlush = vi.fn()
    const coalescer = createChunkCoalescer<string>(onFlush, 80)

    coalescer.push('a')
    coalescer.push('b')
    expect(onFlush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(80)
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith(['a', 'b'])
  })

  it('flush livre tout de suite et ne relivre pas au timer', () => {
    const onFlush = vi.fn()
    const coalescer = createChunkCoalescer<string>(onFlush, 80)

    coalescer.push('a')
    coalescer.flush()
    vi.advanceTimersByTime(200)

    expect(onFlush).toHaveBeenCalledTimes(1)
  })

  it('cancel abandonne ce qui attend', () => {
    const onFlush = vi.fn()
    const coalescer = createChunkCoalescer<string>(onFlush, 80)

    coalescer.push('a')
    coalescer.cancel()
    vi.advanceTimersByTime(200)

    expect(onFlush).not.toHaveBeenCalled()
  })
})
