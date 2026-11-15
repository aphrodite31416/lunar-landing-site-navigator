import { useEffect, useState } from 'react'
import { loadManifest, scenarioDatasetFor } from '../sites/loadManifest'
import { loadSites } from '../sites/loadSites'
import {
  exactSeconds,
  formatDurationCompact,
  formatLatLon,
  formatPercent,
  messageFrom,
} from '../science/format'
import { metricDifferences, sameValue } from '../science/timeline'
import type { Manifest, ScenarioMetrics, Site, SiteId, TerrainScenario } from '../types/science'

type Better = 'max' | 'min' | null
type Tone = 'sun' | 'earth' | 'joint' | 'energy'

type Row = {
  label: string
  better: Better
  value: (metrics: ScenarioMetrics) => number | null
  show: (metrics: ScenarioMetrics) => string
  title?: (metrics: ScenarioMetrics) => string
  /** Bar length as a fraction of the full scale; null draws no bar. */
  bar?: (metrics: ScenarioMetrics, periodS: number) => number | null
}

type Group = { title: string; tone: Tone; rows: Row[] }

type Column = { site: Site; metrics: ScenarioMetrics | null }

function durationRow(label: string, key: keyof ScenarioMetrics, better: Better): Row {
  return {
    label,
    better,
    value: (metrics) => metrics[key],
    show: (metrics) => formatDurationCompact(metrics[key] ?? Number.NaN),
    title: (metrics) => exactSeconds(metrics[key] ?? Number.NaN),
    bar: (metrics, periodS) => {
      const value = metrics[key]
      return value === null || periodS <= 0 ? null : value / periodS
    },
  }
}

function groupsFor(threshold: string): Group[] {
  return [
    {
      title: `Sunlight (≥ ${threshold} of the solar disc)`,
      tone: 'sun',
      rows: [
        {
          ...durationRow('Total sunlight', 'sunlight_s', 'max'),
          show: (metrics) =>
            `${formatDurationCompact(metrics.sunlight_s)} · ${formatPercent(metrics.sunlight_time_fraction)}`,
        },
        durationRow('Longest sunlight', 'longest_sunlight_s', 'max'),
        durationRow(`Longest below ${threshold}`, 'longest_insufficient_light_s', 'min'),
        durationRow('Longest darkness', 'longest_darkness_s', 'min'),
        {
          label: 'Mean disc visible',
          better: 'max',
          value: (metrics) => metrics.mean_sun_visible_fraction,
          show: (metrics) => formatPercent(metrics.mean_sun_visible_fraction),
          bar: (metrics) => metrics.mean_sun_visible_fraction,
        },
      ],
    },
    {
      title: 'Earth line of sight (geometric)',
      tone: 'earth',
      rows: [
        durationRow('Total line of sight', 'earth_visible_s', 'max'),
        durationRow('Longest Earth gap', 'longest_earth_gap_s', 'min'),
      ],
    },
    {
      title: 'Joint: sunlight and Earth together',
      tone: 'joint',
      rows: [
        durationRow('Total joint time', 'joint_s', 'max'),
        durationRow('Longest joint window', 'longest_joint_s', 'max'),
      ],
    },
    {
      title: 'Energy',
      tone: 'energy',
      rows: [
        {
          label: 'Panel energy',
          better: null,
          value: (metrics) => metrics.energy_wh,
          show: (metrics) =>
            metrics.energy_wh === null ? 'No panel model' : `${metrics.energy_wh.toFixed(1)} Wh`,
        },
      ],
    },
  ]
}

const betterHint: Record<Exclude<Better, null>, string> = {
  max: 'more is better',
  min: 'shorter is better',
}

