import { useEffect, useState } from 'react'
import { ScenarioTimeline } from './ScenarioTimeline'
import { SiteComparison } from './SiteComparison'
import { SiteMetrics } from './SiteMetrics'
import { loadScenario } from '../sites/loadScenario'
import { formatUtc, messageFrom } from '../science/format'
import type { Site, TerrainScenario } from '../types/science'

type View = 'timeline' | 'metrics' | 'compare'

const views: { id: View; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'metrics', label: 'Site metrics' },
  { id: 'compare', label: 'Compare sites' },
]

export function SiteScience({ site }: { site: Site }) {
  const [view, setView] = useState<View>('timeline')

  return (
    <aside
      className={view === 'compare' ? 'terrain-science terrain-science-wide' : 'terrain-science'}
      aria-label={`${site.name} scenario`}
    >
      {/* Keyed so the scenario and timeline position reset when the site changes. */}
      <SitePanel key={site.site_id} site={site} view={view} onView={setView} />
    </aside>
  )
}

function SitePanel({ site, view, onView }: { site: Site; view: View; onView: (view: View) => void }) {
  const { scenario, error, unavailable, retry } = useSiteScenario(site)
  const [index, setIndex] = useState(0)

  return (
    <>
      <p className="terrain-science-title">{site.name}</p>
      {scenario && (
        <p className="terrain-science-period">
          Scenario period {formatUtc(scenario.period.start_utc)} – {formatUtc(scenario.period.end_utc)}
        </p>
      )}
      <div className="terrain-science-tabs" role="group" aria-label="Scenario views">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            className="terrain-info-toggle"
            aria-pressed={item.id === view}
            onClick={() => onView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {view === 'compare' ? (
        <SiteComparison site={site} scenario={scenario} />
      ) : unavailable ? (
        <p className="terrain-science-note">{unavailable}</p>
      ) : error ? (
        <div className="terrain-science-warning">
          <p>{error}</p>
          <button type="button" className="terrain-info-toggle" onClick={retry}>
            Retry
          </button>
        </div>
      ) : !scenario ? (
        <p className="terrain-science-note">Loading the {site.name} scenario…</p>
      ) : view === 'timeline' ? (
        <ScenarioTimeline scenario={scenario} index={index} onIndex={setIndex} />
      ) : (
        <SiteMetrics scenario={scenario} />
      )}
    </>
  )
}

function useSiteScenario(site: Site) {
  const scenarioUrl = site.terrain_status === 'ready' ? site.scenario_url : null
  const [scenario, setScenario] = useState<TerrainScenario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!scenarioUrl) return
    let cancelled = false
    loadScenario(scenarioUrl)
      .then((loaded) => {
        if (cancelled) return
        if (loaded.site_id !== site.site_id) {
          setError(`The scenario file is for ${loaded.site_id}, not ${site.site_id}`)
          return
        }
        setScenario(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageFrom(caught, `Could not load the ${site.name} scenario`))
      })
    return () => {
      cancelled = true
    }
  }, [scenarioUrl, site.site_id, site.name, attempt])

  let unavailable: string | null = null
  if (site.terrain_status !== 'ready') {
    unavailable = `The terrain analysis for ${site.name} is not complete yet (${site.terrain_status}), so no scenario timeline is available.`
  } else if (!site.scenario_url) {
    unavailable = `No scenario file is listed for ${site.name}.`
  }

  const retry = () => {
    setError(null)
    setAttempt((count) => count + 1)
  }

  return { scenario, error, unavailable, retry }
}
