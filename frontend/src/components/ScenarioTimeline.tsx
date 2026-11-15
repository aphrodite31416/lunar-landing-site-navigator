import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import {
  exactSeconds,
  formatAngle,
  formatDuration,
  formatPercent,
  formatPercentVersus,
  formatUtc,
  formatUtcDay,
  formatUtcShort,
} from '../science/format'
import {
  dayTicks,
  describeEvent,
  eventKindLabel,
  inWindows,
  nearestSampleIndex,
  nextEvent,
  nextWindowBoundary,
  previousEvent,
  type EventKind,
} from '../science/timeline'
import type { TerrainScenario, VisibilityEvent, VisibilitySample, VisibilityWindow } from '../types/science'

const hour = 3600
const day = 86400
const eventKinds: EventKind[] = ['sunlight', 'earth', 'darkness']

export function ScenarioTimeline({
  scenario,
  index,
  onIndex,
  sky,
}: {
  scenario: TerrainScenario
  index: number
  onIndex: (index: number) => void
  sky?: (sample: VisibilitySample) => ReactNode
}) {
  const series = scenario.series
  const last = series.length - 1
  const current = Math.min(Math.max(index, 0), last)
  const sample = series[current]
  const offset = sample.offset_s
  const origin = series[0].offset_s
  const threshold = formatPercent(scenario.model.settings.minimum_sun_fraction, 0)
  const earlier = previousEvent(scenario.events, offset)
  const later = nextEvent(scenario.events, offset)

  const goToIndex = (next: number) => onIndex(Math.min(Math.max(next, 0), last))
  const goToOffset = (target: number) => onIndex(nearestSampleIndex(series, target))

  function onSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    const moves: Record<string, () => void> = {
      ArrowLeft: () => goToIndex(current - 1),
      ArrowDown: () => goToIndex(current - 1),
      ArrowRight: () => goToIndex(current + 1),
      ArrowUp: () => goToIndex(current + 1),
      PageDown: () => goToOffset(offset - hour),
      PageUp: () => goToOffset(offset + hour),
      Home: () => goToIndex(0),
      End: () => goToIndex(last),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    move()
  }

  return (
    <>
      <section className="sci-section" aria-label="Selected time">
        <div className="now-time">
          <p className="now-time-utc" title={sample.utc}>
            {formatUtc(sample.utc)}
          </p>
          <p className="now-time-sub">+{formatDuration(offset - origin)} from period start</p>
        </div>
        <label className="terrain-science-time">
          <span className="sr-only">Time (UTC)</span>
          <input
            type="range"
            min={origin}
            max={series[last].offset_s}
            step="any"
            value={offset}
            aria-valuetext={formatUtc(sample.utc)}
            onChange={(event) => goToOffset(Number(event.target.value))}
            onKeyDown={onSliderKey}
          />
        </label>
        <div className="terrain-science-buttons">
          <button type="button" className="terrain-info-toggle" onClick={() => goToOffset(offset - day)}>
            −1 d
          </button>
          <button type="button" className="terrain-info-toggle" onClick={() => goToOffset(offset - hour)}>
            −1 h
          </button>
          <button type="button" className="terrain-info-toggle" onClick={() => goToOffset(offset + hour)}>
            +1 h
          </button>
          <button type="button" className="terrain-info-toggle" onClick={() => goToOffset(offset + day)}>
            +1 d
          </button>
          <span className="terrain-science-buttons-gap" />
          <button
            type="button"
            className="terrain-info-toggle"
            disabled={!earlier}
            onClick={() => earlier && goToOffset(earlier.offset_s)}
          >
            ◀ Event
          </button>
          <button
            type="button"
            className="terrain-info-toggle"
            disabled={!later}
            onClick={() => later && goToOffset(later.offset_s)}
          >
            Event ▶
          </button>
        </div>
      </section>

      <NowCard scenario={scenario} sample={sample} offsetS={offset} threshold={threshold} />

      {sky?.(sample)}

      <section className="sci-section">
        <p className="sci-section-title">Visibility over the period</p>
        <TimelineChart scenario={scenario} offsetS={offset} threshold={threshold} onGo={goToOffset} />
      </section>

      <details className="sci-details">
        <summary>Windows and events (UTC)</summary>
        <WindowLists scenario={scenario} threshold={threshold} onGo={goToOffset} />
        <NextEvents events={scenario.events} offsetS={offset} threshold={threshold} />
        <EventList events={scenario.events} threshold={threshold} onGo={goToOffset} />
      </details>

      <details className="sci-details">
        <summary>All values at this sample</summary>
        <SampleSpacing series={series} index={current} origin={origin} />
        <SampleReadout sample={sample} minimum={scenario.model.settings.minimum_sun_fraction} />
      </details>

      <details className="sci-details">
        <summary>How visibility is determined</summary>
        <ul className="sci-explain">
          <li>
            <strong className="tone-sun">Sunlight</strong> is available when at least {threshold} of the solar disc (
            {scenario.model.settings.disc_samples.toLocaleString('en-US')} sampled points) is above the local terrain
            horizon and not hidden by Earth.
          </li>
          <li>
            <strong className="tone-earth">Earth line of sight</strong> means Earth&apos;s centre is strictly above
            the terrain horizon. It is geometric visibility, not a guaranteed radio link.
          </li>
          <li>
            <strong className="tone-joint">Joint</strong> means both hold at the same time.
          </li>
          <li>
            Status follows the precomputed windows; exactly at an event time it shows the state after the event.
            Samples are refined near events, so they are unevenly spaced, and the slider snaps to the nearest one.
          </li>
        </ul>
      </details>
    </>
  )
}

