import { useEffect, useState } from 'react'
import { loadScenario } from '../sites/loadScenario'
import { messageFrom } from './format'
import type { Site, TerrainScenario } from '../types/science'

type Loaded = { url: string; scenario: TerrainScenario | null; error: string | null }

/**
 * The terrain scenario of one site. Only a scenario that belongs to the given
 * site is ever returned, so a slow response for the previous site can never be
 * shown under the new one.
 */
export function useScenario(site: Site | null) {
  const scenarioUrl = site && site.terrain_status === 'ready' ? site.scenario_url : null
  const siteId = site?.site_id ?? null
  const siteName = site?.name ?? ''
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!scenarioUrl || !siteId) return
    let cancelled = false
    loadScenario(scenarioUrl)
      .then((scenario) => {
        if (cancelled) return
        if (scenario.site_id !== siteId) {
          setLoaded({ url: scenarioUrl, scenario: null, error: `The scenario file is for ${scenario.site_id}, not ${siteId}` })
          return
        }
        setLoaded({ url: scenarioUrl, scenario, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoaded({ url: scenarioUrl, scenario: null, error: messageFrom(caught, `Could not load the ${siteName} scenario`) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [scenarioUrl, siteId, siteName, attempt])

  const current = loaded && loaded.url === scenarioUrl ? loaded : null
  const scenario = current?.scenario && current.scenario.site_id === siteId ? current.scenario : null
  const error = current?.error ?? null

  let unavailable: string | null = null
  if (site && site.terrain_status !== 'ready') {
    unavailable = `The terrain analysis for ${site.name} is not complete yet (${site.terrain_status}), so no scenario is available.`
  } else if (site && !site.scenario_url) {
    unavailable = `No scenario file is listed for ${site.name}.`
  }

  const retry = () => {
    setLoaded(null)
    setAttempt((count) => count + 1)
  }

  return { scenario, error, unavailable, loading: !!scenarioUrl && !current, retry }
}
