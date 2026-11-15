import { useMemo } from 'react'
import type { HorizonProfile, SiteId } from '../types/science'
import {
  convergenceTargetDeg,
  horizonConvergence,
  horizonUncertainty,
  nasaComparison,
  site04OriginalProfile,
  terrainCoverage,
} from './evidence'

const siteOrder: SiteId[] = ['site01', 'site04', 'site07', 'site11']
const pct = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`
const deg = (value: number, digits = 4) => `${value.toFixed(digits)}°`

export type SiteLabel = (id: SiteId) => { short: string; place: string | null }

/* ---------- Horizon geometry (illustration) ---------- */

export function HorizonGeometry() {
  return (
    <figure className="m-figure">
      <svg viewBox="0 56 560 164" className="m-geo" role="img" aria-labelledby="m-geo-title m-geo-desc">
        <title id="m-geo-title">How a horizon elevation is measured</title>
        <desc id="m-geo-desc">
          An observer one metre above the curved lunar surface looks along a great circle. The highest terrain
          point along that ray sets the horizon elevation angle beta, measured from the local horizontal.
        </desc>
        <defs>
          <linearGradient id="m-geo-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d212b" />
            <stop offset="1" stopColor="#07080b" />
          </linearGradient>
        </defs>
        {/* curved surface with a distant ridge */}
        <path
          d="M0 168 Q 280 140 560 168 L560 220 L0 220 Z"
          fill="url(#m-geo-ground)"
        />
        <path
          d="M0 168 Q 140 152 250 149 Q 330 147 372 146 L404 108 L420 118 L438 96 L470 150 Q 520 158 560 168"
          fill="#151820"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />
        {/* local horizontal */}
        <line x1="70" y1="141" x2="540" y2="141" className="m-geo-guide" />
        <text x="540" y="134" className="m-geo-note" textAnchor="end">local horizontal</text>
        {/* ray to the highest point */}
        <line x1="70" y1="141" x2="438" y2="96" className="m-geo-ray" />
        <circle cx="438" cy="96" r="3.5" className="m-geo-hit" />
        <text x="438" y="70" className="m-geo-label" textAnchor="middle">highest point on the ray</text>
        <text x="438" y="84" className="m-geo-note" textAnchor="middle">sets the horizon in this direction</text>
        {/* angle */}
        <path d="M180 141 A 110 110 0 0 0 179.2 127.6" className="m-geo-angle" />
        <text x="186" y="139.5" className="m-geo-beta">β</text>
        {/* observer mast */}
        <line x1="70" y1="156" x2="70" y2="141" className="m-geo-mast" />
        <circle cx="70" cy="141" r="4" className="m-geo-observer" />
        <text x="62" y="128" className="m-geo-label" textAnchor="middle">observer</text>
        <text x="80" y="164" className="m-geo-note">1 m</text>
        <text x="20" y="206" className="m-geo-formula">β = atan2(r·cos ψ − r₀, r·sin ψ)</text>
      </svg>
      <figcaption>
        Not to scale. For each direction the ray follows the Moon’s curvature; <i>r</i> is the radius of a terrain
        point, <i>r₀</i> the observer’s radius and <i>ψ</i> the angle between them at the Moon’s centre.
      </figcaption>
    </figure>
  )
}

/* ---------- Solar disc threshold (illustration) ---------- */

export function DiscThreshold({ threshold }: { threshold: number }) {
  const dots = useMemo(() => {
    const points: { x: number; y: number; lit: boolean }[] = []
    const r = 46
    const horizonY = 44 // terrain line crosses the lower part of the disc
    for (let i = 0; i < 180; i++) {
      // golden-angle spiral: an even spread of samples over the disc
      const radius = r * Math.sqrt((i + 0.5) / 180)
      const angle = i * 2.399963
      const x = 60 + radius * Math.cos(angle)
      const y = 60 + radius * Math.sin(angle)
      points.push({ x, y, lit: y < 60 + horizonY - 12 - (x - 60) * 0.18 })
    }
    return points
  }, [])
  const lit = dots.filter((dot) => dot.lit).length / dots.length
  return (
    <figure className="m-figure m-figure-small">
      <svg viewBox="0 0 120 120" className="m-disc" role="img" aria-labelledby="m-disc-title">
        <title id="m-disc-title">
          Solar disc sampled with points; the share of points above the terrain decides whether it counts as sunlight
        </title>
        <circle cx="60" cy="60" r="49" className="m-disc-rim" />
        {dots.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r="1.6" className={dot.lit ? 'm-disc-lit' : 'm-disc-hidden'} />
        ))}
        <path d="M0 101 L120 79.4 L120 120 L0 120 Z" className="m-disc-terrain" />
      </svg>
      <figcaption>
        Illustration: {pct(lit, 0)} of these sample points clear the terrain. The model uses the scenario’s full
        sample set and counts a moment as sunlight when at least {pct(threshold, 0)} of the disc is visible.
      </figcaption>
    </figure>
  )
}

/* ---------- Convergence ---------- */

export function ConvergenceChart({ label }: { label: SiteLabel }) {
  const max = 0.012
  const x = (value: number) => `${Math.min(100, (value / max) * 100)}%`
  return (
    <figure className="m-figure">
      <div className="m-conv" role="table" aria-label="Largest horizon change when sampling is refined, per site">
        <div className="m-conv-axis" role="row" aria-hidden="true">
          <span />
          <div className="m-conv-scale">
            {[0, 0.004, 0.008, 0.012].map((tick) => (
              <span key={tick} style={{ left: x(tick) }}>
                {tick === 0 ? '0' : tick.toFixed(3)}°
              </span>
            ))}
          </div>
        </div>
        {siteOrder.map((id) => {
          const row = horizonConvergence[id]
          return (
            <div className="m-conv-row" role="row" key={id}>
              <span className="m-conv-site" role="rowheader">
                {label(id).short}
              </span>
              <div className="m-conv-plot" role="cell">
                <span className="m-conv-target" style={{ left: x(convergenceTargetDeg) }} aria-hidden="true" />
                <span className="m-conv-bar m-conv-az" style={{ width: x(row.azimuthMaxDeg) }}>
                  <span className="sr-only">Azimuth spacing halved: </span>
                  <b>{deg(row.azimuthMaxDeg)}</b>
                </span>
                <span className="m-conv-bar m-conv-dist" style={{ width: x(row.distanceMaxDeg) }}>
                  <span className="sr-only">Distance steps halved: </span>
                  <b>{deg(row.distanceMaxDeg)}</b>
                </span>
                {id === 'site04' && (
                  <span
                    className="m-conv-old"
                    style={{ left: x(site04OriginalProfile.maxDeg) }}
                    title="Superseded first Site04 profile"
                  >
                    <b aria-hidden="true">{site04OriginalProfile.maxDeg}°</b>
                    <span className="sr-only">
                      Superseded first profile: {site04OriginalProfile.exceededAzimuths} of{' '}
                      {site04OriginalProfile.ofAzimuths.toLocaleString('en-US')} directions at{' '}
                      {deg(site04OriginalProfile.maxDeg)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <figcaption className="m-legend">
        <span>
          <i className="m-key m-key-az" /> azimuth spacing halved
        </span>
        <span>
          <i className="m-key m-key-dist" /> distance steps halved
        </span>
        <span>
          <i className="m-key m-key-target" /> {convergenceTargetDeg}° target
        </span>
        <span>
          <i className="m-key m-key-old" /> superseded first Site04 profile
        </span>
      </figcaption>
    </figure>
  )
}

/* ---------- Horizon uncertainty ---------- */

export function UncertaintyChart({ label }: { label: SiteLabel }) {
  const max = 0.5
  const x = (value: number) => `${Math.min(100, (value / max) * 100)}%`
  return (
    <figure className="m-figure">
      <div className="m-unc" role="table" aria-label="Horizon uncertainty from terrain height error, per site">
        <div className="m-unc-axis" role="row" aria-hidden="true">
          <span />
          <div className="m-unc-scale">
            {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((tick) => (
              <span key={tick} style={{ left: x(tick) }}>
                {tick === 0 ? '0' : tick.toFixed(1)}°
              </span>
            ))}
          </div>
          <span />
        </div>
        {siteOrder.map((id) => {
          const row = horizonUncertainty[id]
          return (
            <div className="m-unc-row" role="row" key={id}>
              <span className="m-conv-site" role="rowheader">
                {label(id).short}
              </span>
              <div className="m-unc-plot" role="cell">
                <span className="m-unc-target" style={{ left: x(convergenceTargetDeg) }} aria-hidden="true" />
                <span className="m-unc-whisker" style={{ left: x(row.sigmaFarMedianDeg), width: `calc(${x(row.sigmaFarP95Deg)} - ${x(row.sigmaFarMedianDeg)})` }} aria-hidden="true" />
                <span className="m-unc-bar" style={{ width: x(row.sigmaFarMedianDeg) }} aria-hidden="true" />
                <span className="sr-only">
                  Median {deg(row.sigmaFarMedianDeg, 2)}, 95th percentile {deg(row.sigmaFarP95Deg, 2)}, covering{' '}
                  {pct(row.farSubsetShare)} of directions.
                </span>
              </div>
              <span className="m-unc-value" role="cell" aria-hidden="true">
                <b>{deg(row.sigmaFarMedianDeg, 2)}</b>
                <small>{pct(row.farSubsetShare, 0)} of directions</small>
              </span>
            </div>
          )
        })}
      </div>
      <figcaption className="m-legend">
        <span>
          <i className="m-key m-key-unc" /> median σ, blockers ≥100 m inside the 5 m tile
        </span>
        <span>
          <i className="m-key m-key-whisker" /> to the 95th percentile
        </span>
        <span>
          <i className="m-key m-key-target" /> {convergenceTargetDeg}° sampling target, for scale
        </span>
      </figcaption>
    </figure>
  )
}

/* ---------- Terrain coverage ---------- */

export function CoverageBars({ label, focus, onFocus }: { label: SiteLabel; focus: SiteId; onFocus: (id: SiteId) => void }) {
  return (
    <div className="m-cov" role="group" aria-label="Where each site's horizon comes from">
      {siteOrder.map((id) => {
        const row = terrainCoverage[id]
        const near = row.nearCount / row.directions
        const tile = (row.tileCount - row.nearCount) / row.directions
        const mosaic = 1 - row.tileCount / row.directions
        const names = label(id)
        return (
          <button
            type="button"
            key={id}
            className="m-cov-row"
            aria-pressed={focus === id}
            onClick={() => onFocus(id)}
            aria-label={`${names.short}${names.place ? `, ${names.place}` : ''}: ${pct(near)} of directions blocked within 100 m, ${pct(tile)} elsewhere in the 5 m tile, ${pct(mosaic)} by the 80 m and 240 m mosaics. Show its horizon.`}
          >
            <span className="m-cov-name">
              <b>{names.short}</b>
              {names.place && <small>{names.place}</small>}
            </span>
            <span className="m-cov-bar" aria-hidden="true">
              <span className="m-cov-near" style={{ width: pct(near, 2) }} />
              <span className="m-cov-tile" style={{ width: pct(tile, 2) }} />
              <span className="m-cov-mosaic" style={{ width: pct(mosaic, 2) }} />
            </span>
            <span className="m-cov-num" aria-hidden="true">
              {pct(row.tileCount / row.directions, 0)}
              <small>in 5 m tile</small>
            </span>
          </button>
        )
      })}
      <div className="m-legend">
        <span>
          <i className="m-key m-key-near" /> 5 m tile, blocker within 100 m
        </span>
        <span>
          <i className="m-key m-key-tile" /> 5 m tile, 100 m and beyond
        </span>
        <span>
          <i className="m-key m-key-mosaic" /> 80 m / 240 m mosaics
        </span>
      </div>
    </div>
  )
}

const shadeFor = (distanceM: number) => {
  // log scale from 10 m (light) to 200 km (dark)
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(distanceM, 10)) - 1) / (Math.log10(200000) - 1)))
  const v = Math.round(214 - t * 170)
  return `rgb(${v}, ${v + 4}, ${v + 12})`
}

/** Horizon elevation around the full circle, with the distance to the blocking terrain underneath. */
export function HorizonSourceStrip({ horizon }: { horizon: HorizonProfile }) {
  const shape = useMemo(() => {
    const n = horizon.n_az
    const distance = horizon.blocking_arc_distance_m
    if (!distance || distance.length !== n) return null
    const bins = 360
    const per = n / bins
    const line: number[] = []
    const shades: string[] = []
    let lo = Infinity
    let hi = -Infinity
    for (let b = 0; b < bins; b++) {
      let top = -Infinity
      let at = -1
      for (let i = Math.floor(b * per); i < Math.floor((b + 1) * per); i++) {
        const h = horizon.horizon_deg[i]
        if (horizon.valid?.[i] !== false && Number.isFinite(h) && h > top) {
          top = h
          at = i
        }
      }
      if (at < 0) return null
      line.push(top)
      shades.push(shadeFor(distance[at]))
      lo = Math.min(lo, top)
      hi = Math.max(hi, top)
    }
    return { line, shades, lo: Math.floor(lo), hi: Math.ceil(hi) }
  }, [horizon])

  if (!shape) return null
  const W = 720
  const H = 120
  const y = (v: number) => 8 + ((shape.hi - v) / (shape.hi - shape.lo || 1)) * (H - 16)
  const path = shape.line.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i + 0.5) * 2} ${y(v).toFixed(1)}`).join(' ')
  const zeroY = y(0)
  return (
    <figure className="m-figure m-strip">
      <div className="m-strip-plot">
        <span className="m-strip-y m-strip-y-top" aria-hidden="true">{shape.hi}°</span>
        <span className="m-strip-y m-strip-y-bot" aria-hidden="true">{shape.lo}°</span>
        <svg
          viewBox={`0 0 ${W} ${H + 16}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Horizon elevation around the full circle, from ${shape.lo}° to ${shape.hi}°, shaded underneath by the distance to the terrain that sets it`}
        >
          {shape.lo < 0 && shape.hi > 0 && (
            <line x1="0" x2={W} y1={zeroY} y2={zeroY} className="m-strip-zero" vectorEffect="non-scaling-stroke" />
          )}
          <path d={`${path} L${W} ${H} L0 ${H} Z`} className="m-strip-fill" />
          <path d={path} className="m-strip-line" vectorEffect="non-scaling-stroke" />
          {shape.shades.map((fill, i) => (
            <rect key={i} x={i * 2} y={H + 5} width="2.05" height="11" fill={fill} />
          ))}
        </svg>
      </div>
      <div className="m-strip-x" aria-hidden="true">
        <span>N 0°</span>
        <span>E 90°</span>
        <span>S 180°</span>
        <span>W 270°</span>
        <span>360°</span>
      </div>
      <figcaption className="m-strip-caption">
        <span>
          Highest horizon in each 1° of azimuth, from the deployed profile. Below 0°, the view looks down at nearby
          ground.
        </span>
        <span className="m-ramp" aria-hidden="true">
          <small>blocker 10 m</small>
          <i />
          <small>200 km</small>
        </span>
      </figcaption>
    </figure>
  )
}

