const isoUtc = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z$/

/** Formats the exported UTC string as text; never converts through the browser time zone. */
export function formatUtc(utc: string) {
  const match = isoUtc.exec(utc)
  if (!match) return utc
  return `${match[1]} ${match[2]} UTC`
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 16, 12:54 UTC" — minutes truncated; pair with the full value in a title. */
export function formatUtcShort(utc: string) {
  const match = isoUtc.exec(utc)
  if (!match) return utc
  const [, date, time] = match
  const month = monthNames[Number(date.slice(5, 7)) - 1]
  return `${month} ${Number(date.slice(8, 10))}, ${time.slice(0, 5)} UTC`
}

/** Month and day of a UTC instant in milliseconds, without the browser time zone. */
export function formatUtcDay(ms: number) {
  const iso = new Date(ms).toISOString()
  return `${monthNames[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
}

const units: [number, string][] = [
  [86400, 'd'],
  [3600, 'h'],
  [60, 'min'],
  [1, 's'],
]

/** Up to three of d / h / min / s, truncated to whole seconds. */
export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return 'Unknown'
  const sign = seconds < 0 ? '−' : ''
  let rest = Math.abs(seconds)
  if (rest < 1) return `${sign}${rest === 0 ? '0' : rest.toFixed(2)} s`
  const parts: string[] = []
  for (const [size, unit] of units) {
    const count = Math.floor(rest / size)
    rest -= count * size
    if (count > 0) parts.push(`${count} ${unit}`)
  }
  return sign + parts.slice(0, 3).join(' ')
}

/** A single-unit duration for side-by-side tables. */
export function formatDurationCompact(seconds: number) {
  if (!Number.isFinite(seconds)) return 'Unknown'
  const value = Math.abs(seconds)
  if (value === 0) return '0 s'
  if (value >= 86400) return `${(seconds / 86400).toFixed(2)} d`
  if (value >= 3600) return `${(seconds / 3600).toFixed(1)} h`
  if (value >= 60) return `${(seconds / 60).toFixed(1)} min`
  return `${seconds.toFixed(1)} s`
}

export function exactSeconds(seconds: number) {
  return `${seconds.toFixed(3)} s`
}

export function formatPercent(fraction: number, digits = 1) {
  return `${(fraction * 100).toFixed(digits)}%`
}

/** A percentage with enough digits that it never rounds onto the threshold it is compared with. */
export function formatPercentVersus(fraction: number, threshold: number, digits = 1) {
  if (fraction === threshold) return formatPercent(fraction, digits)
  for (let d = digits; d <= 4; d++) {
    const text = formatPercent(fraction, d)
    if (text !== formatPercent(threshold, d)) return text
  }
  return `${fraction < threshold ? '<' : '>'} ${formatPercent(threshold, 4)}`
}

/** Planetocentric latitude and east-positive longitude as hemisphere text. */
export function formatLatLon(latitudeDeg: number, longitudeDeg: number) {
  const lat = `${Math.abs(latitudeDeg).toFixed(2)}° ${latitudeDeg < 0 ? 'S' : 'N'}`
  const lon = `${Math.abs(longitudeDeg).toFixed(2)}° ${longitudeDeg < 0 ? 'W' : 'E'}`
  return `${lat}, ${lon}`
}

export function formatAngle(value: number | null) {
  if (value === null) return 'Undefined'
  return `${value.toFixed(2)}°`
}

export function messageFrom(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}
