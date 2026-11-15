import { inWindows, nearestSampleIndex } from './timeline'
import type { TerrainScenario, VisibilitySample } from '../types/science'

/**
 * The shared moment the whole app looks at.
 *
 * It is the moment the user asked for, stored exactly as an elapsed offset on
 * the axis of the scenario it was set on. It is never replaced by a sample's
 * offset, so switching sites cannot drift it: each site picks its own nearest
 * sample for continuous values, while sunlight / Earth / joint states come from
 * the precomputed windows at this exact offset.
 */
export type Clock = {
  offsetS: number
  /** The axis the offset belongs to, so it can be carried to another scenario. */
  axis: Axis
}

export type Axis = { startUtc: string; endUtc: string; origin: number; durationS: number }

function axisOf(scenario: TerrainScenario): Axis {
  return {
    startUtc: scenario.period.start_utc,
    endUtc: scenario.period.end_utc,
    origin: scenario.series[0].offset_s,
    durationS: scenario.period.duration_s,
  }
}

/** A site's axis and offset range without its sample series (e.g. from the Compare summary). */
export type AxisSource = {
  period: { start_utc: string; end_utc: string; duration_s: number }
  origin_offset_s: number
  end_offset_s: number
}

function axisOfSource(source: AxisSource): Axis {
  return {
    startUtc: source.period.start_utc,
    endUtc: source.period.end_utc,
    origin: source.origin_offset_s,
    durationS: source.period.duration_s,
  }
}

/** Same as clockAt, for a source without samples; it yields the identical axis. */
export function clockOnSource(source: AxisSource, offsetS: number): Clock {
  const clamped = Math.min(Math.max(offsetS, source.origin_offset_s), source.end_offset_s)
  return { offsetS: clamped, axis: axisOfSource(source) }
}

/** Same as clockOffsetFor, for a source without samples. */
export function clockOffsetOnSource(clock: Clock | null, source: AxisSource) {
  const clamp = (offset: number) => Math.min(Math.max(offset, source.origin_offset_s), source.end_offset_s)
  if (!clock) return source.origin_offset_s
  const axis = axisOfSource(source)
  if (sameAxis(clock.axis, axis)) return clamp(clock.offsetS)
  return clamp(offsetAtMs(axis, msAt(clock.axis, clock.offsetS)))
}

function sameAxis(a: Axis, b: Axis) {
  return a.startUtc === b.startUtc && a.endUtc === b.endUtc && a.origin === b.origin && a.durationS === b.durationS
}

/** First and last exported sample offsets: the range the timeline can show. */
export function offsetBounds(scenario: TerrainScenario) {
  const series = scenario.series
  return { start: series[0].offset_s, end: series[series.length - 1].offset_s }
}

export function clampOffset(scenario: TerrainScenario, offsetS: number) {
  const { start, end } = offsetBounds(scenario)
  return Math.min(Math.max(offsetS, start), end)
}

/** A clock set on this scenario's axis, clamped to its samples but not snapped to them. */
export function clockAt(scenario: TerrainScenario, offsetS: number): Clock {
  return { offsetS: clampOffset(scenario, offsetS), axis: axisOf(scenario) }
}

/**
 * The shared moment on this scenario's axis. Scenarios from the same dataset
 * share an axis, so the offset carries over exactly. A different period is
 * mapped through its UTC endpoints, the same linear mapping as `dayTicks`.
 */
export function clockOffsetFor(clock: Clock | null, scenario: TerrainScenario) {
  if (!clock) return offsetBounds(scenario).start
  const axis = axisOf(scenario)
  if (sameAxis(clock.axis, axis)) return clampOffset(scenario, clock.offsetS)
  const ms = msAt(clock.axis, clock.offsetS)
  return clampOffset(scenario, offsetAtMs(axis, ms))
}

function msAt(axis: Axis, offsetS: number) {
  const startMs = Date.parse(axis.startUtc)
  const endMs = Date.parse(axis.endUtc)
  return startMs + ((offsetS - axis.origin) / axis.durationS) * (endMs - startMs)
}

function offsetAtMs(axis: Axis, ms: number) {
  const startMs = Date.parse(axis.startUtc)
  const endMs = Date.parse(axis.endUtc)
  return axis.origin + ((ms - startMs) / (endMs - startMs)) * axis.durationS
}

/** The scenario offset of a UTC instant, or null when it lies outside the period. */
export function offsetForUtcMs(scenario: TerrainScenario, ms: number) {
  const axis = axisOf(scenario)
  if (ms < Date.parse(axis.startUtc) || ms > Date.parse(axis.endUtc)) return null
  return clampOffset(scenario, offsetAtMs(axis, ms))
}

/**
 * The UTC instant of an offset as an ISO string. Exported strings are used
 * whenever the offset is exactly a sample or an event, so those times read
 * exactly as the pipeline wrote them; other moments use the linear mapping.
 */
export function utcAtOffset(scenario: TerrainScenario, offsetS: number, sample?: VisibilitySample) {
  if (sample && sample.offset_s === offsetS) return sample.utc
  const event = scenario.events.find((item) => item.offset_s === offsetS)
  if (event) return event.utc
  // Offsets are elapsed ET seconds; the period's UTC span differs by a fraction of a
  // millisecond, so round to the millisecond to keep whole-second moments whole.
  return new Date(Math.round(msAt(axisOf(scenario), offsetS))).toISOString()
}

/** The sample strictly after / before the offset, for single-sample keyboard steps. */
export function nextSampleOffset(series: VisibilitySample[], offsetS: number) {
  for (const sample of series) if (sample.offset_s > offsetS) return sample.offset_s
  return series[series.length - 1].offset_s
}

export function previousSampleOffset(series: VisibilitySample[], offsetS: number) {
  for (let i = series.length - 1; i >= 0; i--) if (series[i].offset_s < offsetS) return series[i].offset_s
  return series[0].offset_s
}

const stateKinds = ['sunlight', 'earth', 'darkness'] as const

/**
 * The sample whose angles and fractions are shown for a moment. Normally the
 * nearest one; but if a window boundary lies between it and the moment, the
 * sample at or before the moment is used instead. Every event has an exact
 * sample, so that one always agrees with the window states at the moment and
 * the numbers can never contradict the state shown beside them.
 */
export function sampleIndexAt(scenario: TerrainScenario, offsetS: number) {
  const series = scenario.series
  const nearest = nearestSampleIndex(series, offsetS)
  const agrees = (index: number) =>
    stateKinds.every(
      (kind) => inWindows(scenario.windows[kind], series[index].offset_s) === inWindows(scenario.windows[kind], offsetS),
    )
  if (agrees(nearest)) return nearest
  let index = nearest
  while (index > 0 && series[index].offset_s > offsetS) index--
  return index
}
