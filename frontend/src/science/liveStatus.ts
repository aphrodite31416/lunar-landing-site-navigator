import { inWindows } from './timeline'
import type { TerrainScenario, VisibilitySample } from '../types/science'

/** Live visibility at the selected moment, for the 3D site label and the site rail. */
export type LiveStatus = {
  utc: string
  sunlight: boolean
  earth: boolean
  joint: boolean
}

/** States at an exact offset, read from the precomputed windows (authoritative at event boundaries). */
export function liveStatusAt(scenario: TerrainScenario, offsetS: number, utc: string): LiveStatus {
  return {
    utc,
    sunlight: inWindows(scenario.windows.sunlight, offsetS),
    earth: inWindows(scenario.windows.earth, offsetS),
    joint: inWindows(scenario.windows.joint, offsetS),
  }
}

export function liveStatusFrom(scenario: TerrainScenario, sample: VisibilitySample): LiveStatus {
  return liveStatusAt(scenario, sample.offset_s, sample.utc)
}
