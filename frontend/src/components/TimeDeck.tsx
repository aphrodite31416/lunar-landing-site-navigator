import { useState, type CSSProperties, type PointerEvent } from 'react'
import { offsetForUtcMs, utcAtOffset } from '../science/clock'
import { formatDuration, formatUtc, formatUtcShort } from '../science/format'
import { inWindows } from '../science/timeline'
import type { TerrainScenario } from '../types/science'
import { TimelineChart } from './ScenarioTimeline'
import { playSpeeds, thresholdLabel, timeControls } from './timeControls'

const isoParts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):(\d{2})/

/**
 * The bottom Time Deck. The visibility lanes are the scrubber: an invisible
 * range input lies over them, so dragging anywhere on the lanes moves the
 * shared clock and the keyboard keeps working.
 */
export function TimeDeck({
  scenario,
  offsetS,
  onSeek,
  status,
  playing,
  onTogglePlay,
  speed,
  onSpeed,
}: {
  scenario: TerrainScenario | null
  offsetS: number
  onSeek: (offsetS: number) => void
  status: string | null
  playing: boolean
  onTogglePlay: () => void
  speed: number
  onSpeed: (speed: number) => void
}) {
  const [openedAtMs] = useState(() => Date.now())
  const [hover, setHover] = useState<{ fraction: number } | null>(null)
  // Phones start with a one-row deck so it does not cover the conditions panel.
  const [expanded, setExpanded] = useState(false)

  if (!scenario) {
    return (
      <section className="atlas-deck atlas-deck-empty" aria-label="Time">
        <p className="deck-status">{status ?? 'Loading the scenario…'}</p>
      </section>
    )
  }

  const origin = scenario.series[0].offset_s
  const utc = utcAtOffset(scenario, offsetS)
  const parts = isoParts.exec(utc)
  const { slider, back, forward } = timeControls({ scenario, offsetS, onSeek })
  const todayOffset = offsetForUtcMs(scenario, openedAtMs)
  const nowAvailable = todayOffset !== null
  const end = scenario.series[scenario.series.length - 1].offset_s
  const fractionOf = (offset: number) => (offset - origin) / (end - origin)

  // Hover readout: time and states under the pointer, read from the windows.
  const onTrackMove = (event: PointerEvent<HTMLDivElement>) => {
    const slider = event.currentTarget.querySelector('.deck-slider')
    if (!slider) return
    const rect = slider.getBoundingClientRect()
    if (rect.width <= 0) return
    const fraction = (event.clientX - rect.left) / rect.width
    setHover(fraction < 0 || fraction > 1 ? null : { fraction })
  }
  const hoverOffset = hover ? origin + hover.fraction * (end - origin) : null
  const hoverUtc = hoverOffset !== null ? utcAtOffset(scenario, hoverOffset) : null

  return (
    <section className={`atlas-deck${expanded ? '' : ' deck-compact'}`} aria-label="Time">
      <span className="deck-progress" style={{ '--f': fractionOf(offsetS) } as CSSProperties} aria-hidden="true" />
      <div className="deck-bar">
        <div className="deck-readout">
          <p className="deck-meta">
            <span className="deck-date">{parts ? parts[1] : formatUtc(utc)}</span>
            <span className="deck-zone">UTC</span>
            <span className="deck-sub" title="Time since the start of the scenario">
              T+{formatDuration(offsetS - origin)}
            </span>
          </p>
          <p className="deck-time" title={utc}>
            {parts && (
              <>
                <span className="deck-clock">{parts[2]}</span>
                <span className="deck-seconds">:{parts[3]}</span>
              </>
            )}
          </p>
        </div>

        <div className="deck-transport" role="group" aria-label="Playback and time steps">
          {back}
          <button
            type="button"
            className="deck-play"
            aria-pressed={playing}
            onClick={onTogglePlay}
            title={playing ? 'Pause (Space)' : 'Play through the period (Space)'}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="4" y="3" width="3" height="10" rx="0.6" />
                <rect x="9" y="3" width="3" height="10" rx="0.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" />
              </svg>
            )}
            <span className="sr-only">{playing ? 'Pause' : 'Play'}</span>
          </button>
          {forward}
        </div>

        <div className="deck-end">
          <div className="deck-speed" role="radiogroup" aria-label="Playback speed">
            <span className="deck-speed-label" aria-hidden="true">
              Rate
            </span>
            {playSpeeds.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={speed === item.value}
                className="deck-speed-btn"
                onClick={() => onSpeed(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="deck-btn deck-now"
            disabled={!nowAvailable}
            title={nowAvailable ? 'Jump to the current UTC time' : 'The current time is outside this scenario'}
            onClick={() => {
              const now = offsetForUtcMs(scenario, Date.now())
              if (now !== null) onSeek(now)
            }}
          >
            Now
          </button>
          <button
            type="button"
            className="deck-btn deck-toggle"
            aria-expanded={expanded}
            aria-controls="deck-details"
            onClick={() => setExpanded((value) => !value)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 10l4-4 4 4" />
            </svg>
            <span className="sr-only">{expanded ? 'Hide the timeline' : 'Show the timeline and event steps'}</span>
          </button>
        </div>
      </div>
      <div id="deck-details" className="deck-track" onPointerMove={onTrackMove} onPointerLeave={() => setHover(null)}>
        <TimelineChart scenario={scenario} offsetS={offsetS} threshold={thresholdLabel(scenario)} onGo={onSeek} />
        {slider}
        {todayOffset !== null && (
          <span
            className="deck-today"
            style={{ '--f': fractionOf(todayOffset) } as CSSProperties}
            title={`Today, ${formatUtc(utcAtOffset(scenario, todayOffset))}`}
            aria-hidden="true"
          >
            <span>Today</span>
          </span>
        )}
        {hover && hoverOffset !== null && hoverUtc && (
          <span className="deck-hover" style={{ '--f': hover.fraction } as CSSProperties} aria-hidden="true">
            <span className="deck-hover-time">{formatUtcShort(hoverUtc)}</span>
            <span className="deck-hover-dots">
              <i className={`dot dot-sun${inWindows(scenario.windows.sunlight, hoverOffset) ? ' dot-on' : ''}`} />
              <i className={`dot dot-earth${inWindows(scenario.windows.earth, hoverOffset) ? ' dot-on' : ''}`} />
              <i className={`dot dot-joint${inWindows(scenario.windows.joint, hoverOffset) ? ' dot-on' : ''}`} />
            </span>
          </span>
        )}
      </div>
    </section>
  )
}