function NowCard({
  scenario,
  sample,
  offsetS,
  threshold,
}: {
  scenario: TerrainScenario
  sample: VisibilitySample
  offsetS: number
  threshold: string
}) {
  const windows = scenario.windows
  const sunlit = inWindows(windows.sunlight, offsetS)
  const dark = inWindows(windows.darkness, offsetS)
  const earth = inWindows(windows.earth, offsetS)
  const joint = inWindows(windows.joint, offsetS)
  const sunChange = earliest(
    nextEvent(scenario.events, offsetS, 'sunlight'),
    nextEvent(scenario.events, offsetS, 'darkness'),
  )
  const earthChange = nextEvent(scenario.events, offsetS, 'earth')
  const jointChange = nextWindowBoundary(windows.joint, offsetS)

  return (
    <section className="now-grid" aria-label="Status at the selected time">
      <StateTile
        tone="sun"
        active={sunlit}
        label="Sunlight"
        state={sunlit ? 'Available' : dark ? 'Darkness' : `Below ${threshold}`}
        value={formatPercentVersus(sample.sun_visible_fraction, scenario.model.settings.minimum_sun_fraction)}
        unit="of solar disc visible"
        detail={clearanceText('Disc centre', sample.sun_clearance_deg)}
        next={
          sunChange && {
            offsetS: sunChange.offset_s,
            utc: sunChange.utc,
            title: describeEvent(sunChange, threshold),
          }
        }
        from={offsetS}
      />
      <StateTile
        tone="earth"
        active={earth}
        label="Earth"
        state={earth ? 'In line of sight' : 'Not visible'}
        value={signedAngle(sample.earth_clearance_deg)}
        unit={
          sample.earth_clearance_deg === null
            ? 'clearance undefined'
            : sample.earth_clearance_deg >= 0
              ? 'above terrain horizon'
              : 'below terrain horizon'
        }
        detail={`Elevation ${formatAngle(sample.earth_elevation_deg)} · horizon ${formatAngle(sample.earth_horizon_deg)}`}
        next={
          earthChange && {
            offsetS: earthChange.offset_s,
            utc: earthChange.utc,
            title: describeEvent(earthChange, threshold),
          }
        }
        from={offsetS}
      />
      <StateTile
        tone="joint"
        active={joint}
        label="Joint"
        state={joint ? 'Active' : 'Inactive'}
        value={joint ? 'Yes' : 'No'}
        unit="sunlight and Earth together"
        detail={`${windows.joint.length} joint window${windows.joint.length === 1 ? '' : 's'} this period`}
        next={
          jointChange && {
            offsetS: jointChange.offset_s,
            utc: jointChange.utc,
            title: jointChange.starts ? 'Joint window starts' : 'Joint window ends',
          }
        }
        from={offsetS}
      />
    </section>
  )
}

