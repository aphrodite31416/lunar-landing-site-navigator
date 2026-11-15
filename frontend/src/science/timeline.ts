import type { ScenarioMetrics, VisibilityEvent, VisibilitySample, VisibilityWindow } from '../types/science'

export type EventKind = VisibilityEvent['kind']

/** Index of the exported sample closest in time; samples are sorted but unevenly spaced. */
export function nearestSampleIndex(series: VisibilitySample[], offsetS: number) {
  let low = 0
  let high = series.length - 1
  if (offsetS <= series[low].offset_s) return low
  if (offsetS >= series[high].offset_s) return high
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (series[middle].offset_s <= offsetS) low = middle
    else high = middle
  }
  return offsetS - series[low].offset_s <= series[high].offset_s - offsetS ? low : high
}

export function nextEvent(events: VisibilityEvent[], afterOffsetS: number, kind?: EventKind) {
  let best: VisibilityEvent | null = null
  for (const event of events) {
    if (kind && event.kind !== kind) continue
    if (event.offset_s <= afterOffsetS) continue
    if (!best || event.offset_s < best.offset_s) best = event
  }
  return best
}

export function previousEvent(events: VisibilityEvent[], beforeOffsetS: number, kind?: EventKind) {
  let best: VisibilityEvent | null = null
  for (const event of events) {
    if (kind && event.kind !== kind) continue
    if (event.offset_s >= beforeOffsetS) continue
    if (!best || event.offset_s > best.offset_s) best = event
  }
  return best
}

export function describeEvent(event: VisibilityEvent, threshold: string) {
  switch (event.kind) {
    case 'sunlight':
      return event.active_after
        ? `Sunlight becomes available (≥ ${threshold} of the solar disc)`
        : `Visible solar disc drops below ${threshold}`
    case 'earth':
      return event.active_after
        ? 'Earth centre comes into line of sight'
        : 'Earth centre goes below the terrain horizon'
    case 'darkness':
      return event.active_after ? 'Darkness begins (no solar disc visible)' : 'Darkness ends'
  }
}

export const eventKindLabel: Record<EventKind, string> = {
  sunlight: 'Sunlight',
  earth: 'Earth',
  darkness: 'Darkness',
}

/**
 * Window membership as [start, end), so an event instant shows the state after
 * the event. A window clipped at the period end also contains that end.
 */
export function inWindows(windows: VisibilityWindow[], offsetS: number) {
  return windows.some(
    (window) =>
      window.start_offset_s <= offsetS &&
      (offsetS < window.end_offset_s || (window.end_clipped && offsetS === window.end_offset_s)),
  )
}

/**
 * The next start or end of any window after the offset. Edges that only touch
 * the analysis period boundary are not real transitions and are skipped.
 */
export function nextWindowBoundary(windows: VisibilityWindow[], afterOffsetS: number) {
  let best: { offset_s: number; utc: string; starts: boolean } | null = null
  for (const window of windows) {
    if (!window.start_clipped && window.start_offset_s > afterOffsetS) {
      if (!best || window.start_offset_s < best.offset_s) {
        best = { offset_s: window.start_offset_s, utc: window.start_utc, starts: true }
      }
    }
    if (!window.end_clipped && window.end_offset_s > afterOffsetS) {
      if (!best || window.end_offset_s < best.offset_s) {
        best = { offset_s: window.end_offset_s, utc: window.end_utc, starts: false }
      }
    }
  }
  return best
}

/**
 * UTC midnights inside the period, placed on the offset axis by linear mapping
 * between the exported period endpoints. Used only to position axis labels.
 */
export function dayTicks(period: { start_utc: string; end_utc: string; duration_s: number }, origin: number) {
  const startMs = Date.parse(period.start_utc)
  const endMs = Date.parse(period.end_utc)
  if (!Number.isFinite(startMs) || !(endMs > startMs)) return []
  const dayMs = 86400000
  const ticks: { ms: number; offset_s: number; index: number }[] = []
  let ms = Math.ceil(startMs / dayMs) * dayMs
  for (let index = 0; ms <= endMs; index++, ms += dayMs) {
    ticks.push({ ms, offset_s: origin + ((ms - startMs) / (endMs - startMs)) * period.duration_s, index })
  }
  return ticks
}

/**
 * Whether the window matching a "longest" metric touches the period edge, so
 * the real duration may be longer. Null when no window matches.
 */
export function longestIsClipped(windows: VisibilityWindow[], longestS: number) {
  if (longestS <= 0) return null
  const match = windows.find((window) => sameValue(window.duration_s, longestS))
  if (!match) return null
  return match.start_clipped || match.end_clipped
}

export function sameValue(a: number, b: number) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

export const metricKeys: (keyof ScenarioMetrics)[] = [
  'sunlight_s',
  'sunlight_time_fraction',
  'longest_sunlight_s',
  'longest_insufficient_light_s',
  'longest_darkness_s',
  'earth_visible_s',
  'longest_earth_gap_s',
  'joint_s',
  'longest_joint_s',
  'mean_sun_visible_fraction',
  'equivalent_full_disc_s',
  'energy_wh',
]

/** Keys whose values differ between two metric records. */
export function metricDifferences(a: ScenarioMetrics, b: ScenarioMetrics) {
  return metricKeys.filter((key) => {
    const left = a[key]
    const right = b[key]
    if (left === null || right === null) return left !== right
    return !sameValue(left, right)
  })
}
