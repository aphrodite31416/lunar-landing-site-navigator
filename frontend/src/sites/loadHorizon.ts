import { manifestUrl } from './loadManifest'
import type { HorizonProfile } from '../types/science'

const horizonCache = new Map<string, Promise<HorizonProfile>>()

export function loadHorizon(horizonUrl: string): Promise<HorizonProfile> {
  const url = new URL(horizonUrl, manifestUrl())
  const cached = horizonCache.get(url.href)
  if (cached) return cached

  const pending = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load the horizon profile (${response.status})`)
    }
    const horizon = (await response.json()) as HorizonProfile
    const n = horizon.n_az
    if (
      !Array.isArray(horizon.az_deg) ||
      !Array.isArray(horizon.horizon_deg) ||
      horizon.az_deg.length !== n ||
      horizon.horizon_deg.length !== n ||
      n < 2
    ) {
      throw new Error('The horizon profile arrays are missing or inconsistent')
    }
    const anyValid = horizon.horizon_deg.some(
      (value, i) => horizon.valid?.[i] !== false && Number.isFinite(value),
    )
    if (!anyValid) throw new Error('The horizon profile has no valid directions')
    return horizon
  })
  horizonCache.set(url.href, pending)
  pending.catch(() => {
    horizonCache.delete(url.href)
  })
  return pending
}
