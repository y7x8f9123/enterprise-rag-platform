import { describe, expect, it, vi } from 'vitest'
import { getServiceHealth } from '../api/client'
import { readServiceHealth } from './serviceHealth'

vi.mock('../api/client', () => ({ getServiceHealth: vi.fn() }))

describe('readServiceHealth', () => {
  it('returns unavailable when a health endpoint cannot be reached', async () => {
    vi.mocked(getServiceHealth).mockRejectedValue(new Error('offline'))

    await expect(readServiceHealth('backend')).resolves.toBe('unavailable')
  })
})

