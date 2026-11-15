import type { ReactNode } from 'react'
import { HorizonView } from './HorizonView'
import { ScenarioDetails } from './ScenarioTimeline'
import { SiteMetrics } from './SiteMetrics'
import { thresholdLabel } from './timeControls'
import { sampleIndexAt } from '../science/clock'
import { formatDuration, formatPercentVersus, formatUtc, formatUtcShort } from '../science/format'
import { describeEvent, inWindows, nextEvent, nextWindowBoundary } from '../science/timeline'
import type { Site, TerrainScenario, VisibilityEvent, VisibilitySample } from '../types/science'

/** The docked right rail: the answer first, then the evidence, then detail on demand. */
export function ConditionsRail({
  site,
  scenario,
  offsetS,
  onSeek,
  status,
  error,
  onRetry,
  quiet = false,
  onExpandSky,
}: {
  quiet?: boolean
  onExpandSky?: () => void
  site: Site | null
  scenario: TerrainScenario | null
  offsetS: number
  onSeek: (offsetS: number) => void
  status: string | null
  error: string | null
  onRetry: () => void
}) {
  return (
    <aside className="atlas-rail" aria-label="Conditions at the landing point">
      {error ? (
        <div className="rail-message rail-message-error" role="alert">
          <p>{error}</p>
          <button type="button" className="deck-btn" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : !scenario || !site ? (
        <RailSkeleton message={status ?? 'Loading the scenario…'} />
      ) : (
        <RailContent site={site} scenario={scenario} offsetS={offsetS} onSeek={onSeek} quiet={quiet} onExpandSky={onExpandSky} />
      )}
    </aside>
  )
}

function RailContent({
  site,
  scenario,
  offsetS,
  onSeek,
  quiet,
  onExpandSky,
}: {
  quiet: boolean
  onExpandSky?: () => void
  site: Site
  scenario: TerrainScenario
  offsetS: number
  onSeek: (offsetS: number) => void
}) {
  const sample = scenario.series[sampleIndexAt(scenario, offsetS)]
  return (
    <>
      <StatusHeadline scenario={scenario} offsetS={offsetS} onSeek={onSeek} quiet={quiet} />
      <StatusTiles scenario={scenario} sample={sample} offsetS={offsetS} onSeek={onSeek} />
      <MeasurementStamp sample={sample} offsetS={offsetS} />
      <HorizonView site={site} scenario={scenario} sample={sample} offsetS={offsetS} onExpand={onExpandSky} />
      <div className="rail-accordions">
        <details className="sci-details">
          <summary>This site over the period</summary>
          <SiteMetrics scenario={scenario} />
        </details>
        <ScenarioDetails scenario={scenario} offsetS={offsetS} onSeek={onSeek} />
      </div>
    </>
  )
}

/**
 * One sentence of state plus the next change. Every word comes from the
 * precomputed windows and events at the exact selected moment.
 */
function StatusHeadline({
  scenario,
  offsetS,
  onSeek,
  quiet,
}: {
  quiet: boolean
  scenario: TerrainScenario
  offsetS: number
  onSeek: (offsetS: number) => void
}) {
  const windows = scenario.windows
  const sunlit = inWindows(windows.sunlight, offsetS)
  const dark = inWindows(windows.darkness, offsetS)
  const earth = inWindows(windows.earth, offsetS)
  const joint = inWindows(windows.joint, offsetS)
  const threshold = thresholdLabel(scenario)
  const next = nextEvent(scenario.events, offsetS)

  const sunWord = sunlit ? 'Sunlit' : dark ? 'Dark' : `Low sun (< ${threshold})`
  const earthWord = earth ? 'Earth in view' : 'Earth hidden'

  return (
    <header className="rail-head">
      <p className="eyebrow">Conditions at the landing point</p>
      <h2 className="rail-headline" aria-live={quiet ? 'off' : 'polite'}>
        {joint ? (
          <>
            <span className="tone-sun">Sunlit</span> with <span className="tone-earth">Earth in view</span>
          </>
        ) : (
          <>
            <span className={sunlit ? 'tone-sun' : undefined}>{sunWord}</span>
            <span className="rail-headline-sep" aria-hidden="true">
              {' '}
              ·{' '}
            </span>
            <span className={earth ? 'tone-earth' : undefined}>{earthWord}</span>
          </>
        )}
      </h2>
      {next ? (
        <button
          type="button"
          className="rail-next"
          onClick={() => onSeek(next.offset_s)}
          title={`${describeEvent(next, threshold)} at ${formatUtc(next.utc)}. Select to jump there.`}
        >
          <span className="rail-next-label">Next change</span>
          <span className="rail-next-what">{describeEvent(next, threshold)}</span>
          <span className="rail-next-count">
            <span className="sr-only">in </span>
            {formatDuration(next.offset_s - offsetS)}
          </span>
          <span className="rail-next-when">{formatUtcShort(next.utc)}</span>
        </button>
      ) : (
        <p className="rail-next rail-next-none">
          <span className="rail-next-label">Next change</span>
          <span className="rail-next-what">None before the period ends</span>
        </p>
      )}
    </header>
  )
}

type Reading = {
  tone: 'sun' | 'earth' | 'joint'
  label: string
  on: boolean
  state: string
  value: string
  note: string
  gauge: ReactNode
  next: { offsetS: number; utc: string; title: string } | null
}

/** Clearance gauge range: ±6°, with values beyond it pinned to the ends. */
const clearanceRangeDeg = 6

/**
 * Sun, Earth and Joint at the selected moment, as full-width readout rows.
 * The state words come from the windows at the exact moment; the numbers and
 * gauges from the sample chosen by `sampleIndexAt`, which always agrees with
 * those states.
 */
function StatusTiles({
  scenario,
  sample,
  offsetS,
  onSeek,
}: {
  scenario: TerrainScenario
  sample: VisibilitySample
  offsetS: number
  onSeek: (offsetS: number) => void
}) {
  const windows = scenario.windows
  const events = scenario.events
  const minimum = scenario.model.settings.minimum_sun_fraction
  const threshold = thresholdLabel(scenario)
  const sunlit = inWindows(windows.sunlight, offsetS)
  const dark = inWindows(windows.darkness, offsetS)
  const earth = inWindows(windows.earth, offsetS)
  const joint = inWindows(windows.joint, offsetS)
  const sunEvent = earliest(nextEvent(events, offsetS, 'sunlight'), nextEvent(events, offsetS, 'darkness'))
  const earthEvent = nextEvent(events, offsetS, 'earth')
  const jointEdge = nextWindowBoundary(windows.joint, offsetS)
  const clearance = sample.earth_clearance_deg
  const origin = scenario.series[0].offset_s
  const end = scenario.series[scenario.series.length - 1].offset_s
  const span = end - origin || 1
  const at = (offset: number) => `${(((offset - origin) / span) * 100).toFixed(3)}%`

  const readings: Reading[] = [
    {
      tone: 'sun',
      label: 'Sun',
      on: sunlit,
      state: sunlit ? 'Sunlit' : dark ? 'Dark' : `Below ${threshold}`,
      value: formatPercentVersus(sample.sun_visible_fraction, minimum),
      note: 'of the solar disc visible',
      gauge: (
        <span className="ro-gauge ro-meter" aria-hidden="true">
          <span className="ro-meter-fill" style={{ width: `${Math.max(0, Math.min(1, sample.sun_visible_fraction)) * 100}%` }} />
          <span className="ro-meter-mark" style={{ left: `${minimum * 100}%` }}>
            <span>{threshold}</span>
          </span>
        </span>
      ),
      next: sunEvent && { offsetS: sunEvent.offset_s, utc: sunEvent.utc, title: describeEvent(sunEvent, threshold) },
    },
    {
      tone: 'earth',
      label: 'Earth',
      on: earth,
      state: earth ? 'In view' : 'Hidden',
      value: signedAngle(clearance),
      note:
        clearance === null
          ? 'clearance undefined'
          : roundsToZero(clearance)
            ? 'at the terrain horizon (crossing)'
            : clearance > 0
              ? 'Earth centre above the terrain horizon'
              : 'Earth centre below the terrain horizon',
      gauge:
        clearance === null ? null : (
          <span className="ro-gauge ro-clear" aria-hidden="true">
            <span className="ro-clear-zero" />
            <span
              className={`ro-clear-bar${clearance >= 0 ? ' is-up' : ''}`}
              style={
                clearance >= 0
                  ? { left: '50%', width: `${(Math.min(clearance, clearanceRangeDeg) / clearanceRangeDeg) * 50}%` }
                  : { right: '50%', width: `${(Math.min(-clearance, clearanceRangeDeg) / clearanceRangeDeg) * 50}%` }
              }
            />
            <span className="ro-clear-ends">
              <span>−{clearanceRangeDeg}°</span>
              <span>horizon</span>
              <span>+{clearanceRangeDeg}°</span>
            </span>
          </span>
        ),
      next: earthEvent && { offsetS: earthEvent.offset_s, utc: earthEvent.utc, title: describeEvent(earthEvent, threshold) },
    },
    {
      tone: 'joint',
      label: 'Joint',
      on: joint,
      state: joint ? 'Active' : 'Inactive',
      value: joint ? 'Yes' : 'No',
      note: `Sun and Earth together · ${windows.joint.length} window${windows.joint.length === 1 ? '' : 's'} in the period`,
      gauge: (
        <span className="ro-gauge ro-strip" aria-hidden="true">
          {windows.joint.map((window) => (
            <span
              key={window.start_offset_s}
              className="ro-strip-win"
              style={{ left: at(window.start_offset_s), width: `calc(${at(window.end_offset_s)} - ${at(window.start_offset_s)})` }}
            />
          ))}
          <span className="ro-strip-now" style={{ left: at(offsetS) }} />
        </span>
      ),
      next: jointEdge && {
        offsetS: jointEdge.offset_s,
        utc: jointEdge.utc,
        title: jointEdge.starts ? 'Joint window starts' : 'Joint window ends',
      },
    },
  ]

  return (
    <section className="readout" aria-label="Status at the selected moment">
      {readings.map((reading) => (
        <div key={reading.tone} className={`ro ro-${reading.tone}${reading.on ? ' is-on' : ''}`}>
          <p className="ro-head">
            <span className={`dot dot-${reading.tone}${reading.on ? ' dot-on' : ''}`} aria-hidden="true" />
            <span className="ro-label">{reading.label}</span>
            <span className="ro-state">{reading.state}</span>
          </p>
          <p className="ro-value">{reading.value}</p>
          {reading.gauge}
          <p className="ro-note">{reading.note}</p>
          {reading.next ? (
            <button
              type="button"
              className="ro-next"
              onClick={() => reading.next && onSeek(reading.next.offsetS)}
              title={`${reading.next.title} at ${formatUtc(reading.next.utc)}. Select to jump there.`}
            >
              <span className="ro-next-label">Changes in</span> {shortDuration(reading.next.offsetS - offsetS)}
              <span aria-hidden="true"> →</span>
            </button>
          ) : (
            <p className="ro-next ro-next-none">No change this period</p>
          )}
        </div>
      ))}
    </section>
  )
}

function earliest(...events: (VisibilityEvent | null)[]) {
  let best: VisibilityEvent | null = null
  for (const event of events) if (event && (!best || event.offset_s < best.offset_s)) best = event
  return best
}

/** True when an angle prints as 0.00°: at an event the body sits on the horizon. */
function roundsToZero(value: number) {
  return Math.abs(value) < 0.005
}

function signedAngle(value: number | null) {
  if (value === null) return '—'
  if (roundsToZero(value)) return '0.00°'
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}°`
}

/** The two largest units of a duration ("2 d 12 h"), for compact tiles. */
function shortDuration(seconds: number) {
  return formatDuration(seconds).split(' ').slice(0, 4).join(' ')
}

/**
 * Continuous values (disc fraction, clearances, positions) are measured at an
 * exported sample, which is usually not the selected moment. This line always
 * says which sample they come from, so they are never presented as if they
 * were computed for the selected instant.
 */
function MeasurementStamp({ sample, offsetS }: { sample: VisibilitySample; offsetS: number }) {
  const delta = sample.offset_s - offsetS
  const exact = delta === 0
  return (
    <p className={exact ? 'stamp stamp-exact' : 'stamp'}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.5V8l2.5 1.5" />
      </svg>
      <span>
        {exact ? (
          <>States and measurements are both for the selected moment (an exported sample).</>
        ) : (
          <>
            States are for the selected moment. Measurements come from the exported sample at{' '}
            <time dateTime={sample.utc}>{formatUtc(sample.utc)}</time>,{' '}
            <strong>
              {formatDuration(Math.abs(delta))} {delta < 0 ? 'earlier' : 'later'}
            </strong>
            .
          </>
        )}
      </span>
    </p>
  )
}

function RailSkeleton({ message }: { message: string }) {
  return (
    <div className="rail-skeleton" aria-busy="true">
      <p className="eyebrow">Conditions at the landing point</p>
      <p className="rail-skeleton-message">{message}</p>
      <div className="rail-skeleton-tiles">
        <span />
        <span />
        <span />
      </div>
      <span className="rail-skeleton-block" />
    </div>
  )
}
