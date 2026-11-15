import { inWindows } from './timeline'
import type { TerrainScenario, VisibilitySample } from '../types/science'

/** Live visibility at the selected timeline sample, for the 3D site label. */
export type LiveStatus = {
  utc: string
  sunlight: boolean
  earth: boolean
  joint: boolean
}

export function liveStatusFrom(scenario: TerrainScenario, sample: VisibilitySample): LiveStatus {
  const offset = sample.offset_s
  return {
    utc: sample.utc,
    sunlight: inWindows(scenario.windows.sunlight, offset),
    earth: inWindows(scenario.windows.earth, offset),
    joint: inWindows(scenario.windows.joint, offset),
  }
}
