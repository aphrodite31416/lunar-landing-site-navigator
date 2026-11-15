import { useEffect, useState } from 'react'
import { loadManifest } from '../sites/loadManifest'
import type { Manifest, ScenarioMetrics, Site, SiteId } from '../types/science'

type MonthlyScenario = {
  site_id: SiteId
  url: string
  metrics: ScenarioMetrics
}

export function SiteCompare({
  sites,
  selectedSiteId,
}: {
  sites: Site[]
  selectedSiteId: SiteId
}) {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadManifest()
      .then((loaded) => {
        if (!cancelled) setManifest(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageFrom(caught, 'Could not load the comparison'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const monthly = manifest?.datasets.find(
    (dataset) => dataset.kind === 'terrain_scenarios' && dataset.id === 'monthly-2026-11',
  )

  return (
    <aside className="terrain-compare" aria-label="Compare sites">
      <p className="terrain-science-title">Compare</p>
      {error && <p className="terrain-readout-status">{error}</p>}
      {!error && !manifest && <p>Loading the comparison…</p>}
      {manifest && manifest.status !== 'ready' && <p className="terrain-readout-status">The manifest is not ready.</p>}
      {manifest?.status === 'ready' && monthly && monthly.kind === 'terrain_scenarios' && (
        <CompareTable
          startUtc={monthly.start_utc}
          endUtc={monthly.end_utc}
          scenarios={monthly.scenarios}
          sites={sites}
          selectedSiteId={selectedSiteId}
        />
      )}
      {manifest?.status === 'ready' && !monthly && (
        <p className="terrain-readout-status">The monthly comparison is not in the manifest.</p>
      )}
    </aside>
  )
}

function CompareTable({
  startUtc,
  endUtc,
  scenarios,
  sites,
  selectedSiteId,
}: {
  startUtc: string
  endUtc: string
  scenarios: MonthlyScenario[]
  sites: Site[]
  selectedSiteId: SiteId
}) {
  const names = new Map(sites.map((site) => [site.site_id, site.name]))

  return (
    <>
      <p className="terrain-science-note">
        {formatUtc(startUtc)} – {formatUtc(endUtc)}. Hours are the manifest durations divided by 3600. This table does
        not load the scenario files.
      </p>
      <table className="terrain-compare-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {scenarios.map((scenario) => (
              <th
                key={scenario.site_id}
                scope="col"
                className={scenario.site_id === selectedSiteId ? 'terrain-compare-selected' : undefined}
              >
                {names.get(scenario.site_id) ?? scenario.site_id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {scenarios.map((scenario) => (
                <td
                  key={scenario.site_id}
                  className={scenario.site_id === selectedSiteId ? 'terrain-compare-selected' : undefined}
                >
                  {row.cell(scenario.metrics)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const rows: { label: string; cell: (metrics: ScenarioMetrics) => string }[] = [
  { label: 'Sunlight time', cell: (metrics) => formatPercent(metrics.sunlight_time_fraction) },
  { label: 'Mean solar disc', cell: (metrics) => formatPercent(metrics.mean_sun_visible_fraction) },
  { label: 'Earth visible', cell: (metrics) => formatHours(metrics.earth_visible_s) },
  { label: 'Longest Earth gap', cell: (metrics) => formatHours(metrics.longest_earth_gap_s) },
  { label: 'Joint', cell: (metrics) => formatHours(metrics.joint_s) },
  { label: 'Longest joint', cell: (metrics) => formatHours(metrics.longest_joint_s) },
  { label: 'Longest insufficient light', cell: (metrics) => formatHours(metrics.longest_insufficient_light_s) },
  { label: 'Longest darkness', cell: (metrics) => formatHours(metrics.longest_darkness_s) },
  {
    label: 'Energy',
    cell: (metrics) => (metrics.energy_wh === null ? 'No panel' : `${metrics.energy_wh} Wh`),
  },
]

function formatHours(seconds: number) {
  return `${(seconds / 3600).toFixed(1)} h`
}

function formatPercent(fraction: number) {
  return `${(fraction * 100).toFixed(1)}%`
}

function formatUtc(utc: string) {
  if (!utc.endsWith('Z')) return utc
  const withoutZone = utc.slice(0, -1)
  const withSpace = withoutZone.replace('T', ' ')
  return `${withSpace.endsWith('.000') ? withSpace.slice(0, -4) : withSpace} UTC`
}

function messageFrom(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}