export function SiteComparison({
  site,
  scenario,
  onSelectSite,
}: {
  site: Site
  scenario: TerrainScenario | null
  onSelectSite?: (siteId: SiteId) => void
}) {
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

  const columns: Column[] = data.sites.map((entry) => ({
    site: entry,
    metrics: dataset.scenarios.find((item) => item.site_id === entry.site_id)?.metrics ?? null,
  }))
  const periodS = (Date.parse(dataset.end_utc) - Date.parse(dataset.start_utc)) / 1000
  const threshold = formatPercent(data.manifest.settings.minimum_sun_fraction, 0)
  const groups = groupsFor(threshold)
  const checks = consistencyWarnings(data.manifest, dataset, site, scenario)

  const ranking = rankingLines(columns)

  return (
    <>
      <p className="terrain-science-note">
        All four sites from the same terrain-scenario run (<code>{dataset.id}</code>): same period, same {threshold}{' '}
        sunlight threshold.{onSelectSite && ' Select a site card or column to view it.'}
      </p>
      {checks.map((warning) => (
        <p key={warning} className="terrain-science-warning">
          {warning}
        </p>
      ))}

      {ranking.length > 0 && (
        <section className="cmp-rank" aria-label="At-a-glance ranking">
          {ranking.map((line) => (
            <p key={line.label} className={`cmp-rank-line cmp-tone-${line.tone}`}>
              <span className="cmp-rank-label">{line.label}</span>
              <span className="cmp-rank-value">{line.value}</span>
            </p>
          ))}
        </section>
      )}

      <section className="sci-section" aria-labelledby="cmp-overview-title">
        <h3 className="sci-section-title" id="cmp-overview-title">
          Share of the period
        </h3>
        <OverviewCards
          columns={columns}
          selectedId={site.site_id}
          periodS={periodS}
          threshold={threshold}
          onSelectSite={onSelectSite}
        />
      </section>

      <section className="sci-section" aria-labelledby="cmp-detail-title">
        <h3 className="sci-section-title" id="cmp-detail-title">
          Detailed metrics
        </h3>
        <div className="terrain-compare-scroll" role="region" aria-label="Four-site comparison table" tabIndex={0}>
          <table className="terrain-compare cmp-table">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                {columns.map(({ site: entry }) => {
                  const selected = entry.site_id === site.site_id
                  return (
                    <th
                      key={entry.site_id}
                      scope="col"
                      className={selected ? 'terrain-compare-selected' : undefined}
                    >
                      {onSelectSite && !selected ? (
                        <button
                          type="button"
                          className="cmp-col-button"
                          onClick={() => onSelectSite(entry.site_id)}
                          title={`View ${entry.name}`}
                        >
                          {entry.name}
                        </button>
                      ) : (
                        entry.name
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.title} className={`cmp-group cmp-tone-${group.tone}`}>
                <tr className="cmp-group-row">
                  <th scope="colgroup" colSpan={columns.length + 1}>
                    {group.title}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <MetricRow key={row.label} row={row} columns={columns} selectedId={site.site_id} periodS={periodS} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <ul className="terrain-track-list cmp-notes">
        <li>
          <span className="cmp-best-badge">Best</span> and ★ mark the leading site (ties share it); rows where all
          sites are equal are not marked. Bars are drawn against the full {formatDurationCompact(periodS)} period.
        </li>
        <li>
          Sunlight means at least {threshold} of the sampled solar disc is visible. Earth line of sight is geometric
          (Earth centre above the terrain horizon), not a guaranteed communication link.
        </li>
        <li>
          “Longest” values are measured within this period. A window that touches the period edge is clipped, so the
          real duration may be longer; the Site metrics view marks these for the selected site.
        </li>
        <li>The 2009–2013 historical illumination statistics are a separate dataset and are not mixed in here.</li>
        {dataset.missing_horizon_site_ids.length > 0 && (
          <li>Sites still awaiting a terrain horizon: {dataset.missing_horizon_site_ids.join(', ')}.</li>
        )}
      </ul>
    </>
  )
}

function OverviewCards({
  columns,
  selectedId,
  periodS,
  threshold,
  onSelectSite,
}: {
  columns: Column[]
  selectedId: SiteId
  periodS: number
  threshold: string
  onSelectSite?: (siteId: SiteId) => void
}) {
  const share = (seconds: number) => (periodS > 0 ? seconds / periodS : 0)
  const measures: { label: string; tone: Tone; value: (metrics: ScenarioMetrics) => number }[] = [
    { label: `Sunlight ≥ ${threshold}`, tone: 'sun', value: (metrics) => metrics.sunlight_time_fraction },
    { label: 'Earth line of sight', tone: 'earth', value: (metrics) => share(metrics.earth_visible_s) },
    { label: 'Sunlight + Earth', tone: 'joint', value: (metrics) => share(metrics.joint_s) },
  ]
  const bests = measures.map((measure) =>
    bestOf(
      'max',
      columns.map(({ metrics }) => (metrics ? measure.value(metrics) : null)),
    ),
  )

  return (
    <div className="cmp-cards">
      {columns.map(({ site, metrics }) => {
        const selected = site.site_id === selectedId
        const body = (
          <>
            <span className="cmp-card-head">
              <span className="cmp-card-name">{site.name}</span>
              {selected && <span className="cmp-card-tag">Viewing</span>}
            </span>
            <span className="cmp-card-coords">{formatLatLon(site.latitude_deg, site.longitude_deg)}</span>
            {metrics ? (
              measures.map((measure, i) => {
                const value = measure.value(metrics)
                const best = bests[i] !== null && sameValue(value, bests[i])
                return (
                  <span key={measure.label} className={`cmp-measure cmp-tone-${measure.tone}`}>
                    <span className="cmp-measure-label">{measure.label}</span>
                    <span className="cmp-measure-value">
                      {best && (
                        <span className="cmp-star" title="Best of the four sites">
                          ★<span className="sr-only"> best</span>
                        </span>
                      )}
                      {formatPercent(value)}
                    </span>
                    <span className="cmp-bar" aria-hidden="true">
                      <span className="cmp-bar-fill" style={{ width: `${Math.min(100, value * 100)}%` }} />
                    </span>
                  </span>
                )
              })
            ) : (
              <span className="cmp-card-missing">No scenario for this site</span>
            )}
          </>
        )
        return onSelectSite && !selected ? (
          <button
            key={site.site_id}
            type="button"
            className="cmp-card"
            onClick={() => onSelectSite(site.site_id)}
            aria-label={`View ${site.name}`}
          >
            {body}
          </button>
        ) : (
          <div key={site.site_id} className={selected ? 'cmp-card cmp-card-selected' : 'cmp-card'}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

function MetricRow({
  row,
  columns,
  selectedId,
  periodS,
}: {
  row: Row
  columns: Column[]
  selectedId: SiteId
  periodS: number
}) {
  const best = row.better
    ? bestOf(
        row.better,
        columns.map(({ metrics }) => (metrics ? row.value(metrics) : null)),
      )
    : null
  return (
    <tr>
      <th scope="row">
        {row.label}
        {row.better && <span className="cmp-hint">{betterHint[row.better]}</span>}
      </th>
      {columns.map(({ site, metrics }) => {
        const classes: string[] = []
        if (site.site_id === selectedId) classes.push('terrain-compare-selected')
        const value = metrics ? row.value(metrics) : null
        const isBest = best !== null && value !== null && sameValue(value, best)
        if (isBest) classes.push('terrain-compare-best')
        const bar = metrics && row.bar ? row.bar(metrics, periodS) : null
        return (
          <td
            key={site.site_id}
            className={classes.join(' ') || undefined}
            title={metrics && row.title ? row.title(metrics) : undefined}
          >
            <span className="cmp-cell">
              <span className="cmp-cell-value">
                {metrics ? row.show(metrics) : 'No scenario'}
                {isBest && <span className="cmp-best-badge">Best</span>}
              </span>
              {bar !== null && (
                <span className="cmp-bar cmp-bar-thin" aria-hidden="true">
                  <span className="cmp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} />
                </span>
              )}
            </span>
          </td>
        )
      })}
    </tr>
  )
}

function bestOf(better: Exclude<Better, null>, candidates: (number | null)[]) {
  const values = candidates.filter((value): value is number => value !== null)
  if (values.length < 2) return null
  const best = better === 'max' ? Math.max(...values) : Math.min(...values)
  if (values.every((value) => sameValue(value, best))) return null
  return best
}

/** Short ranking lines from real scenario metrics only — no invented scores. */
function rankingLines(columns: Column[]) {
  const ready = columns.filter((column): column is Column & { metrics: ScenarioMetrics } => column.metrics !== null)
  if (ready.length < 2) return []

  const leaders = (
    tone: Tone,
    label: string,
    pick: (metrics: ScenarioMetrics) => number,
    better: 'max' | 'min',
  ) => {
    const values = ready.map(({ metrics }) => pick(metrics))
    const best = better === 'max' ? Math.max(...values) : Math.min(...values)
    const names = ready.filter(({ metrics }) => sameValue(pick(metrics), best)).map(({ site }) => site.name)
    if (names.length === ready.length) return null
    return { tone, label, value: names.join(' · ') }
  }

  return [
    leaders('sun', 'Most continuous sunlight', (metrics) => metrics.longest_sunlight_s, 'max'),
    leaders('earth', 'Most Earth line of sight', (metrics) => metrics.earth_visible_s, 'max'),
    leaders('joint', 'Most joint time', (metrics) => metrics.joint_s, 'max'),
    leaders('earth', 'Shortest Earth gap', (metrics) => metrics.longest_earth_gap_s, 'min'),
  ].filter((line): line is { tone: Tone; label: string; value: string } => line !== null)
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
