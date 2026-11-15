import type { KeyboardEvent } from 'react'
import { nextSampleOffset, previousSampleOffset, utcAtOffset } from '../science/clock'
import { formatPercent, formatUtc } from '../science/format'
import { nextEvent, previousEvent } from '../science/timeline'
import type { TerrainScenario } from '../types/science'

const hour = 3600
const day = 86400

/** Playback speeds in scenario seconds per real second. */
export const playSpeeds = [
  { value: 3600, label: '1 h/s' },
  { value: 6 * 3600, label: '6 h/s' },
  { value: 86400, label: '1 d/s' },
] as const

export function thresholdLabel(scenario: TerrainScenario) {
  return formatPercent(scenario.model.settings.minimum_sun_fraction, 0)
}

/**
 * Time slider, steps and event jumps. Every control sets the requested moment
 * exactly (`onSeek`); nothing here snaps the shared clock to a sample.
 */
export function timeControls({
  scenario,
  offsetS,
  onSeek,
}: {
  scenario: TerrainScenario
  offsetS: number
  onSeek: (offsetS: number) => void
}) {
  const series = scenario.series
  const origin = series[0].offset_s
  const end = series[series.length - 1].offset_s
  const earlier = previousEvent(scenario.events, offsetS)
  const later = nextEvent(scenario.events, offsetS)
  const utc = utcAtOffset(scenario, offsetS)

  function onSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    const moves: Record<string, () => void> = {
      ArrowLeft: () => onSeek(previousSampleOffset(series, offsetS)),
      ArrowDown: () => onSeek(previousSampleOffset(series, offsetS)),
      ArrowRight: () => onSeek(nextSampleOffset(series, offsetS)),
      ArrowUp: () => onSeek(nextSampleOffset(series, offsetS)),
      PageDown: () => onSeek(offsetS - hour),
      PageUp: () => onSeek(offsetS + hour),
      Home: () => onSeek(origin),
      End: () => onSeek(end),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    move()
  }

  return {
    slider: (
      <input
        className="deck-slider"
        type="range"
        min={origin}
        max={end}
        step="any"
        value={offsetS}
        aria-label="Selected time (UTC)"
        aria-valuetext={formatUtc(utc)}
        onChange={(event) => onSeek(Number(event.target.value))}
        onKeyDown={onSliderKey}
      />
    ),
    /** Earlier: previous event, one day back, one hour back. */
    back: (
      <>
        <button
          type="button"
          className="deck-btn deck-btn-event"
          disabled={!earlier}
          onClick={() => earlier && onSeek(earlier.offset_s)}
          title={earlier ? `Previous event: ${formatUtc(earlier.utc)}` : 'No earlier event'}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 3.5v9" />
            <path d="M12 4 6.5 8l5.5 4z" />
          </svg>
          <span className="deck-label">Event</span>
          <span className="sr-only">Previous event</span>
        </button>
        <button type="button" className="deck-btn" disabled={offsetS <= origin} onClick={() => onSeek(offsetS - day)} aria-label="Back one day">
          −1 d
        </button>
        <button type="button" className="deck-btn" disabled={offsetS <= origin} onClick={() => onSeek(offsetS - hour)} aria-label="Back one hour">
          −1 h
        </button>
      </>
    ),
    /** Later: one hour forward, one day forward, next event. */
    forward: (
      <>
        <button type="button" className="deck-btn" disabled={offsetS >= end} onClick={() => onSeek(offsetS + hour)} aria-label="Forward one hour">
          +1 h
        </button>
        <button type="button" className="deck-btn" disabled={offsetS >= end} onClick={() => onSeek(offsetS + day)} aria-label="Forward one day">
          +1 d
        </button>
        <button
          type="button"
          className="deck-btn deck-btn-event"
          disabled={!later}
          onClick={() => later && onSeek(later.offset_s)}
          title={later ? `Next event: ${formatUtc(later.utc)}` : 'No later event'}
        >
          <span className="deck-label">Event</span>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M12 3.5v9" />
            <path d="M4 4l5.5 4L4 12z" />
          </svg>
          <span className="sr-only">Next event</span>
        </button>
      </>
    ),
  }
}

