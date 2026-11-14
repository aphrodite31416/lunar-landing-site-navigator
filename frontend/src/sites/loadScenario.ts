import type { TerrainScenario } from '../types/science'

const scenarioCache = new Map<string, Promise<TerrainScenario>>()

export function loadScenario(scenarioUrl: string): Promise<TerrainScenario> {
  const manifestUrl = new URL('data/manifest.json', document.baseURI)
  const url = new URL(scenarioUrl, manifestUrl)
  const cached = scenarioCache.get(url.href)
  if (cached) return cached

  const pending = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load the scenario (${response.status})`)
    }
    const scenario = (await response.json()) as TerrainScenario
    if (!Array.isArray(scenario.series) || scenario.series.length === 0) {
      throw new Error('The scenario has no time samples')
    }
    return scenario
  })
  scenarioCache.set(url.href, pending)
  pending.catch(() => {
    scenarioCache.delete(url.href)
  })
  return pending
}
