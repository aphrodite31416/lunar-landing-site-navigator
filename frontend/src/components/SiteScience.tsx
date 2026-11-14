import { useEffect, useState } from 'react'
import { loadScenario } from '../sites/loadScenario'
import type { Site, TerrainScenario, VisibilityEvent, VisibilitySample, VisibilityWindow } from '../types/science'

export function SiteScience({ site }: { site: Site }) {
  const [scenario, setScenario] = useState<TerrainScenario | null>(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scenarioUrl = site.site_id === 'site01' ? site.scenario_url : null

  useEffect(() => {
    if (!scenarioUrl || site.terrain_status !== 'ready') return
    let cancelled = false
    setLoading(true)
    setError(null)
    loadScenario(scenarioUrl)
      .then((loaded) => {
        if (cancelled) return
        if (loaded.site_id !== 'site01') {
          setError('The scenario file is not for Site 01')
          return
        }
        setScenario(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageFrom(caught, 'Could not load the Site 01 timeline'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scenarioUrl, site.terrain_status])

  if (site.site_id !== 'site01') {
    return (
      <aside className="terrain-science">
        <p>Time readout is available for Site 01.</p>
      </aside>
    )
  }

  if (!scenarioUrl || site.terrain_status !== 'ready') {
    return (
      <aside className="terrain-science">
        <p>Site 01 has no scenario file yet.</p>
      </aside>
    )
  }

  const sample = scenario ? scenario.series[Math.min(index, scenario.series.length - 1)] : null

  return (
    <aside className="terrain-science" aria-label="Site 01 time">
      <p className="terrain-science-title">{site.name} time</p>
      {error && <p className="terrain-readout-status">{error}</p>}
      {loading && !sample && <p>Loading the Site 01 timeline…</p>}
      {scenario && sample && (
        <Timeline scenario={scenario} sample={sample} index={index} onIndex={setIndex} />
      )}
    </aside>
  )
}

function Timeline({
  scenario,
  sample,
  index,
  onIndex,
}: {
  scenario: TerrainScenario
  sample: VisibilitySample
  index: number
  onIndex: (index: number) => void
}) {
  const last = scenario.series.length - 1
  const utc = formatUtc(sample.utc)

  return (
    <>
      <p className="terrain-science-period">
        {formatUtc(scenario.period.start_utc)} – {formatUtc(scenario.period.end_utc)}
      </p>
      <label className="terrain-science-time">
        Time
        <span className="terrain-exaggeration-row">
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={Math.min(index, last)}
            aria-valuetext={utc}
            onChange={(event) => onIndex(Number(event.target.value))}
          />
        </span>
      </label>
      <p className="terrain-science-utc">{utc}</p>
      <p className="terrain-science-note">
        Sample {index + 1} of {scenario.series.length}. Each step is one exported sample.
      </p>
      <WindowTracks scenario={scenario} offsetS={sample.offset_s} />
      <div className="terrain-science-chips">
        <p className={sample.sunlight_available ? 'terrain-chip terrain-chip-on' : 'terrain-chip'}>
          {sample.sunlight_available ? 'Sunlit' : 'Not sunlit'}
        </p>
        <p className={sample.earth_center_visible ? 'terrain-chip terrain-chip-on' : 'terrain-chip'}>
          {sample.earth_center_visible ? 'Earth visible' : 'Earth not visible'}
        </p>
      </div>
      <dl>
        <div>
          <dt>Solar disc visible</dt>
          <dd>{formatPercent(sample.sun_visible_fraction)}</dd>
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
          <dt>Earth azimuth</dt>
          <dd>{formatAngle(sample.earth_azimuth_deg)}</dd>
        </div>
        <div>
          <dt>Earth elevation</dt>
          <dd>{formatAngle(sample.earth_elevation_deg)}</dd>
        </div>
        <div>
          <dt>Panel</dt>
          <dd>{sample.power_w === null ? 'No panel was calculated' : `${sample.power_w} W`}</dd>
        </div>
      </dl>
    </>
  )
}

function WindowTracks({ scenario, offsetS }: { scenario: TerrainScenario; offsetS: number }) {
  const duration = scenario.period.duration_s
  const playhead = duration > 0 ? (offsetS / duration) * 100 : 0
  const earthEvents = scenario.events.filter((event) => event.kind === 'earth')

  return (
    <div className="terrain-tracks">
      <p className="terrain-science-note">
        Bars come from the window list. A clipped end touches this month's edge, so the real start or end may lie
        outside it.
      </p>
      <WindowTrack name="Sunlight" windows={scenario.windows.sunlight} duration={duration} playhead={playhead} />
      <WindowTrack
        name="Earth"
        windows={scenario.windows.earth}
        duration={duration}
        playhead={playhead}
        events={earthEvents}
      />
      <WindowTrack name="Joint" windows={scenario.windows.joint} duration={duration} playhead={playhead} />
      <WindowTrack name="Darkness" windows={scenario.windows.darkness} duration={duration} playhead={playhead} />
      <WindowTrack
        name="Insufficient light"
        windows={scenario.windows.insufficient_light}
        duration={duration}
        playhead={playhead}
      />
      <EarthEvents events={earthEvents} />
    </div>
  )
}

function WindowTrack({
  name,
  windows,
  duration,
  playhead,
  events = [],
}: {
  name: string
  windows: VisibilityWindow[]
  duration: number
  playhead: number
  events?: VisibilityEvent[]
}) {
  return (
    <div className="terrain-track-block">
      <p className="terrain-track-name">{name}</p>
      {windows.length === 0 ? (
        <p className="terrain-science-note">None in this period.</p>
      ) : (
        <>
          <div className="terrain-track" aria-hidden="true">
            {windows.map((window) => (
              <span
                key={`${window.start_offset_s}-${window.end_offset_s}`}
                className={windowClass(window)}
                style={windowStyle(window, duration)}
              />
            ))}
            {events.map((event) => (
              <span
                key={event.offset_s}
                className="terrain-track-event"
                style={{ left: `${percent(event.offset_s, duration)}%` }}
              />
            ))}
            <span className="terrain-track-now" style={{ left: `${playhead}%` }} />
          </div>
          <ul className="terrain-track-list">
            {windows.map((window) => (
              <li key={`${window.start_utc}-${window.end_utc}`}>
                {formatUtc(window.start_utc)} – {formatUtc(window.end_utc)}
                {clipLabel(window)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function EarthEvents({ events }: { events: VisibilityEvent[] }) {
  return (
    <div className="terrain-track-block">
      <p className="terrain-track-name">Earth events</p>
      {events.length === 0 ? (
        <p className="terrain-science-note">No Earth event was found in this period.</p>
      ) : (
        <ul className="terrain-track-list">
          {events.map((event) => (
            <li key={event.offset_s}>
              {formatUtc(event.utc)} · {event.active_after ? 'Earth visible after this time' : 'Earth not visible after this time'}
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

function windowStyle(window: VisibilityWindow, duration: number) {
  const left = percent(window.start_offset_s, duration)
  const end = percent(window.end_offset_s, duration)
  return { left: `${left}%`, width: `${Math.max(end - left, 0)}%` }
}

function percent(offsetS: number, duration: number) {
  if (duration <= 0) return 0
  return (offsetS / duration) * 100
}

function clipLabel(window: VisibilityWindow) {
  if (window.start_clipped && window.end_clipped) return ' · clipped at both ends'
  if (window.start_clipped) return ' · start clipped'
  if (window.end_clipped) return ' · end clipped'
  return ''
}

function formatUtc(utc: string) {
  if (!utc.endsWith('Z')) return utc
  return `${utc.slice(0, -1).replace('T', ' ')} UTC`
}

function formatAngle(value: number | null) {
  if (value === null) return 'Undefined'
  return `${value.toFixed(2)}°`
}

function formatPercent(fraction: number) {
  return `${(fraction * 100).toFixed(1)}%`
}

function messageFrom(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}
