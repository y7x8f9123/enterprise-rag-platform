import { getServiceHealth } from '../api/client'

export type HealthState = 'loading' | 'healthy' | 'unavailable'

export async function readServiceHealth(
  service: 'backend' | 'ai',
): Promise<Exclude<HealthState, 'loading'>> {
  try {
    const response = await getServiceHealth(service)
    return response.status === 'UP' ? 'healthy' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

