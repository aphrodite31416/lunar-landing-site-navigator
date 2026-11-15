import type { MouseEvent } from 'react'
import { sampleIndexAt } from '../science/clock'
import { thresholdLabel } from './timeControls'
import {
  exactSeconds,
  formatAngle,
  formatDuration,
  formatPercent,
  formatPercentVersus,
  formatUtc,
  formatUtcDay,
} from '../science/format'
import {
  dayTicks,
  describeEvent,
  eventKindLabel,
  nextEvent,
  type EventKind,
} from '../science/timeline'
import type { TerrainScenario, VisibilityEvent, VisibilitySample, VisibilityWindow } from '../types/science'

const eventKinds: EventKind[] = ['sunlight', 'earth', 'darkness']

/** Level-3 detail: windows, events, every value at the nearest sample. */
export function ScenarioDetails({
  scenario,
  offsetS,
  onSeek,
}: {
  scenario: TerrainScenario
  offsetS: number
  onSeek: (offsetS: number) => void
}) {
  const series = scenario.series
  const index = sampleIndexAt(scenario, offsetS)
  const sample = series[index]
  const threshold = thresholdLabel(scenario)
  return (
    <>
      <details className="sci-details">
        <summary>Windows and events</summary>
        <NextEvents events={scenario.events} offsetS={offsetS} threshold={threshold} />
        <WindowLists scenario={scenario} threshold={threshold} onGo={onSeek} />
        <EventList events={scenario.events} threshold={threshold} onGo={onSeek} />
      </details>

      <details className="sci-details">
        <summary>All measured values</summary>
        <p className="terrain-science-note">
          Measured at the exported sample {formatUtc(sample.utc)}
          {sample.offset_s === offsetS
            ? ', which is exactly the selected moment.'
            : `, ${formatDuration(Math.abs(sample.offset_s - offsetS))} ${sample.offset_s < offsetS ? 'before' : 'after'} the selected moment. Sunlight, Earth and joint states use the exact selected moment; if a window boundary lies between the two, the sample on the same side as the selected moment is shown.`}
        </p>
        <SampleSpacing series={series} index={index} origin={series[0].offset_s} />
        <SampleReadout sample={sample} minimum={scenario.model.settings.minimum_sun_fraction} />
      </details>

      <details className="sci-details">
        <summary>How visibility is determined</summary>
        <VisibilityDefinitions scenario={scenario} />
      </details>
    </>
  )
}

export function VisibilityDefinitions({ scenario }: { scenario: TerrainScenario }) {
  const threshold = thresholdLabel(scenario)
  return (
    <ul className="sci-explain">
      <li>
        <strong className="tone-sun">Sunlight</strong> is available when at least {threshold} of the solar disc (
        {scenario.model.settings.disc_samples.toLocaleString('en-US')} sampled points) is above the local terrain
        horizon and not hidden by Earth.
      </li>
      <li>
        <strong className="tone-earth">Earth line of sight</strong> means Earth&apos;s centre is strictly above the
        terrain horizon. It is geometric visibility, not a guaranteed radio link.
      </li>
      <li>
        <strong className="tone-joint">Joint</strong> means both hold at the same time.
      </li>
      <li>
        States follow the precomputed windows at the exact selected moment; exactly at an event time they show the
        state after the event. Angles and fractions come from the nearest exported sample (samples are refined near
        events, so they are unevenly spaced).
      </li>
    </ul>
  )
}

type Tone = 'sun' | 'earth' | 'joint' | 'low' | 'dark' | 'gap'
type Scale = { origin: number; duration: number }

export function TimelineChart({
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
  const allLanes: { label: string; title: string; tone: Tone; windows: VisibilityWindow[]; events?: VisibilityEvent[] }[] = [
    { label: 'Sunlight', title: `Sunlight (≥ ${threshold} of disc)`, tone: 'sun', windows: windows.sunlight, events: byKind('sunlight') },
    { label: 'Earth', title: 'Earth line of sight', tone: 'earth', windows: windows.earth, events: byKind('earth') },
    { label: 'Joint', title: 'Joint (sunlight and Earth)', tone: 'joint', windows: windows.joint },
    { label: `< ${threshold}`, title: `Insufficient light (< ${threshold})`, tone: 'low', windows: windows.insufficient_light },
    { label: 'Darkness', title: 'Darkness (no disc visible)', tone: 'dark', windows: windows.darkness, events: byKind('darkness') },
  ]
  // Sun, Earth and Joint always; insufficient light and darkness only when they occur.
  const lanes = allLanes.filter((lane, index) => index < 3 || lane.windows.length > 0)

  function seek(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    onGo(scale.origin + fraction * scale.duration)
  }

  return (
    <div className="tl-chart">
      <div className="tl-labels" aria-hidden="true">
        {lanes.map((lane, index) => (
          <span key={lane.title} className={`tl-label tone-${lane.tone}${index > 2 ? ' tl-extra' : ''}`} title={lane.title}>
            {lane.label}
          </span>
        ))}
      </div>
      {/* Pointer shortcut only; the time slider above is the keyboard-accessible control. */}
      <div className="tl-plot" onClick={seek} aria-hidden="true">
        <div className="tl-rail">
          {scenario.events.map((event) => (
            <span
              key={`${event.kind}-${event.offset_s}`}
              className={`tl-mark tl-mark-${event.kind}${event.active_after ? ' tl-mark-on' : ''}`}
              style={{ left: `${percent(event.offset_s, scale)}%` }}
              title={`${describeEvent(event, threshold)} · ${formatUtc(event.utc)}`}
            />
          ))}
        </div>
        {ticks.map((tick) => (
          <span
            key={tick.ms}
            className={tick.index % 5 === 0 ? 'tl-grid tl-grid-major' : 'tl-grid'}
            style={{ left: `${percent(tick.offset_s, scale)}%` }}
          />
        ))}
        {lanes.map((lane, index) => (
          <div key={lane.title} className={index > 2 ? 'tl-lane tl-extra' : 'tl-lane'}>
            {lane.windows.map((window) => (
              <span
                key={`${window.start_offset_s}-${window.end_offset_s}`}
                className={windowClass(window, lane.tone)}
                style={windowStyle(window, scale)}
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
        Bars are the precomputed windows; triangles above them mark events (filled when a state begins). Dashed ends touch the edge of the analysis
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
