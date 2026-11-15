import { useEffect, useState } from 'react'
import { loadManifest, scenarioDatasetFor } from '../sites/loadManifest'
import { loadSites } from '../sites/loadSites'
import {
  exactSeconds,
  formatDurationCompact,
  formatPercent,
  messageFrom,
} from '../science/format'
import { metricDifferences, sameValue } from '../science/timeline'
import { groupByValue, siteList } from '../science/compare'
import type { Clock } from '../science/clock'
import { CompareTimelines } from './CompareTimelines'
import { MetricDotPlot, type DotRow } from './MetricDotPlot'
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
  clock,
  names,
  onPick,
}: {
  site: Site
  scenario: TerrainScenario | null
  onSelectSite?: (siteId: SiteId) => void
  clock: Clock | null
  names: Partial<Record<SiteId, string>>
  onPick: (siteId: SiteId, clock: Clock) => void
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

  const ready = columns.filter((column): column is Column & { metrics: ScenarioMetrics } => column.metrics !== null)
  const lede = ledeSentences(ready, periodS, threshold)
  const verdicts = verdictsFor(ready, periodS)
  const pickAtClock = (siteId: SiteId) => {
    if (onSelectSite) onSelectSite(siteId)
  }

  return (
    <>
      {lede.length > 0 && <p className="cmp-lede">{lede.join(' ')}</p>}
      {checks.map((warning) => (
        <p key={warning} className="terrain-science-warning">
          {warning}
        </p>
      ))}

      <section className="cmp-section" aria-labelledby="cmp-verdicts">
        <h2 className="cmp-h" id="cmp-verdicts">
          At a glance
        </h2>
        <div className="verdicts">
          {verdicts.map((verdict) => (
            <div key={verdict.label} className={`verdict verdict-${verdict.tone}`}>
              <p className="verdict-label">{verdict.label}</p>
              {verdict.single ? (
                <button type="button" className="verdict-win" onClick={() => pickAtClock(verdict.single as SiteId)}>
                  {verdict.winner}
                  <span className="verdict-place">{names[verdict.single] ?? ''}</span>
                </button>
              ) : (
                <p className="verdict-win verdict-tie">
                  {verdict.winner}
                  <span className="verdict-place">{verdict.detail}</span>
                </p>
              )}
              <p className="verdict-value">{verdict.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cmp-section" aria-labelledby="cmp-timelines">
        <div className="cmp-section-head">
          <h2 className="cmp-h" id="cmp-timelines">
            Four sites on one clock
          </h2>
          <p className="cmp-sub">The white line is the shared moment. Click any row to explore that site at that time.</p>
        </div>
        <CompareTimelines sites={data.sites} names={names} clock={clock} selectedId={site.site_id} onPick={onPick} />
      </section>

      <section className="cmp-section" aria-labelledby="cmp-dots">
        <div className="cmp-section-head">
          <h2 className="cmp-h" id="cmp-dots">
            Durations on one scale
          </h2>
          <p className="cmp-sub">
            Each dot is a site, on the full {formatDurationCompact(periodS)} period. The filled dot leads; ties share it.
          </p>
        </div>
        <MetricDotPlot rows={dotRows(threshold)} columns={columns} periodS={periodS} selectedId={site.site_id} />
      </section>

      <details className="sci-details cmp-exact">
        <summary>Exact values for every metric</summary>
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
      </details>
    </>
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

type ReadyColumn = Column & { metrics: ScenarioMetrics }

/** Lead sentences assembled from the metrics by fixed templates; ties are stated as ties. */
function ledeSentences(ready: ReadyColumn[], periodS: number, threshold: string) {
  if (ready.length < 2 || periodS <= 0) return []
  // "100.0% of the period at Sites 01, 07 and 11; 98.5% at Site 04"
  const describe = (pick: (metrics: ScenarioMetrics) => number) =>
    groupByValue(ready, (column) => pick(column.metrics), 'max').map(
      (group, index) =>
        `${formatPercent(group.value)}${index === 0 ? ' of the period' : ''} at ${siteList(group.items.map((item) => item.site.site_id))}`,
    )
  const spread = (pick: (metrics: ScenarioMetrics) => number) => {
    const values = ready.map((column) => pick(column.metrics))
    return (Math.max(...values) - Math.min(...values)) * 100
  }
  const sunPick = (metrics: ScenarioMetrics) => metrics.sunlight_time_fraction
  const earthPick = (metrics: ScenarioMetrics) => metrics.earth_visible_s / periodS
  const sun = describe(sunPick)
  const earth = describe(earthPick)
  const sentences = [
    sun.length === 1
      ? `Sunlight (at least ${threshold} of the disc) covers ${sun[0].replace(/ at .*/, '')} at every site.`
      : `Sunlight (at least ${threshold} of the disc) covers ${sun.join('; ')}.`,
    earth.length === 1
      ? `Earth line of sight covers ${earth[0].replace(/ at .*/, '')} at every site.`
      : `Earth line of sight covers ${earth.join('; ')}.`,
  ]
  const sunSpread = spread(sunPick)
  const earthSpread = spread(earthPick)
  if (!sameValue(sunSpread, earthSpread)) {
    sentences.push(
      earthSpread > sunSpread
        ? `Earth line of sight separates the sites more than sunlight does: a spread of ${earthSpread.toFixed(1)} percentage points against ${sunSpread.toFixed(1)}.`
        : `Sunlight separates the sites more than Earth line of sight does: a spread of ${sunSpread.toFixed(1)} percentage points against ${earthSpread.toFixed(1)}.`,
    )
  }
  return sentences
}

type Verdict = { label: string; tone: Tone; winner: string; detail: string; single: SiteId | null; value: string }

/** One leader per question; equal values are reported as a tie, never as a winner. */
function verdictsFor(ready: ReadyColumn[], periodS: number): Verdict[] {
  if (ready.length < 2) return []
  const questions: {
    label: string
    tone: Tone
    better: 'max' | 'min'
    pick: (metrics: ScenarioMetrics) => number
    show: (value: number) => string
  }[] = [
    { label: 'Most Earth line of sight', tone: 'earth', better: 'max', pick: (m) => m.earth_visible_s, show: (v) => `${formatPercent(v / periodS)} of the period` },
    { label: 'Longest joint window', tone: 'joint', better: 'max', pick: (m) => m.longest_joint_s, show: (v) => `${formatDurationCompact(v)} unbroken` },
    { label: 'Shortest Earth gap', tone: 'earth', better: 'min', pick: (m) => m.longest_earth_gap_s, show: (v) => `${formatDurationCompact(v)} longest gap` },
    { label: 'Most sunlight', tone: 'sun', better: 'max', pick: (m) => m.sunlight_s, show: (v) => `${formatPercent(v / periodS)} of the period` },
  ]
  const tieWords = ['', '', 'Two-way tie', 'Three-way tie', 'Four-way tie']
  return questions.map((question) => {
    const groups = groupByValue(ready, (column) => question.pick(column.metrics), question.better)
    const lead = groups[0]
    const ids = lead.items.map((item) => item.site.site_id)
    if (groups.length === 1) {
      return { label: question.label, tone: question.tone, winner: 'Equal at every site', detail: '', single: null, value: question.show(lead.value) }
    }
    return {
      label: question.label,
      tone: question.tone,
      winner: ids.length === 1 ? siteList(ids) : (tieWords[ids.length] ?? 'Tie'),
      detail: ids.length === 1 ? '' : siteList(ids),
      single: ids.length === 1 ? ids[0] : null,
      value: question.show(lead.value),
    }
  })
}

function dotRows(threshold: string): DotRow[] {
  return [
    { label: 'Earth line of sight', better: 'max', tone: 'earth', value: (m) => m.earth_visible_s },
    { label: 'Longest Earth gap', better: 'min', tone: 'earth', value: (m) => m.longest_earth_gap_s },
    { label: 'Joint time', better: 'max', tone: 'joint', value: (m) => m.joint_s },
    { label: 'Longest joint window', better: 'max', tone: 'joint', value: (m) => m.longest_joint_s },
    { label: 'Sunlight', better: 'max', tone: 'sun', value: (m) => m.sunlight_s },
    { label: 'Longest sunlight', better: 'max', tone: 'sun', value: (m) => m.longest_sunlight_s },
    { label: `Longest below ${threshold}`, better: 'min', tone: 'sun', value: (m) => m.longest_insufficient_light_s },
    { label: 'Longest darkness', better: 'min', tone: 'sun', value: (m) => m.longest_darkness_s },
  ]
}
