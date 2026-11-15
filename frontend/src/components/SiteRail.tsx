import { useEffect, useRef, useState } from 'react'
import { formatLatLon, formatPercent } from '../science/format'
import { PolarLocator } from './PolarLocator'
import type { LiveStatus } from '../science/liveStatus'
import { liveLabel, type Shares } from '../sites/siteDirectory'
import type { Site, SiteId } from '../types/science'

export function SiteRail({
  sites,
  selectedId,
  onSelect,
  names,
  shares,
  live,
  error,
}: {
  sites: Site[]
  selectedId: SiteId
  onSelect: (siteId: SiteId) => void
  names: Partial<Record<SiteId, string>>
  shares: Partial<Record<SiteId, Shares>>
  live: LiveStatus | null
  error: string | null
}) {
  const navRef = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  // When the list scrolls sideways (tablet and phone), fade the clipped edges
  // and show an arrow, so it is clear that more sites are off screen.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const update = () => {
      const max = nav.scrollWidth - nav.clientWidth
      const left = max > 1 && nav.scrollLeft > 1
      const right = max > 1 && nav.scrollLeft < max - 1
      setEdges((previous) => (previous.left === left && previous.right === right ? previous : { left, right }))
    }
    update()
    nav.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(nav)
    const list = nav.querySelector('.site-list')
    if (list) observer?.observe(list)
    return () => {
      nav.removeEventListener('scroll', update)
      observer?.disconnect()
    }
    // Place names arrive after the sites and widen the rows.
  }, [sites.length, names])

  // Keep the selected site in view when it changes (keys 1-9, Compare, Explore).
  useEffect(() => {
    const nav = navRef.current
    if (!nav || nav.scrollWidth <= nav.clientWidth) return
    const row = nav.querySelector<HTMLElement>('.site-row[aria-checked="true"]')
    if (!row) return
    const navBox = nav.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    const pad = 28
    if (rowBox.left < navBox.left + pad) nav.scrollBy({ left: rowBox.left - navBox.left - pad, behavior: 'smooth' })
    else if (rowBox.right > navBox.right - pad) nav.scrollBy({ left: rowBox.right - navBox.right + pad, behavior: 'smooth' })
  }, [selectedId])

  const page = (direction: 1 | -1) => navRef.current?.scrollBy({ left: direction * navRef.current.clientWidth * 0.7, behavior: 'smooth' })

  return (
    <nav
      ref={navRef}
      className="atlas-sites"
      aria-label="Landing sites"
      data-more-left={edges.left || undefined}
      data-more-right={edges.right || undefined}
    >
      <PolarLocator sites={sites} selectedId={selectedId} onSelect={onSelect} />
      <p className="eyebrow sites-eyebrow">
        Candidate sites <span>{sites.length}</span>
      </p>
      {error && <p className="rail-message rail-message-error">{error}</p>}
      <div className="site-list" role="radiogroup" aria-label="Select a landing site">
        {sites.map((site, index) => {
          const selected = site.site_id === selectedId
          const share = shares[site.site_id]
          return (
            <button
              key={site.site_id}
              type="button"
              role="radio"
              aria-checked={selected}
              className="site-row"
              onClick={() => onSelect(site.site_id)}
              title={`${names[site.site_id] ? `${names[site.site_id]} · ` : ''}${site.name}: ${formatLatLon(site.latitude_deg, site.longitude_deg)} (key ${index + 1})`}
            >
              <span className="site-row-num">{site.site_id.slice(4)}</span>
              <span className="site-row-body">
                <span className="site-row-name">{names[site.site_id] ?? site.name}</span>
                <span className="site-row-coords">{compactLatLon(site.latitude_deg, site.longitude_deg)}</span>
                {share && (
                  <span
                    className="site-row-shares"
                    aria-label={`Over the period: sunlight ${formatPercent(share.sun)}, Earth line of sight ${formatPercent(share.earth)}`}
                  >
                    <span className="share-line" title="Share of the period with sunlight (at least the threshold of the disc)">
                      <span className="share share-sun">
                        <i style={{ width: `${share.sun * 100}%` }} />
                      </span>
                      <span className="share-value">{formatPercent(share.sun)}</span>
                    </span>
                    <span className="share-line" title="Share of the period with Earth line of sight">
                      <span className="share share-earth">
                        <i style={{ width: `${share.earth * 100}%` }} />
                      </span>
                      <span className="share-value">{formatPercent(share.earth)}</span>
                    </span>
                  </span>
                )}
              </span>
              {selected && live && (
                <span className="site-row-live" aria-label={liveLabel(live)}>
                  <Dot tone="sun" on={live.sunlight} />
                  <Dot tone="earth" on={live.earth} />
                  <Dot tone="joint" on={live.joint} />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <button type="button" className="sites-more sites-more-left" tabIndex={-1} aria-hidden="true" onClick={() => page(-1)}>
        ‹
      </button>
      <button type="button" className="sites-more sites-more-right" tabIndex={-1} aria-hidden="true" onClick={() => page(1)}>
        ›
      </button>
      <p className="sites-legend">
        <span className="tone-sun">Sunlight</span> and <span className="tone-earth">Earth line of sight</span> as a
        share of the scenario period. Dots on the selected site show its state now.
      </p>
    </nav>
  )
}

export function Dot({ tone, on }: { tone: 'sun' | 'earth' | 'joint'; on: boolean }) {
  return <span className={`dot dot-${tone}${on ? ' dot-on' : ''}`} aria-hidden="true" />
}

/** "89.45°S 137.15°W": the same coordinates as formatLatLon, set for a narrow column. */
function compactLatLon(latitudeDeg: number, longitudeDeg: number) {
  const lat = `${Math.abs(latitudeDeg).toFixed(2)}°${latitudeDeg < 0 ? 'S' : 'N'}`
  const lon = `${Math.abs(longitudeDeg).toFixed(2)}°${longitudeDeg < 0 ? 'W' : 'E'}`
  return `${lat}  ${lon}`
}
