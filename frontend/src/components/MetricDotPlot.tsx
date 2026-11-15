import { useEffect, useRef, useState } from 'react'
import { groupByValue, siteList } from '../science/compare'
import { formatDurationCompact } from '../science/format'
import { sameValue } from '../science/timeline'
import type { ScenarioMetrics, Site, SiteId } from '../types/science'

export type DotRow = {
  label: string
  better: 'max' | 'min'
  tone: 'sun' | 'earth' | 'joint'
  value: (metrics: ScenarioMetrics) => number | null
}

type Column = { site: Site; metrics: ScenarioMetrics | null }

/**
 * Durations of every site on one 0-to-period axis. The zero-based axis keeps
 * differences honest. Rows equal at every site are folded into one line;
 * rows with no values (for example energy without a panel model) are skipped.
 */
export function MetricDotPlot({
  rows,
  columns,
  periodS,
  selectedId,
}: {
  rows: DotRow[]
  columns: Column[]
  periodS: number
  selectedId: SiteId
}) {
  const axisRef = useRef<HTMLDivElement>(null)
  const [trackW, setTrackW] = useState(600)
  useEffect(() => {
    const el = axisRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setTrackW(el.clientWidth || 600))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const ready = columns.filter((column): column is Column & { metrics: ScenarioMetrics } => column.metrics !== null)
  const plotted: { row: DotRow; points: { site: Site; value: number }[] }[] = []
  const equal: { row: DotRow; value: number }[] = []
  for (const row of rows) {
    const points = ready
      .map(({ site, metrics }) => ({ site, value: row.value(metrics) }))
      .filter((point): point is { site: Site; value: number } => point.value !== null)
    if (points.length < 2) continue
    if (points.every((point) => sameValue(point.value, points[0].value))) equal.push({ row, value: points[0].value })
    else plotted.push({ row, points })
  }
  const pct = (value: number) => `${Math.min(Math.max(value / periodS, 0), 1) * 100}%`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * periodS)

  return (
    <div className="dots">
      <div className="dots-axis" aria-hidden="true" ref={axisRef}>
        {ticks.map((tick) => (
          <span key={tick} style={{ left: pct(tick) }}>
            {formatDurationCompact(tick)}
          </span>
        ))}
      </div>
      {plotted.map(({ row, points }) => {
        const groups = groupByValue(points, (point) => point.value, row.better)
        const best = groups[0]
        const ordered = [...groups].sort((a, b) => a.value - b.value)
        const slots = labelSlots(
          ordered.map((group) => ({
            x: Math.min(Math.max(group.value / periodS, 0), 1) * trackW,
            text: `${group.items.map((item) => item.site.site_id.slice(4)).join(' · ')} ${formatDurationCompact(group.value)}`,
          })),
        )
        const tall = slots.some((slot) => slot >= 2)
        return (
          <div key={row.label} className={tall ? 'dots-row dots-row-tall' : 'dots-row'}>
            <div className="dots-label">
              <span className="dots-name">{row.label}</span>
              <span className="dots-hint">{row.better === 'max' ? 'more is better' : 'shorter is better'}</span>
            </div>
            <div
              className={`dots-track dots-tone-${row.tone}`}
              role="img"
              aria-label={`${row.label}: ${groups
                .map((group) => `${siteList(group.items.map((item) => item.site.site_id))} ${formatDurationCompact(group.value)}`)
                .join('; ')}`}
            >
              {ticks.map((tick) => (
                <span key={tick} className="dots-grid" style={{ left: pct(tick) }} />
              ))}
              {ordered.map((group, index) => {
                const isBest = group === best
                const selected = group.items.some((item) => item.site.site_id === selectedId)
                return (
                  <span
                    key={group.value}
                    className={`dots-point dots-slot-${slots[index]}${isBest ? ' dots-best' : ''}${selected ? ' dots-selected' : ''}`}
                    style={{ left: pct(group.value) }}
                    title={`${siteList(group.items.map((item) => item.site.site_id))}: ${formatDurationCompact(group.value)}`}
                  >
                    <span className="dots-dot" />
                    <span className="dots-tag">
                      {group.items.map((item) => item.site.site_id.slice(4)).join(' · ')}
                      <span className="dots-value">{formatDurationCompact(group.value)}</span>
                    </span>
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
      {equal.length > 0 && (
        <p className="dots-equal">
          Same at all four sites: {equal.map(({ row, value }) => `${row.label.toLowerCase()} ${formatDurationCompact(value)}`).join(' · ')}.
        </p>
      )}
    </div>
  )
}

/**
 * Assigns each label (sorted by x) to the first slot where it does not overlap
 * the previous label in that slot: 0 above, 1 below, 2 far above, 3 far below.
 * Widths are estimated from the text at 11 px.
 */
function labelSlots(labels: { x: number; text: string }[]) {
  const lastEnd = [-Infinity, -Infinity, -Infinity, -Infinity]
  return labels.map(({ x, text }) => {
    const width = text.length * 6.4 + 4
    const start = x - width / 2
    let slot = lastEnd.findIndex((end) => start > end + 6)
    if (slot === -1) slot = lastEnd.indexOf(Math.min(...lastEnd))
    lastEnd[slot] = x + width / 2
    return slot
  })
}
