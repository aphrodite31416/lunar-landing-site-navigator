import { manifestUrl } from './loadManifest'
import type { TerrainScenario } from '../types/science'

const scenarioCache = new Map<string, Promise<TerrainScenario>>()

const windowKinds = ['sunlight', 'earth', 'joint', 'darkness', 'insufficient_light', 'earth_gap'] as const

export function loadScenario(scenarioUrl: string): Promise<TerrainScenario> {
  const url = new URL(scenarioUrl, manifestUrl())
  const cached = scenarioCache.get(url.href)
  if (cached) return cached

  const pending = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load the scenario (${response.status})`)
    }
    const scenario = (await response.json()) as TerrainScenario
    checkScenario(scenario)
    return scenario
  })
  scenarioCache.set(url.href, pending)
  pending.catch(() => {
    scenarioCache.delete(url.href)
  })
  return pending
}

function checkScenario(scenario: TerrainScenario) {
  if (scenario.kind !== 'terrain_scenario') {
    throw new Error('The file is not a terrain scenario')
  }
  if (!Array.isArray(scenario.series) || scenario.series.length === 0) {
    throw new Error('The scenario has no time samples')
  }
  if (!scenario.period || !scenario.metrics || !Array.isArray(scenario.events) || !scenario.windows) {
    throw new Error('The scenario is missing its period, metrics, events or windows')
  }
  for (const kind of windowKinds) {
    if (!Array.isArray(scenario.windows[kind])) {
      throw new Error(`The scenario has no ${kind} window list`)
    }
  }
  // The timeline uses binary search on offset_s.
  for (let i = 1; i < scenario.series.length; i++) {
    if (!(scenario.series[i].offset_s >= scenario.series[i - 1].offset_s)) {
      throw new Error('The scenario samples are not in time order')
    }
  }
}
