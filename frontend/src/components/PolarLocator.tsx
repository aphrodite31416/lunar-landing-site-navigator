import { useEffect, useState } from 'react'
import { loadTerrainMeta, terrainAssetUrl } from '../terrain/loadTerrain'
import type { TerrainMeta } from '../terrain/types'
import type { Site, SiteId } from '../types/science'

/** Reference sphere of the LOLA polar stereographic grids the terrain tiles use. */
const moonRadiusM = 1737400
const size = 240
const c = size / 2
/** The map frame sits at 88.25° S, just outside the farthest tile corner. */
const frameColatDeg = 1.75

/** South polar stereographic: metres from the pole, 0° longitude up, east to the right. */
function stereo(latitudeDeg: number, longitudeDeg: number) {
  const colat = ((90 + latitudeDeg) * Math.PI) / 180
  const rho = 2 * moonRadiusM * Math.tan(colat / 2)
  const lon = (longitudeDeg * Math.PI) / 180
  return { x: rho * Math.sin(lon), y: rho * Math.cos(lon) }
}

const rhoAt = (colatDeg: number) => 2 * moonRadiusM * Math.tan(((colatDeg * Math.PI) / 180) / 2)
const k = (c - 24) / rhoAt(frameColatDeg)
const X = (x: number) => c + x * k
const Y = (y: number) => c - y * k

type Tile = { id: SiteId; meta: TerrainMeta }

/**
 * Where the four sites are around the lunar south pole, drawn in the same
 * polar stereographic grid as the terrain files. Each site's 16 km terrain
 * tile is placed at its true position and size from the terrain metadata;
 * the relief shading inside the tiles is synthetic light, as in the 3D view.
 */
