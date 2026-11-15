import { Fragment, useEffect, useState, type MouseEvent } from 'react'
import { clockOffsetOnSource, clockOnSource, type Clock } from '../science/clock'
import { sharedGaps, sourceFromScenario, sourceFromSummary, type Interval, type TimelineSource } from '../science/compare'
import { formatDuration, formatUtcDay, formatUtcShort, messageFrom } from '../science/format'
import { dayTicks } from '../science/timeline'
import { loadCompareSummary } from '../sites/loadCompareSummary'
import { loadManifest, scenarioDatasetFor } from '../sites/loadManifest'
import { loadScenario } from '../sites/loadScenario'
import type { Site, SiteId, VisibilityWindow } from '../types/science'

type Loaded = Partial<Record<SiteId, TimelineSource | { error: string }>>

/**
 * Timeline sources for every site. The lightweight comparison summary (about
 * 10 KB) is used when it matches the manifest; otherwise each full scenario
 * file is loaded instead, which gives the same windows.
 */
function useTimelineSources(sites: Site[]) {
  const [loaded, setLoaded] = useState<Loaded>({})

  useEffect(() => {
    let cancelled = false
    const fromScenarios = () => {
      for (const site of sites) {
        if (site.terrain_status !== 'ready' || !site.scenario_url) continue
        loadScenario(site.scenario_url)
          .then((scenario) => {
            if (!cancelled) setLoaded((current) => ({ ...current, [site.site_id]: sourceFromScenario(scenario) }))
          })
          .catch((caught: unknown) => {
            if (!cancelled) {
              setLoaded((current) => ({ ...current, [site.site_id]: { error: messageFrom(caught, 'Could not load') } }))
            }
          })
      }
    }
    loadManifest()
      .then((manifest) => {
        const dataset = scenarioDatasetFor(manifest, sites[0]?.scenario_url ?? null)
        if (!dataset) throw new Error('No terrain-scenario dataset in the manifest')
        return loadCompareSummary(manifest, dataset)
      })
      .then((summary) => {
        if (cancelled) return
        const next: Loaded = {}
        for (const site of summary.sites) next[site.site_id] = sourceFromSummary(site)
        if (sites.some((site) => !next[site.site_id])) throw new Error('The summary is missing a listed site')
        setLoaded(next)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        console.warn(`${messageFrom(caught, 'Comparison summary unavailable')}; loading the full scenario files instead.`)
        fromScenarios()
      })
    return () => {
      cancelled = true
    }
  }, [sites])

  return loaded
}

/**
 * Sun, Earth and Joint windows of every site on one time axis, with the shared
 * clock drawn across all rows. Spans where no site has Earth line of sight (or
 * sunlight) are computed from the windows themselves.
 */
