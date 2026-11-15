import type { KeyboardEvent } from 'react'
import { formatAngle, formatDuration, formatPercent, formatUtc, exactSeconds } from '../science/format'
import {
  describeEvent,
  eventKindLabel,
  inWindows,
  nearestSampleIndex,
  nextEvent,
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
}: {
  scenario: TerrainScenario
  index: number
  onIndex: (index: number) => void
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
      <label className="terrain-science-time">
        Time (UTC)
        <span className="terrain-exaggeration-row">
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
        </span>
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
      <p className="terrain-science-utc" title={sample.utc}>
        {formatUtc(sample.utc)}
      </p>
      <SampleSpacing series={series} index={current} origin={origin} />
      <StateChips scenario={scenario} offsetS={offset} threshold={threshold} />
      <SampleReadout sample={sample} />
      <NextEvents events={scenario.events} offsetS={offset} threshold={threshold} />
      <WindowTracks scenario={scenario} offsetS={offset} threshold={threshold} onGo={goToOffset} />
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
      previous / next sample: {before} / {after}. Samples are refined near events, so they are unevenly spaced; the
      slider snaps to the nearest exported sample.
    </p>
  )
}

function StateChips({ scenario, offsetS, threshold }: { scenario: TerrainScenario; offsetS: number; threshold: string }) {
  const sunlit = inWindows(scenario.windows.sunlight, offsetS)
  const dark = inWindows(scenario.windows.darkness, offsetS)
  const earth = inWindows(scenario.windows.earth, offsetS)
  const joint = inWindows(scenario.windows.joint, offsetS)
  return (
    <>
      <div className="terrain-science-chips">
        <p className={sunlit ? 'terrain-chip terrain-chip-on' : 'terrain-chip'}>
          {sunlit ? 'Sunlight available' : dark ? 'Darkness' : `Below ${threshold} disc`}
        </p>
        <p className={earth ? 'terrain-chip terrain-chip-on' : 'terrain-chip'}>
          {earth ? 'Earth in line of sight' : 'No Earth line of sight'}
        </p>
        <p className={joint ? 'terrain-chip terrain-chip-on' : 'terrain-chip'}>{joint ? 'Joint' : 'Not joint'}</p>
      </div>
      <p className="terrain-science-note">
        States follow the precomputed windows; at an event time they show the state after the event.
      </p>
    </>
  )
}

function SampleReadout({ sample }: { sample: VisibilitySample }) {
  return (
    <dl>
      <div>
        <dt>Solar disc visible</dt>
        <dd>{formatPercent(sample.sun_visible_fraction)}</dd>
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

function WindowTracks({
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
  const scale = { origin: scenario.series[0].offset_s, duration: scenario.period.duration_s }
  const playhead = percent(offsetS, scale)
  const byKind = (kind: EventKind) => scenario.events.filter((event) => event.kind === kind)
  const tracks: { name: string; windows: VisibilityWindow[]; events?: VisibilityEvent[] }[] = [
    { name: `Sunlight (≥ ${threshold} of disc)`, windows: scenario.windows.sunlight, events: byKind('sunlight') },
    { name: 'Earth line of sight', windows: scenario.windows.earth, events: byKind('earth') },
    { name: 'Joint (sunlight and Earth)', windows: scenario.windows.joint },
    { name: `Insufficient light (< ${threshold})`, windows: scenario.windows.insufficient_light },
    { name: 'Darkness (no disc visible)', windows: scenario.windows.darkness, events: byKind('darkness') },
    { name: 'Earth gap', windows: scenario.windows.earth_gap },
  ]

  return (
    <div className="terrain-tracks">
      <p className="terrain-science-note">
        Bars come from the precomputed window lists. A dashed end touches the edge of the analysis period, so the
        real start or end may lie outside it. Select a window to move the timeline to its start.
      </p>
      {tracks.map((track) => (
        <WindowTrack key={track.name} {...track} scale={scale} playhead={playhead} onGo={onGo} />
      ))}
      <EventList events={scenario.events} threshold={threshold} onGo={onGo} />
    </div>
  )
}

type Scale = { origin: number; duration: number }

function WindowTrack({
  name,
  windows,
  scale,
  playhead,
  onGo,
  events = [],
}: {
  name: string
  windows: VisibilityWindow[]
  scale: Scale
  playhead: number
  onGo: (offsetS: number) => void
  events?: VisibilityEvent[]
}) {
  return (
    <div className="terrain-track-block">
      <p className="terrain-track-name">{name}</p>
      <div className="terrain-track" aria-hidden="true">
        {windows.map((window) => (
          <span
            key={`${window.start_offset_s}-${window.end_offset_s}`}
            className={windowClass(window)}
            style={windowStyle(window, scale)}
          />
        ))}
        {events.map((event) => (
          <span
            key={`${event.kind}-${event.offset_s}`}
            className="terrain-track-event"
            style={{ left: `${percent(event.offset_s, scale)}%` }}
          />
        ))}
        <span className="terrain-track-now" style={{ left: `${playhead}%` }} />
      </div>
      {windows.length === 0 ? (
        <p className="terrain-science-note">None in this period.</p>
      ) : (
        <ul className="terrain-track-list">
          {windows.map((window) => (
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

function windowClass(window: VisibilityWindow) {
  const classes = ['terrain-track-window']
  if (window.start_clipped) classes.push('terrain-track-start-clipped')
  if (window.end_clipped) classes.push('terrain-track-end-clipped')
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
