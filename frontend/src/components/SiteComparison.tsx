import { useEffect, useState } from 'react'
import { loadManifest, scenarioDatasetFor } from '../sites/loadManifest'
import { loadSites } from '../sites/loadSites'
import { exactSeconds, formatDurationCompact, formatPercent, formatUtc, messageFrom } from '../science/format'
import { metricDifferences, sameValue } from '../science/timeline'
import type { Manifest, ScenarioMetrics, Site, TerrainScenario } from '../types/science'

type Better = 'max' | 'min' | null

type Row = {
  label: string
  better: Better
  value: (metrics: ScenarioMetrics) => number | null
  show: (metrics: ScenarioMetrics) => string
  title?: (metrics: ScenarioMetrics) => string
}

function durationRow(label: string, key: keyof ScenarioMetrics, better: Better): Row {
  return {
    label,
    better,
    value: (metrics) => metrics[key],
    show: (metrics) => formatDurationCompact(metrics[key] ?? Number.NaN),
    title: (metrics) => exactSeconds(metrics[key] ?? Number.NaN),
  }
}

function rowsFor(threshold: string): Row[] {
  return [
    {
      label: `Sunlight (≥ ${threshold} disc)`,
      better: 'max',
      value: (metrics) => metrics.sunlight_s,
      show: (metrics) =>
        `${formatDurationCompact(metrics.sunlight_s)} (${formatPercent(metrics.sunlight_time_fraction)})`,
      title: (metrics) => exactSeconds(metrics.sunlight_s),
    },
    durationRow('Longest sunlight', 'longest_sunlight_s', 'max'),
    durationRow(`Longest below ${threshold}`, 'longest_insufficient_light_s', 'min'),
    durationRow('Longest darkness', 'longest_darkness_s', 'min'),
    {
      label: 'Mean disc visible',
      better: 'max',
      value: (metrics) => metrics.mean_sun_visible_fraction,
      show: (metrics) => formatPercent(metrics.mean_sun_visible_fraction),
    },
    durationRow('Earth line of sight', 'earth_visible_s', 'max'),
    durationRow('Longest Earth gap', 'longest_earth_gap_s', 'min'),
    durationRow('Joint sunlight + Earth', 'joint_s', 'max'),
    durationRow('Longest joint window', 'longest_joint_s', 'max'),
    {
      label: 'Panel energy',
      better: null,
      value: (metrics) => metrics.energy_wh,
      show: (metrics) => (metrics.energy_wh === null ? 'No panel model' : `${metrics.energy_wh.toFixed(1)} Wh`),
    },
  ]
}