/* ---------- NASA illumination map ---------- */

export function NasaComparisonChart({ label }: { label: SiteLabel }) {
  const lo = 0.6
  const hi = 0.95
  const x = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`
  return (
    <figure className="m-figure">
      <div className="m-nasa" role="table" aria-label="Long-term sunlight: this project versus NASA's illumination map">
        <div className="m-nasa-axis" role="row" aria-hidden="true">
          <span />
          <div className="m-nasa-scale">
            {[0.6, 0.7, 0.8, 0.9].map((tick) => (
              <span key={tick} style={{ left: x(tick) }}>
                {Math.round(tick * 100)}%
              </span>
            ))}
          </div>
          <span />
        </div>
        {siteOrder.map((id) => {
          const row = nasaComparison[id]
          // From the rounded values shown, so the label matches what is displayed.
          const gap = Math.round(row.anyPart186yr * 1000) / 10 - Math.round(row.nasaPixel * 1000) / 10
          const a = Math.min(row.nasaPixel, row.anyPart186yr)
          const b = Math.max(row.nasaPixel, row.anyPart186yr)
          return (
            <div className="m-nasa-row" role="row" key={id}>
              <span className="m-conv-site" role="rowheader">
                {label(id).short}
              </span>
              <div className="m-nasa-plot" role="cell">
                <span className="m-nasa-span" style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})` }} aria-hidden="true" />
                <span className="m-nasa-dot m-nasa-mean" style={{ left: x(row.meanDisc186yr) }} title={`Mean visible disc fraction ${pct(row.meanDisc186yr)}`} />
                <span className="m-nasa-dot m-nasa-ours" style={{ left: x(row.anyPart186yr) }} title={`This project, any part of the disc ${pct(row.anyPart186yr)}`} />
                <span className="m-nasa-dot m-nasa-map" style={{ left: x(row.nasaPixel) }} title={`NASA map pixel ${pct(row.nasaPixel)}`} />
                <span className="sr-only">
                  This project {pct(row.anyPart186yr)} (any part of the disc, 18.6 years), mean disc fraction{' '}
                  {pct(row.meanDisc186yr)}; NASA map pixel {pct(row.nasaPixel)}, bilinear {pct(row.nasaBilinear)}.
                </span>
              </div>
              <span className="m-nasa-gap" role="cell" aria-hidden="true">
                {gap >= 0 ? '+' : '−'}
                {Math.abs(gap).toFixed(1)} pts
              </span>
            </div>
          )
        })}
      </div>
      <figcaption className="m-legend">
        <span>
          <i className="m-key m-key-ours" /> this project: any part of the disc, 18.6 years
        </span>
        <span>
          <i className="m-key m-key-mean" /> this project: mean visible disc fraction
        </span>
        <span>
          <i className="m-key m-key-map" /> NASA map pixel
        </span>
      </figcaption>
    </figure>
  )
}