export function CompareTimelines({
  sites,
  names,
  clock,
  selectedId,
  onPick,
}: {
  sites: Site[]
  names: Partial<Record<SiteId, string>>
  clock: Clock | null
  selectedId: SiteId
  onPick: (siteId: SiteId, clock: Clock) => void
}) {
  const loaded = useTimelineSources(sites)

  const scenarios = sites
    .map((site) => loaded[site.site_id])
    .filter((entry): entry is TimelineSource => !!entry && !('error' in entry))
  const allLoaded = scenarios.length === sites.length && sites.length > 0
  const axis = scenarios[0] ?? null
  const earthGaps = allLoaded ? sharedGaps(scenarios, 'earth') : null
  const sunGaps = allLoaded ? sharedGaps(scenarios, 'sunlight') : null

  if (!axis) {
    return (
      <div className="ctl ctl-loading" aria-busy="true">
        <p>Loading the four scenarios…</p>
        {sites.map((site) => (
          <span key={site.site_id} className="ctl-skeleton" />
        ))}
      </div>
    )
  }

  const origin = axis.origin_offset_s
  const end = axis.end_offset_s
  const pct = (offset: number) => `${Math.min(Math.max(((offset - origin) / (end - origin)) * 100, 0), 100)}%`
  const span = (start: number, stop: number) => ({ left: pct(start), width: `calc(${pct(stop)} - ${pct(start)})` })
  const ticks = dayTicks(axis.period, origin)
  const clockOffset = clockOffsetOnSource(clock, axis)

  const pickAt = (event: MouseEvent<HTMLDivElement>, site: Site, source: TimelineSource) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    onPick(site.site_id, clockOnSource(source, origin + fraction * (end - origin)))
  }

  return (
    <div className="ctl">
      <div className="ctl-grid">
        <div className="ctl-axis ctl-axis-top" aria-hidden="true">
          {ticks
            .filter((tick) => tick.index % 5 === 0)
            .map((tick) => (
              <span key={tick.ms} style={{ left: pct(tick.offset_s) }}>
                {formatUtcDay(tick.ms)}
              </span>
            ))}
        </div>

        <div className="ctl-plot" style={{ gridRow: `2 / span ${sites.length}` }}>
          {ticks.map((tick) => (
            <span
              key={tick.ms}
              className={tick.index % 5 === 0 ? 'ctl-gridline ctl-gridline-major' : 'ctl-gridline'}
              style={{ left: pct(tick.offset_s) }}
            />
          ))}
          {earthGaps?.map((gap) => (
            <GapBand key={`e${gap.start}`} gap={gap} style={span(gap.start, gap.end)} label="No site has Earth" tone="earth" />
          ))}
          {sunGaps?.map((gap) => (
            <GapBand key={`s${gap.start}`} gap={gap} style={span(gap.start, gap.end)} label="No site has sunlight" tone="sun" />
          ))}
          <span className="ctl-now" style={{ left: pct(clockOffset) }} aria-hidden="true" />
        </div>

        {sites.map((site, index) => {
          const entry = loaded[site.site_id]
          const scenario = entry && !('error' in entry) ? entry : null
          const selected = site.site_id === selectedId
          const row = index + 2
          return (
            <Fragment key={site.site_id}>
              <button
                type="button"
                style={{ gridRow: row, gridColumn: 1 }}
                className={selected ? 'ctl-name ctl-selected' : 'ctl-name'}
                disabled={!scenario}
                onClick={() => scenario && onPick(site.site_id, clockOnSource(scenario, clockOffsetOnSource(clock, scenario)))}
                title={`Explore ${site.name} at the selected moment`}
              >
                <span className="ctl-name-num">{site.site_id.slice(4)}</span>
                <span className="ctl-name-text">{names[site.site_id] ?? site.name}</span>
              </button>
              {scenario ? (
                <div
                  style={{ gridRow: row, gridColumn: 2 }}
                  className={selected ? 'ctl-lanes ctl-selected' : 'ctl-lanes'}
                  onClick={(event) => pickAt(event, site, scenario)}
                  title={`Click to explore ${site.name} at that moment`}
                >
                  <Lane windows={scenario.windows.sunlight} extra={scenario.windows.insufficient_light} tone="sun" span={span} />
                  <Lane windows={scenario.windows.earth} tone="earth" span={span} />
                  <Lane windows={scenario.windows.joint} tone="joint" span={span} />
                </div>
              ) : (
                <div className="ctl-lanes ctl-lanes-empty" style={{ gridRow: row, gridColumn: 2 }}>
                  {entry && 'error' in entry ? entry.error : <span className="ctl-skeleton" />}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      <ul className="ctl-legend" aria-label="Legend">
        <li>
          <i className="ctl-key ctl-key-sun" /> Sunlight ≥ threshold
        </li>
        <li>
          <i className="ctl-key ctl-key-low" /> Below threshold
        </li>
        <li>
          <i className="ctl-key ctl-key-earth" /> Earth line of sight
        </li>
        <li>
          <i className="ctl-key ctl-key-joint" /> Joint
        </li>
        <li>
          <i className="ctl-key ctl-key-gap" /> No site has Earth
        </li>
        <li>
          <i className="ctl-key ctl-key-now" /> Shared clock
        </li>
      </ul>

      {allLoaded && earthGaps && (
        <GapFindings
          gaps={earthGaps}
          sunGaps={sunGaps ?? []}
          onGo={(offset) => onPick(selectedId, clockOnSource(scenarios.find((s) => s.site_id === selectedId) ?? axis, offset))}
        />
      )}
    </div>
  )
}

function Lane({
  windows,
  extra,
  tone,
  span,
}: {
  windows: VisibilityWindow[]
  extra?: VisibilityWindow[]
  tone: 'sun' | 'earth' | 'joint'
  span: (start: number, stop: number) => { left: string; width: string }
}) {
  return (
    <span className="ctl-lane">
      {extra?.map((w) => (
        <span key={`x${w.start_offset_s}`} className="ctl-win ctl-win-low" style={span(w.start_offset_s, w.end_offset_s)} />
      ))}
      {windows.map((w) => (
        <span
          key={w.start_offset_s}
          className={`ctl-win ctl-win-${tone}${w.start_clipped ? ' ctl-clip-start' : ''}${w.end_clipped ? ' ctl-clip-end' : ''}`}
          style={span(w.start_offset_s, w.end_offset_s)}
        />
      ))}
    </span>
  )
}

function GapBand({
  gap,
  style,
  label,
  tone,
}: {
  gap: Interval
  style: { left: string; width: string }
  label: string
  tone: 'earth' | 'sun'
}) {
  return (
    <span
      className={`ctl-band ctl-band-${tone}${gap.startClipped ? ' ctl-clip-start' : ''}${gap.endClipped ? ' ctl-clip-end' : ''}`}
      style={style}
      title={`${label}: ${formatUtcShort(gap.startUtc)} – ${formatUtcShort(gap.endUtc)} (${formatDuration(gap.end - gap.start)})`}
    />
  )
}

/** Sentences generated from the computed gaps, with jump links. */
function GapFindings({ gaps, sunGaps, onGo }: { gaps: Interval[]; sunGaps: Interval[]; onGo: (offset: number) => void }) {
  if (gaps.length === 0 && sunGaps.length === 0) {
    return <p className="ctl-finding">At every moment of the period at least one site has Earth line of sight and at least one has sunlight.</p>
  }
  const longest = [...gaps].sort((a, b) => b.end - b.start - (a.end - a.start))[0]
  return (
    <div className="ctl-findings">
      {gaps.map((gap) => (
        <p key={gap.start} className={gap === longest ? 'ctl-finding ctl-finding-key' : 'ctl-finding'}>
          <span className="ctl-finding-mark" aria-hidden="true" />
          <span>
            No site has Earth line of sight from <strong>{formatUtcShort(gap.startUtc)}</strong>
            {gap.startClipped && ' (the period start; it may begin earlier)'} to{' '}
            <strong>{formatUtcShort(gap.endUtc)}</strong>
            {gap.endClipped && ' (the period end; it may continue)'}, {formatDuration(gap.end - gap.start)}. Choosing a
            different site cannot avoid this span.{' '}
            <button type="button" className="ctl-go" onClick={() => onGo(gap.start)}>
              Go to its start
            </button>
          </span>
        </p>
      ))}
      {sunGaps.map((gap) => (
        <p key={`s${gap.start}`} className="ctl-finding">
          <span className="ctl-finding-mark ctl-finding-mark-sun" aria-hidden="true" />
          <span>
            No site has sunlight from <strong>{formatUtcShort(gap.startUtc)}</strong> to{' '}
            <strong>{formatUtcShort(gap.endUtc)}</strong>, {formatDuration(gap.end - gap.start)}.
          </span>
        </p>
      ))}
    </div>
  )
}