export function SiteComparison({ site, scenario }: { site: Site; scenario: TerrainScenario | null }) {
  const [data, setData] = useState<{ manifest: Manifest; sites: Site[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadManifest(), loadSites()])
      .then(([manifest, sites]) => {
        if (!cancelled) setData({ manifest, sites })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageFrom(caught, 'Could not load the site comparison'))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (error) {
    return (
      <div className="terrain-science-warning">
        <p>{error}</p>
        <button
          type="button"
          className="terrain-info-toggle"
          onClick={() => {
            setError(null)
            setAttempt((count) => count + 1)
          }}
        >
          Retry
        </button>
      </div>
    )
  }
  if (!data) return <p className="terrain-science-note">Loading the site comparison…</p>

  const dataset = scenarioDatasetFor(data.manifest, site.scenario_url)
  if (!dataset) {
    return <p className="terrain-science-note">The manifest has no terrain-scenario dataset to compare.</p>
  }

  const columns = data.sites.map((entry) => ({
    site: entry,
    metrics: dataset.scenarios.find((item) => item.site_id === entry.site_id)?.metrics ?? null,
  }))
  const threshold = formatPercent(data.manifest.settings.minimum_sun_fraction, 0)
  const rows = rowsFor(threshold)
  const checks = consistencyWarnings(data.manifest, dataset, site, scenario)

  return (
    <>
      <p className="terrain-science-note">
        Dataset <code>{dataset.id}</code>: {formatUtc(dataset.start_utc)} – {formatUtc(dataset.end_utc)}. Values are
        each site&apos;s terrain-scenario metrics as recorded in the manifest by the same pipeline run that wrote the
        scenario files. The 2009–2013 historical sample statistics are a different dataset and are not shown.
      </p>
      {checks.map((warning) => (
        <p key={warning} className="terrain-science-warning">
          {warning}
        </p>
      ))}
      <div className="terrain-compare-scroll">
        <table className="terrain-compare">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {columns.map(({ site: entry }) => (
                <th
                  key={entry.site_id}
                  scope="col"
                  className={entry.site_id === site.site_id ? 'terrain-compare-selected' : undefined}
                >
                  {entry.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const best = bestValue(row, columns.map((column) => column.metrics))
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {columns.map(({ site: entry, metrics }) => {
                    const classes: string[] = []
                    if (entry.site_id === site.site_id) classes.push('terrain-compare-selected')
                    const value = metrics ? row.value(metrics) : null
                    if (best !== null && value !== null && sameValue(value, best)) classes.push('terrain-compare-best')
                    return (
                      <td
                        key={entry.site_id}
                        className={classes.join(' ') || undefined}
                        title={metrics && row.title ? row.title(metrics) : undefined}
                      >
                        {metrics ? row.show(metrics) : 'No scenario'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ul className="terrain-track-list">
        <li>Bold marks the best value in a row (ties included); rows where all sites are equal are not marked.</li>
        <li>
          Sunlight means at least {threshold} of the sampled solar disc is visible. Earth line of sight is geometric
          (Earth centre above the terrain horizon), not a guaranteed communication link.
        </li>
        <li>
          “Longest” values are measured within this period. A window that touches the period edge is clipped, so the
          real duration may be longer; the Site metrics view marks these for the selected site.
        </li>
        {dataset.missing_horizon_site_ids.length > 0 && (
          <li>Sites still awaiting a terrain horizon: {dataset.missing_horizon_site_ids.join(', ')}.</li>
        )}
      </ul>
    </>
  )
}

function bestValue(row: Row, records: (ScenarioMetrics | null)[]) {
  if (!row.better) return null
  const values = records.flatMap((metrics) => {
    const value = metrics ? row.value(metrics) : null
    return value === null ? [] : [value]
  })
  if (values.length < 2) return null
  const best = row.better === 'max' ? Math.max(...values) : Math.min(...values)
  if (values.every((value) => sameValue(value, best))) return null
  return best
}

function consistencyWarnings(
  manifest: Manifest,
  dataset: NonNullable<ReturnType<typeof scenarioDatasetFor>>,
  site: Site,
  scenario: TerrainScenario | null,
) {
  if (!scenario || scenario.site_id !== site.site_id) return []
  const warnings: string[] = []
  const entry = dataset.scenarios.find((item) => item.site_id === site.site_id)
  if (entry) {
    const differences = metricDifferences(entry.metrics, scenario.metrics)
    if (differences.length > 0) {
      warnings.push(
        `The manifest metrics for ${site.name} differ from its loaded scenario file (${differences.join(', ')}). The data may be out of sync; rerun the frontend sync.`,
      )
    }
  }
  if (
    Date.parse(dataset.start_utc) !== Date.parse(scenario.period.start_utc) ||
    Date.parse(dataset.end_utc) !== Date.parse(scenario.period.end_utc)
  ) {
    warnings.push(`The loaded ${site.name} scenario covers a different period from the ${dataset.id} dataset.`)
  }
  if (manifest.settings.minimum_sun_fraction !== scenario.model.settings.minimum_sun_fraction) {
    warnings.push(`The ${site.name} scenario uses a different sunlight threshold from the manifest settings.`)
  }
  return warnings
}
