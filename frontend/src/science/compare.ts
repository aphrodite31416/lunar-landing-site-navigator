import { sameValue } from './timeline'
import type { CompareSummarySite, SiteId, TerrainScenario, VisibilityWindow } from '../types/science'

/** Items grouped by equal value (ties share a group), best first. */
export function groupByValue<T>(items: T[], value: (item: T) => number, better: 'max' | 'min') {
  const sorted = [...items].sort((a, b) => (better === 'max' ? value(b) - value(a) : value(a) - value(b)))
  const groups: { value: number; items: T[] }[] = []
  for (const item of sorted) {
    const last = groups.at(-1)
    if (last && sameValue(last.value, value(item))) last.items.push(item)
    else groups.push({ value: value(item), items: [item] })
  }
  return groups
}

/** "Site 01", "Sites 01 and 11", "Sites 01, 07 and 11". */
export function siteList(ids: SiteId[]) {
  const nums = ids.map((id) => id.slice(4))
  if (nums.length === 1) return `Site ${nums[0]}`
  return `Sites ${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}`
}

/**
 * What the Compare timelines need from a site: its period, offset range and
 * windows. Built from the lightweight summary, or from a full scenario as a fallback.
 */
export type TimelineSource = {
  site_id: SiteId
  period: TerrainScenario['period']
  origin_offset_s: number
  end_offset_s: number
  windows: TerrainScenario['windows']
}

export function sourceFromScenario(scenario: TerrainScenario): TimelineSource {
  return {
    site_id: scenario.site_id,
    period: scenario.period,
    origin_offset_s: scenario.series[0].offset_s,
    end_offset_s: scenario.series[scenario.series.length - 1].offset_s,
    windows: scenario.windows,
  }
}

export function sourceFromSummary(site: CompareSummarySite): TimelineSource {
  return {
    site_id: site.site_id,
    period: site.period,
    origin_offset_s: site.origin_offset_s,
    end_offset_s: site.end_offset_s,
    windows: site.windows,
  }
}

export type Interval = {
  start: number
  end: number
  startUtc: string
  endUtc: string
  /** True when the interval touches the analysis period edge, so it may extend beyond it. */
  startClipped: boolean
  endClipped: boolean
}

/**
 * Spans inside the period during which none of the scenarios has the given
 * window kind: the complement of the union of every site's windows. All
 * scenarios must share one period; otherwise null is returned.
 */
export function sharedGaps(
  scenarios: TimelineSource[],
  kind: 'earth' | 'sunlight',
): Interval[] | null {
  if (scenarios.length === 0) return null
  const first = scenarios[0]
  const origin = first.origin_offset_s
  const end = first.end_offset_s
  const samePeriod = scenarios.every(
    (s) =>
      s.period.start_utc === first.period.start_utc &&
      s.period.end_utc === first.period.end_utc &&
      s.origin_offset_s === origin &&
      s.end_offset_s === end,
  )
  if (!samePeriod) return null

  const windows: VisibilityWindow[] = scenarios
    .flatMap((s) => s.windows[kind])
    .sort((a, b) => a.start_offset_s - b.start_offset_s)

  // Union of windows, keeping the exported UTC strings of each edge.
  const merged: { start: number; end: number; startUtc: string; endUtc: string }[] = []
  for (const w of windows) {
    const last = merged.at(-1)
    if (last && w.start_offset_s <= last.end) {
      if (w.end_offset_s > last.end) {
        last.end = w.end_offset_s
        last.endUtc = w.end_utc
      }
    } else {
      merged.push({ start: w.start_offset_s, end: w.end_offset_s, startUtc: w.start_utc, endUtc: w.end_utc })
    }
  }

  const gaps: Interval[] = []
  let cursor = origin
  let cursorUtc = first.period.start_utc
  for (const m of merged) {
    if (m.start > cursor) {
      gaps.push({
        start: cursor,
        end: m.start,
        startUtc: cursorUtc,
        endUtc: m.startUtc,
        startClipped: cursor === origin,
        endClipped: false,
      })
    }
    if (m.end > cursor) {
      cursor = m.end
      cursorUtc = m.endUtc
    }
  }
  if (cursor < end) {
    gaps.push({
      start: cursor,
      end,
      startUtc: cursorUtc,
      endUtc: first.period.end_utc,
      startClipped: cursor === origin,
      endClipped: true,
    })
  }
  return gaps
}
