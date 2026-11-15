import { useEffect, useId, useState } from 'react'
import { HorizonView } from './HorizonView'
import { ScenarioTimeline } from './ScenarioTimeline'
import { SiteComparison } from './SiteComparison'
import { SiteMetrics } from './SiteMetrics'
import { loadScenario } from '../sites/loadScenario'
import { formatUtc, messageFrom } from '../science/format'
import { liveStatusFrom, type LiveStatus } from '../science/liveStatus'
import type { Site, SiteId, TerrainScenario } from '../types/science'

type View = 'timeline' | 'metrics' | 'compare'

const views: { id: View; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'metrics', label: 'Site metrics' },
  { id: 'compare', label: 'Compare sites' },
]

export function SiteScience({
  site,
  onSelectSite,
  onLiveStatus,
}: {
  site: Site
  onSelectSite?: (siteId: SiteId) => void
  onLiveStatus?: (status: LiveStatus | null) => void
}) {
  const [view, setView] = useState<View>('timeline')
  const [open, setOpen] = useState(true)
  const bodyId = useId()

  const classes = ['terrain-science']
  if (!open) classes.push('terrain-science-collapsed')
  else if (view === 'compare') classes.push('terrain-science-wide')

  return (
    <aside className={classes.join(' ')} aria-label={`${site.name} scenario`}>
      <div className="terrain-science-header">
        <div className="terrain-science-heading">
          <p className="terrain-science-title">{site.name}</p>
          <button
            type="button"
            className="terrain-info-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Hide panel' : 'Show panel'}
          </button>
        </div>
        {open && (
          <div className="terrain-science-tabs" role="group" aria-label="Scenario views">
            {views.map((item) => (
              <button
                key={item.id}
                type="button"
                className="terrain-info-toggle"
                aria-pressed={item.id === view}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Hidden rather than unmounted so the loaded scenario and timeline position survive collapsing. */}
      <div id={bodyId} hidden={!open}>
        {/* Keyed so the scenario and timeline position reset when the site changes. */}
        <SitePanel
          key={site.site_id}
          site={site}
          view={view}
          onSelectSite={onSelectSite}
          onLiveStatus={onLiveStatus}
        />
      </div>
    </aside>
  )
}

function SitePanel({
  site,
  view,
  onSelectSite,
  onLiveStatus,
}: {
  site: Site
  view: View
  onSelectSite?: (siteId: SiteId) => void
  onLiveStatus?: (status: LiveStatus | null) => void
}) {
  const { scenario, error, unavailable, retry } = useSiteScenario(site)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!onLiveStatus) return
    if (!scenario) {
      onLiveStatus(null)
      return
    }
    const sample = scenario.series[Math.min(Math.max(index, 0), scenario.series.length - 1)]
    onLiveStatus(liveStatusFrom(scenario, sample))
  }, [scenario, index, onLiveStatus])

  useEffect(() => {
    return () => onLiveStatus?.(null)
  }, [onLiveStatus])

  return (
    <>
      {scenario && (
        <p className="terrain-science-period">
          Scenario period {formatUtc(scenario.period.start_utc)} – {formatUtc(scenario.period.end_utc)}
        </p>
      )}
      {view === 'compare' ? (
        <SiteComparison site={site} scenario={scenario} onSelectSite={onSelectSite} />
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
        <ScenarioTimeline
          scenario={scenario}
          index={index}
          onIndex={setIndex}
          sky={(sample) => <HorizonView site={site} scenario={scenario} sample={sample} />}
        />
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
