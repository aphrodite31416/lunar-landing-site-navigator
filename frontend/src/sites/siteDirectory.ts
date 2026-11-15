import { useEffect, useState } from 'react'
import type { LiveStatus } from '../science/liveStatus'
import { loadTerrainMeta } from '../terrain/loadTerrain'
import type { ScenarioMetrics, Site, SiteId } from '../types/science'
import { loadManifest, scenarioDatasetFor } from './loadManifest'

/** Share of the scenario period with sunlight (>= threshold) and with Earth line of sight. */
export type Shares = { sun: number; earth: number }

/** Place name from the terrain file, without the "(Site01)" suffix. */
export function placeName(terrainName: string) {
  return terrainName.replace(/\s*\(Site\s*\d+\)\s*$/i, '')
}

/** Place names (terrain files) and period shares (manifest metrics) for every site. */
export function useSiteDirectory(sites: Site[]) {
  const [names, setNames] = useState<Partial<Record<SiteId, string>>>({})
  const [shares, setShares] = useState<Partial<Record<SiteId, Shares>>>({})
  const key = sites.map((site) => site.site_id).join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const ids = key.split(',') as SiteId[]
    Promise.all(ids.map((id) => loadTerrainMeta(id).then((meta) => [id, placeName(meta.name)] as const).catch(() => null)))
      .then((entries) => {
        if (cancelled) return
        const next: Partial<Record<SiteId, string>> = {}
        for (const entry of entries) if (entry) next[entry[0]] = entry[1]
        setNames(next)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    if (sites.length === 0) return
    let cancelled = false
    loadManifest()
      .then((manifest) => {
        if (cancelled) return
        const dataset = scenarioDatasetFor(manifest, sites[0].scenario_url)
        if (!dataset) return
        const periodS = (Date.parse(dataset.end_utc) - Date.parse(dataset.start_utc)) / 1000
        const next: Partial<Record<SiteId, Shares>> = {}
        for (const entry of dataset.scenarios) {
          const metrics: ScenarioMetrics = entry.metrics
          next[entry.site_id] = { sun: metrics.sunlight_time_fraction, earth: metrics.earth_visible_s / periodS }
        }
        setShares(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sites])

  return { names, shares }
}

export function liveLabel(live: LiveStatus) {
  return `Now: sunlight ${live.sunlight ? 'yes' : 'no'}, Earth ${live.earth ? 'in view' : 'hidden'}, joint ${live.joint ? 'yes' : 'no'}`
}