export function PolarLocator({
  sites,
  selectedId,
  onSelect,
}: {
  sites: Site[]
  selectedId: SiteId
  onSelect: (siteId: SiteId) => void
}) {
  const [tiles, setTiles] = useState<Tile[]>([])
  const [showImages, setShowImages] = useState(false)
  const key = sites.map((site) => site.site_id).join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const ids = key.split(',') as SiteId[]
    Promise.all(ids.map((id) => loadTerrainMeta(id).then((meta) => ({ id, meta })).catch(() => null))).then((list) => {
      if (cancelled) return
      setTiles(list.filter((tile): tile is Tile => tile !== null))
    })
    return () => {
      cancelled = true
    }
  }, [key])

  // The tile images are decorative context; fetch them after the main
  // terrain has had a head start.
  useEffect(() => {
    if (tiles.length === 0) return
    const timer = window.setTimeout(() => setShowImages(true), 1500)
    return () => window.clearTimeout(timer)
  }, [tiles.length])

  const frame = rhoAt(frameColatDeg) * k
  const rings = [0.5, 1, 1.5]
  const meridians = Array.from({ length: 12 }, (_, i) => i * 30)
  const ringLabelAngle = (45 * Math.PI) / 180
  const scaleKm = 10
  const ordered = [...tiles].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))

  return (
    <figure className="polar">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Map of the lunar south pole with the four candidate sites and their 16 km terrain tiles, in polar stereographic projection"
      >
        <defs>
          <clipPath id="polar-clip">
            <circle cx={c} cy={c} r={frame} />
          </clipPath>
        </defs>
        <circle className="polar-disc" cx={c} cy={c} r={frame} />

        <g clipPath="url(#polar-clip)">
          {meridians.map((deg) => {
            const a = (deg * Math.PI) / 180
            return (
              <line
                key={deg}
                className={deg % 90 === 0 ? 'polar-meridian polar-meridian-major' : 'polar-meridian'}
                x1={c}
                y1={c}
                x2={c + frame * Math.sin(a)}
                y2={c - frame * Math.cos(a)}
              />
            )
          })}
          {rings.map((colat) => (
            <circle key={colat} className="polar-ring" cx={c} cy={c} r={rhoAt(colat) * k} />
          ))}

          {ordered.map(({ id, meta }) => {
            const [x0, x1] = meta.x_range_m
            const [y0, y1] = meta.y_range_m
            const selected = id === selectedId
            const box = { x: X(x0), y: Y(y1), w: (x1 - x0) * k, h: (y1 - y0) * k }
            return (
              <g key={id} className={selected ? 'polar-tile polar-tile-on' : 'polar-tile'} onClick={() => onSelect(id)}>
                {showImages && (
                  <image
                    href={terrainAssetUrl(meta.hillshade_png)}
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    preserveAspectRatio="none"
                  />
                )}
                <rect x={box.x} y={box.y} width={box.w} height={box.h} />
              </g>
            )
          })}
        </g>

        <circle className="polar-frame" cx={c} cy={c} r={frame} />
        {rings.map((colat) => {
          const r = rhoAt(colat) * k
          return (
            <text
              key={colat}
              className="polar-ring-label"
              x={c + r * Math.sin(ringLabelAngle) + 2}
              y={c - r * Math.cos(ringLabelAngle) - 2}
            >
              {90 - colat}°S
            </text>
          )
        })}

        <text className="polar-label polar-label-earth" x={c} y={9} textAnchor="middle">
          0° longitude
        </text>
        <text className="polar-label" x={size - 1} y={c + 3} textAnchor="end">
          90°E
        </text>
        <text className="polar-label" x={c} y={size - 2} textAnchor="middle">
          180°
        </text>
        <text className="polar-label" x={1} y={c + 3}>
          90°W
        </text>

        <path className="polar-pole" d={`M${c - 4} ${c}h8M${c} ${c - 4}v8`} />

        {sites.map((site) => {
          const p = stereo(site.latitude_deg, site.longitude_deg)
          const x = X(p.x)
          const y = Y(p.y)
          const selected = site.site_id === selectedId
          const label = labelPosition(site, sites)
          return (
            <g
              key={site.site_id}
              className={selected ? 'polar-site polar-site-on' : 'polar-site'}
              onClick={() => onSelect(site.site_id)}
            >
              <circle cx={x} cy={y} r="9" className="polar-hit" />
              {selected ? (
                <>
                  <circle cx={x} cy={y} r="4.5" className="polar-ring-on" />
                  <path className="polar-cross" d={`M${x - 9} ${y}h4.5M${x + 4.5} ${y}h4.5M${x} ${y - 9}v4.5M${x} ${y + 4.5}v4.5`} />
                </>
              ) : (
                <circle cx={x} cy={y} r="2.4" className="polar-dot" />
              )}
              <text x={label.x} y={label.y} textAnchor={label.anchor} className="polar-site-label">
                {site.site_id.slice(4)}
              </text>
            </g>
          )
        })}

        <g className="polar-scale" aria-hidden="true">
          <path d={`M4 ${size - 14}v-4M4 ${size - 16}h${scaleKm * 1000 * k}M${4 + scaleKm * 1000 * k} ${size - 14}v-4`} />
          <text x={4} y={size - 4}>
            {scaleKm} km
          </text>
        </g>
      </svg>
      <figcaption>Polar stereographic · 16 km terrain tiles · synthetic shading</figcaption>
    </figure>
  )
}

/**
 * Number labels sit beside each marker on the side away from the pole. When
 * another site lies close on that side (Site01 and Site04 are 8 km apart),
 * the label of the site nearer the pole flips to the other side.
 */
function labelPosition(site: Site, sites: Site[]) {
  const here = stereo(site.latitude_deg, site.longitude_deg)
  const x = X(here.x)
  const y = Y(here.y)
  let side = x >= c ? 1 : -1
  const rho = Math.hypot(here.x, here.y)
  for (const other of sites) {
    if (other.site_id === site.site_id) continue
    const there = stereo(other.latitude_deg, other.longitude_deg)
    const ox = X(there.x)
    const oy = Y(there.y)
    const near = Math.hypot(ox - x, oy - y) < 34 && Math.sign(ox - x) === side
    if (near && Math.hypot(there.x, there.y) > rho) side = -side
  }
  return { x: x + side * 8, y: y + 3, anchor: side > 0 ? ('start' as const) : ('end' as const) }
}
