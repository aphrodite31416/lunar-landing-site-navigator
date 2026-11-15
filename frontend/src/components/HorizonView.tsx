import { useEffect, useMemo, useState } from 'react'
import { loadHorizon } from '../sites/loadHorizon'
import { formatAngle, formatPercent, messageFrom } from '../science/format'
import { inWindows } from '../science/timeline'
import type { HorizonProfile, Site, TerrainScenario, VisibilitySample } from '../types/science'

const W = 480
const H = 190
const PAD = { left: 30, right: 8, top: 10, bottom: 20 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const SILHOUETTE_BINS = 720
const MAX_PATH_POINTS = 1500

const compass = [
  { az: 0, label: 'N' },
  { az: 90, label: 'E' },
  { az: 180, label: 'S' },
  { az: 270, label: 'W' },
  { az: 360, label: 'N' },
]

export function HorizonView({
  site,
  scenario,
  sample,
}: {
  site: Site
  scenario: TerrainScenario
  sample: VisibilitySample
}) {
  const { horizon, error, retry } = useHorizon(site)
  const frame = useMemo(() => (horizon ? buildFrame(horizon, scenario) : null), [horizon, scenario])
  const sunlit = inWindows(scenario.windows.sunlight, sample.offset_s)
  const earthVisible = inWindows(scenario.windows.earth, sample.offset_s)

  return (
    <section className="sci-section sky" aria-labelledby={`sky-${site.site_id}`}>
      <h3 className="sci-section-title" id={`sky-${site.site_id}`}>
        Sky above the terrain horizon
      </h3>
      {error ? (
        <div className="terrain-science-warning">
          <p>{error}</p>
          <button type="button" className="terrain-info-toggle" onClick={retry}>
            Retry
          </button>
        </div>
      ) : !frame ? (
        <div className="sky-placeholder">Loading the {site.name} horizon profile…</div>
      ) : (
        <SkyChart
          frame={frame}
          sample={sample}
          horizonName={horizon?.name ?? site.name}
          threshold={scenario.model.settings.minimum_sun_fraction}
          sunlit={sunlit}
          earthVisible={earthVisible}
        />
      )}
    </section>
  )
}

interface Frame {
  yMin: number
  yMax: number
  silhouette: string
  sunPath: string
  earthPath: string
  ticks: number[]
  stretch: number
}

function SkyChart({
  frame,
  sample,
  horizonName,
  threshold,
  sunlit,
  earthVisible,
}: {
  frame: Frame
  sample: VisibilitySample
  horizonName: string
  threshold: number
  sunlit: boolean
  earthVisible: boolean
}) {
  const x = (az: number) => PAD.left + (az / 360) * PLOT_W
  const y = (el: number) => PAD.top + ((frame.yMax - el) / (frame.yMax - frame.yMin)) * PLOT_H
  const degPx = PLOT_H / (frame.yMax - frame.yMin)

  const sun = bodyPosition(sample.sun_azimuth_deg, sample.sun_elevation_deg, sample.sun_horizon_deg)
  const earth = bodyPosition(sample.earth_azimuth_deg, sample.earth_elevation_deg, sample.earth_horizon_deg)
  const sunRadius = Math.max(sample.sun_angular_radius_deg * degPx, 3.5)

  const summary = [
    sun
      ? `Sun centre at azimuth ${formatAngle(sun.az)}, ${clearanceText(sample.sun_clearance_deg)} the terrain horizon`
      : 'Sun direction undefined',
    earth
      ? `Earth centre at azimuth ${formatAngle(earth.az)}, ${clearanceText(sample.earth_clearance_deg)} the terrain horizon`
      : 'Earth direction undefined',
  ].join('; ')

  return (
    <>
      <div className="sky-status" aria-live="polite">
        <p className={sunlit ? 'sky-status-pill on sun' : 'sky-status-pill sun'}>
          <span className="sky-key sky-key-sun" aria-hidden="true" />
          Sun {sun ? clearanceText(sample.sun_clearance_deg) : 'undefined'}
          {sunlit ? ` · ≥ ${formatPercent(threshold, 0)} disc` : ` · below ${formatPercent(threshold, 0)} disc`}
        </p>
        <p className={earthVisible ? 'sky-status-pill on earth' : 'sky-status-pill earth'}>
          <span className="sky-key sky-key-earth" aria-hidden="true" />
          Earth {earth ? clearanceText(sample.earth_clearance_deg) : 'undefined'}
          {earthVisible ? ' · in line of sight' : ' · no line of sight'}
        </p>
      </div>

      <svg className="sky-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${horizonName}. ${summary}.`}>
        <defs>
          <linearGradient id="sky-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1020" />
            <stop offset="1" stopColor="#141b2c" />
          </linearGradient>
        </defs>
        <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="url(#sky-gradient)" />

        {frame.ticks.map((el) => (
          <g key={el}>
            <line className={el === 0 ? 'sky-zero' : 'sky-grid'} x1={PAD.left} x2={W - PAD.right} y1={y(el)} y2={y(el)} />
            <text className="sky-tick" x={PAD.left - 4} y={y(el)} textAnchor="end" dominantBaseline="middle">
              {el > 0 ? `+${el}°` : `${el}°`}
            </text>
          </g>
        ))}
        {compass.map((item) => (
          <g key={item.az}>
            <line className="sky-grid" x1={x(item.az)} x2={x(item.az)} y1={PAD.top} y2={H - PAD.bottom} />
            <text className="sky-tick" x={x(item.az)} y={H - 6} textAnchor="middle">
              {item.label}
            </text>
          </g>
        ))}

        <path className="sky-path sky-path-sun" d={frame.sunPath} />
        <path className="sky-path sky-path-earth" d={frame.earthPath} />

        <path className="sky-terrain" d={frame.silhouette} />

        {earth && (
          <g>
            <line
              className={`sky-clearance ${earthVisible ? 'sky-clear-earth' : 'sky-blocked'}`}
              x1={x(earth.az)}
              x2={x(earth.az)}
              y1={y(earth.horizon)}
              y2={y(earth.el)}
            />
            <circle
              className={earthVisible ? 'sky-earth' : 'sky-earth sky-hidden'}
              cx={x(earth.az)}
              cy={y(earth.el)}
              r={4.5}
            />
            <MarkerLabel x={x(earth.az)} y={y(earth.el)} offset={8} className="sky-label-earth">
              Earth
            </MarkerLabel>
          </g>
        )}
        {sun && (
          <g>
            <line
              className={`sky-clearance ${sunlit ? 'sky-clear-sun' : 'sky-blocked'}`}
              x1={x(sun.az)}
              x2={x(sun.az)}
              y1={y(sun.horizon)}
              y2={y(sun.el)}
            />
            <circle className="sky-sun-glow" cx={x(sun.az)} cy={y(sun.el)} r={sunRadius + 5} />
            <circle
              className={sunlit ? 'sky-sun' : 'sky-sun sky-hidden'}
              cx={x(sun.az)}
              cy={y(sun.el)}
              r={sunRadius}
            />
            <MarkerLabel x={x(sun.az)} y={y(sun.el)} offset={sunRadius + 6} className="sky-label-sun">
              Sun
            </MarkerLabel>
          </g>
        )}
        <rect className="sky-frame" x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
      </svg>

      <ul className="sky-legend">
        <li>
          <span className="sky-key sky-key-terrain" aria-hidden="true" /> Terrain horizon
        </li>
        <li>
          <span className="sky-key sky-key-path" aria-hidden="true" /> Paths over the period
        </li>
        <li>
          <span className="sky-key sky-key-hollow" aria-hidden="true" /> Hollow = blocked / below threshold
        </li>
      </ul>
      <p className="sky-caption">
        Full 360° panorama from the observer: azimuth clockwise from north; the grey silhouette is the highest
        terrain in each direction ({horizonName}). Visibility requires standing above that silhouette — not merely
        above 0°. Elevation is stretched ~{Math.round(frame.stretch)}× so few-degree clearances are readable.
      </p>
    </>
  )
}

function MarkerLabel({
  x,
  y,
  offset,
  className,
  children,
}: {
  x: number
  y: number
  offset: number
  className: string
  children: string
}) {
  const flip = x > W - PAD.right - 40
  return (
    <text
      className={`sky-label ${className}`}
      x={flip ? x - offset : x + offset}
      y={y}
      textAnchor={flip ? 'end' : 'start'}
      dominantBaseline="middle"
    >
      {children}
    </text>
  )
}

function bodyPosition(az: number | null, el: number | null, horizon: number | null) {
  if (az === null || el === null || horizon === null) return null
  return { az: ((az % 360) + 360) % 360, el, horizon }
}

function clearanceText(clearance: number | null) {
  if (clearance === null) return 'at an undefined height relative to'
  const abs = Math.abs(clearance).toFixed(2)
  return clearance > 0 ? `${abs}° above` : clearance < 0 ? `${abs}° below` : 'exactly on'
}

function buildFrame(horizon: HorizonProfile, scenario: TerrainScenario): Frame {
  const bins = new Array<number>(SILHOUETTE_BINS).fill(-Infinity)
  let horizonMin = Infinity
  let horizonMax = -Infinity
  for (let i = 0; i < horizon.n_az; i++) {
    if (horizon.valid && horizon.valid[i] === false) continue
    const value = horizon.horizon_deg[i]
    const az = ((horizon.az_deg[i] % 360) + 360) % 360
    const bin = Math.min(SILHOUETTE_BINS - 1, Math.floor((az / 360) * SILHOUETTE_BINS))
    if (value > bins[bin]) bins[bin] = value
    if (value < horizonMin) horizonMin = value
    if (value > horizonMax) horizonMax = value
  }

  let bodyMin = Infinity
  let bodyMax = -Infinity
  for (const s of scenario.series) {
    for (const el of [s.sun_elevation_deg, s.earth_elevation_deg]) {
      if (el === null) continue
      if (el < bodyMin) bodyMin = el
      if (el > bodyMax) bodyMax = el
    }
  }

  const yMin = Math.floor(Math.min(horizonMin, bodyMin, -1) - 0.5)
  const yMax = Math.ceil(Math.max(horizonMax, bodyMax, 1) + 0.5)
  const x = (az: number) => PAD.left + (az / 360) * PLOT_W
  const y = (el: number) => PAD.top + ((yMax - el) / (yMax - yMin)) * PLOT_H
  const f = (value: number) => value.toFixed(1)

  const filled = fillGaps(bins)
  const step = 360 / SILHOUETTE_BINS
  let silhouette = `M${f(x(0))} ${f(y(yMin))} L${f(x(0))} ${f(y(filled[0]))}`
  for (let b = 0; b < SILHOUETTE_BINS; b++) {
    silhouette += ` L${f(x((b + 0.5) * step))} ${f(y(filled[b]))}`
  }
  silhouette += ` L${f(x(360))} ${f(y(filled[0]))} L${f(x(360))} ${f(y(yMin))} Z`

  const stride = Math.max(1, Math.ceil(scenario.series.length / MAX_PATH_POINTS))
  const trajectory = (pick: (s: VisibilitySample) => [number | null, number | null]) => {
    let d = ''
    let previousAz: number | null = null
    for (let i = 0; i < scenario.series.length; i += stride) {
      const [rawAz, el] = pick(scenario.series[i])
      if (rawAz === null || el === null) {
        previousAz = null
        continue
      }
      const az = ((rawAz % 360) + 360) % 360
      const jump = previousAz === null || Math.abs(az - previousAz) > 180
      d += `${jump ? 'M' : 'L'}${f(x(az))} ${f(y(el))} `
      previousAz = az
    }
    return d.trim()
  }

  const range = yMax - yMin
  const tickStep = range > 16 ? 4 : range > 8 ? 2 : 1
  const ticks: number[] = []
  for (let el = Math.ceil(yMin / tickStep) * tickStep; el <= yMax; el += tickStep) ticks.push(el)

  return {
    yMin,
    yMax,
    silhouette,
    sunPath: trajectory((s) => [s.sun_azimuth_deg, s.sun_elevation_deg]),
    earthPath: trajectory((s) => [s.earth_azimuth_deg, s.earth_elevation_deg]),
    ticks,
    stretch: PLOT_H / range / (PLOT_W / 360),
  }
}

/** Bins with no valid direction take the nearest valid neighbour so the silhouette stays closed. */
function fillGaps(bins: number[]) {
  const out = bins.slice()
  const n = out.length
  const firstValid = out.findIndex((value) => Number.isFinite(value))
  if (firstValid < 0) return out
  for (let k = 1; k <= n; k++) {
    const i = (firstValid + k) % n
    if (!Number.isFinite(out[i])) out[i] = out[(i - 1 + n) % n]
  }
  return out
}

function useHorizon(site: Site) {
  const url = site.horizon_url
  const [horizon, setHorizon] = useState<HorizonProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    loadHorizon(url)
      .then((loaded) => {
        if (cancelled) return
        if (loaded.site_id !== site.site_id) {
          setError(`The horizon file is for ${loaded.site_id}, not ${site.site_id}`)
          return
        }
        setHorizon(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageFrom(caught, `Could not load the ${site.name} horizon profile`))
      })
    return () => {
      cancelled = true
    }
  }, [url, site.site_id, site.name, attempt])

  const retry = () => {
    setError(null)
    setAttempt((count) => count + 1)
  }

  return {
    horizon,
    error: url ? error : `No horizon profile is listed for ${site.name}.`,
    retry,
  }
}