function StateTile({
  tone,
  active,
  label,
  state,
  value,
  unit,
  detail,
  next,
  from,
}: {
  tone: 'sun' | 'earth' | 'joint'
  active: boolean
  label: string
  state: string
  value: string
  unit: string
  detail: string
  next: { offsetS: number; utc: string; title: string } | null
  from: number
}) {
  return (
    <div className={`now-tile now-tile-${tone}${active ? ' now-tile-on' : ''}`}>
      <p className="now-tile-label">
        <span className="now-dot" aria-hidden="true" />
        {label}
      </p>
      <p className="now-tile-state">{state}</p>
      <p className="now-tile-value">{value}</p>
      <p className="now-tile-unit">{unit}</p>
      <p className="now-tile-detail">{detail}</p>
      <p className="now-tile-next" title={next ? `${next.title} at ${formatUtc(next.utc)}` : undefined}>
        {next ? (
          <>
            Changes in <strong>{formatDuration(next.offsetS - from)}</strong>
            <span>{formatUtcShort(next.utc)}</span>
          </>
        ) : (
          'No change in this period'
        )}
      </p>
    </div>
  )
}

function earliest(...events: (VisibilityEvent | null)[]) {
  let best: VisibilityEvent | null = null
  for (const event of events) {
    if (event && (!best || event.offset_s < best.offset_s)) best = event
  }
  return best
}

function signedAngle(value: number | null) {
  if (value === null) return '—'
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}°`
}

function clearanceText(subject: string, clearance: number | null) {
  if (clearance === null) return `${subject}: direction undefined`
  return `${subject} ${Math.abs(clearance).toFixed(2)}° ${clearance >= 0 ? 'above' : 'below'} the horizon`
}

type Tone = 'sun' | 'earth' | 'joint' | 'low' | 'dark' | 'gap'
type Scale = { origin: number; duration: number }

function TimelineChart({
  scenario,
  offsetS,
  threshold,
  onGo,
}: {
  scenario: TerrainScenario
  offsetS: number
  threshold: string
  onGo: (offsetS: number) => void
}) {
  const scale: Scale = { origin: scenario.series[0].offset_s, duration: scenario.period.duration_s }
  const ticks = dayTicks(scenario.period, scale.origin)
  const byKind = (kind: EventKind) => scenario.events.filter((event) => event.kind === kind)
  const windows = scenario.windows
  const lanes: { label: string; title: string; tone: Tone; windows: VisibilityWindow[]; events?: VisibilityEvent[] }[] = [
    { label: 'Sunlight', title: `Sunlight (≥ ${threshold} of disc)`, tone: 'sun', windows: windows.sunlight, events: byKind('sunlight') },
    { label: 'Earth', title: 'Earth line of sight', tone: 'earth', windows: windows.earth, events: byKind('earth') },
    { label: 'Joint', title: 'Joint (sunlight and Earth)', tone: 'joint', windows: windows.joint },
    { label: `< ${threshold}`, title: `Insufficient light (< ${threshold})`, tone: 'low', windows: windows.insufficient_light },
    { label: 'Darkness', title: 'Darkness (no disc visible)', tone: 'dark', windows: windows.darkness, events: byKind('darkness') },
    { label: 'Earth gap', title: 'Earth gap', tone: 'gap', windows: windows.earth_gap },
  ]

  function seek(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    onGo(scale.origin + fraction * scale.duration)
  }

  return (
    <div className="tl-chart">
      <div className="tl-labels" aria-hidden="true">
        {lanes.map((lane) => (
          <span key={lane.title} className={`tl-label tone-${lane.tone}`} title={lane.title}>
            {lane.label}
          </span>
        ))}
      </div>
      {/* Pointer shortcut only; the time slider above is the keyboard-accessible control. */}
      <div className="tl-plot" onClick={seek} aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick.ms}
            className={tick.index % 5 === 0 ? 'tl-grid tl-grid-major' : 'tl-grid'}
            style={{ left: `${percent(tick.offset_s, scale)}%` }}
          />
        ))}
        {lanes.map((lane) => (
          <div key={lane.title} className="tl-lane">
            {lane.windows.map((window) => (
              <span
                key={`${window.start_offset_s}-${window.end_offset_s}`}
                className={windowClass(window, lane.tone)}
                style={windowStyle(window, scale)}
              />
            ))}
            {lane.events?.map((event) => (
              <span
                key={`${event.kind}-${event.offset_s}`}
                className="tl-event"
                style={{ left: `${percent(event.offset_s, scale)}%` }}
              />
            ))}
          </div>
        ))}
        <span className="tl-now" style={{ left: `${percent(offsetS, scale)}%` }} />
      </div>
      <div className="tl-axis" aria-hidden="true">
        {ticks
          .filter((tick) => tick.index % 5 === 0)
          .map((tick) => (
            <span key={tick.ms} style={{ left: `${percent(tick.offset_s, scale)}%` }}>
              {formatUtcDay(tick.ms)}
            </span>
          ))}
      </div>
      <p className="tl-caption">
        Bars are the precomputed windows; white ticks are events. Dashed ends touch the edge of the analysis
        period, so the window may continue beyond it. Click the chart to jump to a time.
      </p>
    </div>
  )
}

function WindowLists({
  scenario,
  threshold,
  onGo,
}: {
  scenario: TerrainScenario
  threshold: string
  onGo: (offsetS: number) => void
}) {
  const windows = scenario.windows
  const lists: { name: string; windows: VisibilityWindow[] }[] = [
    { name: `Sunlight (≥ ${threshold} of disc)`, windows: windows.sunlight },
    { name: 'Earth line of sight', windows: windows.earth },
    { name: 'Joint (sunlight and Earth)', windows: windows.joint },
    { name: `Insufficient light (< ${threshold})`, windows: windows.insufficient_light },
    { name: 'Darkness (no disc visible)', windows: windows.darkness },
    { name: 'Earth gap', windows: windows.earth_gap },
  ]
  return (
    <>
      <p className="terrain-science-note">Select a window to move the timeline to its start.</p>
      {lists.map((list) => (
        <div key={list.name} className="terrain-track-block">
          <p className="terrain-track-name">{list.name}</p>
          {list.windows.length === 0 ? (
            <p className="terrain-science-note">None in this period.</p>
          ) : (
            <ul className="terrain-track-list">
              {list.windows.map((window) => (
                <li key={`${window.start_utc}-${window.end_utc}`}>
                  <button type="button" className="terrain-link" onClick={() => onGo(window.start_offset_s)}>
                    {formatUtc(window.start_utc)} – {formatUtc(window.end_utc)}
                  </button>{' '}
                  · <span title={exactSeconds(window.duration_s)}>{formatDuration(window.duration_s)}</span>
                  {clipLabel(window)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  )
}

function SampleSpacing({ series, index, origin }: { series: VisibilitySample[]; index: number; origin: number }) {
  const offset = series[index].offset_s
  const before = index > 0 ? formatDuration(offset - series[index - 1].offset_s) : 'none'
  const after = index < series.length - 1 ? formatDuration(series[index + 1].offset_s - offset) : 'none'
  return (
    <p className="terrain-science-note">
      Sample {index + 1} of {series.length}, {formatDuration(offset - origin)} after the period start. Gap to the
      previous / next sample: {before} / {after}.
    </p>
  )
}

function SampleReadout({ sample, minimum }: { sample: VisibilitySample; minimum: number }) {
  return (
    <dl>
      <div>
        <dt>Solar disc visible</dt>
        <dd>{formatPercentVersus(sample.sun_visible_fraction, minimum)}</dd>
      </div>
      <div>
        <dt>Disc above terrain</dt>
        <dd>{formatPercent(sample.sun_terrain_visible_fraction)} (terrain only, ignores Earth)</dd>
      </div>
      <div>
        <dt>Sun azimuth</dt>
        <dd>{formatAngle(sample.sun_azimuth_deg)}</dd>
      </div>
      <div>
        <dt>Sun elevation</dt>
        <dd>{formatAngle(sample.sun_elevation_deg)}</dd>
      </div>
      <div>
        <dt>Terrain horizon (Sun)</dt>
        <dd>{formatAngle(sample.sun_horizon_deg)}</dd>
      </div>
      <div>
        <dt>Sun clearance</dt>
        <dd>{formatAngle(sample.sun_clearance_deg)}</dd>
      </div>
      <div>
        <dt>Earth azimuth</dt>
        <dd>{formatAngle(sample.earth_azimuth_deg)}</dd>
      </div>
      <div>
        <dt>Earth elevation</dt>
        <dd>{formatAngle(sample.earth_elevation_deg)}</dd>
      </div>
      <div>
        <dt>Terrain horizon (Earth)</dt>
        <dd>{formatAngle(sample.earth_horizon_deg)}</dd>
      </div>
      <div>
        <dt>Earth clearance</dt>
        <dd>{formatAngle(sample.earth_clearance_deg)}</dd>
      </div>
      <div>
        <dt>Panel</dt>
        <dd>{sample.power_w === null ? 'No panel was calculated' : `${sample.power_w.toFixed(1)} W`}</dd>
      </div>
    </dl>
  )
}

function NextEvents({ events, offsetS, threshold }: { events: VisibilityEvent[]; offsetS: number; threshold: string }) {
  return (
    <div className="terrain-track-block">
      <p className="terrain-track-name">Next changes</p>
      <dl>
        {eventKinds.map((kind) => {
          const event = nextEvent(events, offsetS, kind)
          return (
            <div key={kind}>
              <dt>{eventKindLabel[kind]}</dt>
              <dd>
                {event ? (
                  <>
                    {describeEvent(event, threshold)} at <span title={event.utc}>{formatUtc(event.utc)}</span>, in{' '}
                    <span title={exactSeconds(event.offset_s - offsetS)}>
                      {formatDuration(event.offset_s - offsetS)}
                    </span>
                  </>
                ) : (
                  'No event was found within the loaded period'
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function EventList({
  events,
  threshold,
  onGo,
}: {
  events: VisibilityEvent[]
  threshold: string
  onGo: (offsetS: number) => void
}) {
  const sorted = [...events].sort((a, b) => a.offset_s - b.offset_s)
  return (
    <div className="terrain-track-block">
      <p className="terrain-track-name">All events</p>
      {sorted.length === 0 ? (
        <p className="terrain-science-note">No event was found in this period.</p>
      ) : (
        <ul className="terrain-track-list">
          {sorted.map((event) => (
            <li key={`${event.kind}-${event.offset_s}`}>
              <button type="button" className="terrain-link" onClick={() => onGo(event.offset_s)}>
                {formatUtc(event.utc)}
              </button>{' '}
              · {describeEvent(event, threshold)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function windowClass(window: VisibilityWindow, tone: Tone) {
  const classes = ['tl-win', `tl-win-${tone}`]
  if (window.start_clipped) classes.push('tl-start-clipped')
  if (window.end_clipped) classes.push('tl-end-clipped')
  return classes.join(' ')
}

function windowStyle(window: VisibilityWindow, scale: Scale) {
  const left = percent(window.start_offset_s, scale)
  const end = percent(window.end_offset_s, scale)
  return { left: `${left}%`, width: `${Math.max(end - left, 0)}%` }
}

function percent(offsetS: number, { origin, duration }: Scale) {
  if (duration <= 0) return 0
  return Math.min(Math.max(((offsetS - origin) / duration) * 100, 0), 100)
}

function clipLabel(window: VisibilityWindow) {
  if (window.start_clipped && window.end_clipped) return ' · clipped at both ends'
  if (window.start_clipped) return ' · start clipped'
  if (window.end_clipped) return ' · end clipped'
  return ''
}
