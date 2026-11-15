import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { SRGBColorSpace, DoubleSide, TextureLoader, Vector3, type Texture } from 'three'
import { ConditionsRail } from './ConditionsRail'
import { globeTextureAvailable } from './globeAsset'
import { HorizonView } from './HorizonView'
import { MethodPage } from './MethodPage'
import { SiteComparison } from './SiteComparison'
import { Dot, SiteRail } from './SiteRail'
import { liveLabel, placeName, useSiteDirectory } from '../sites/siteDirectory'
import { TimeDeck } from './TimeDeck'
import { loadSites } from '../sites/loadSites'
import { buildTerrainGeometry, nearestSiteVertex, type TerrainMesh } from '../terrain/buildGeometry'
import { loadHeightData, loadTerrainMeta, terrainAssetUrl } from '../terrain/loadTerrain'
import { clockAt, clockOffsetFor, offsetBounds, sampleIndexAt, utcAtOffset, type Clock } from '../science/clock'
import { formatLatLon, formatUtcDay } from '../science/format'
import { liveStatusAt } from '../science/liveStatus'
import { nextEvent, previousEvent } from '../science/timeline'
import { useScenario } from '../science/useScenario'
import type { Site, SiteId } from '../types/science'
import type { HeightSummary, TerrainMeta } from '../terrain/types'

type Mode = 'explore' | 'compare' | 'globe' | 'method'

const modes: { id: Mode; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'compare', label: 'Compare sites' },
  { id: 'globe', label: 'Moon globe' },
  { id: 'method', label: 'Method & data' },
]

/** The globe and its Three.js scene load only when the Moon globe view opens. */
const MoonGlobe = lazy(() => import('./MoonGlobe'))

const exaggerations = [1, 2, 4, 8] as const

/**
 * The Mission Atlas shell: top bar, site rail, 3D viewport, conditions rail and
 * Time Deck in one grid. It owns the shared state (site, the exact UTC moment,
 * view settings, mode); the terrain loading and the 3D scene are unchanged.
 */
export function TerrainViewer() {
  const [terrain, setTerrain] = useState<TerrainMeta | null>(null)
  const [height, setHeight] = useState<HeightSummary | null>(null)
  const [samples, setSamples] = useState<Uint16Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heightError, setHeightError] = useState<string | null>(null)
  const [mesh, setMesh] = useState<TerrainMesh | null>(null)
  const [hillshade, setHillshade] = useState<Texture | null>(null)
  const [exaggeration, setExaggeration] = useState(1)
  const [sites, setSites] = useState<Site[]>([])
  const [sitesError, setSitesError] = useState<string | null>(null)
  const [selectedSiteId, setSelectedSiteId] = useState<SiteId>('site01')
  const [loadedSiteId, setLoadedSiteId] = useState<SiteId | null>(null)
  const [mode, setMode] = useState<Mode>('explore')
  /** The requested moment, shared by every site. Null means the period start. */
  const [clock, setClock] = useState<Clock | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(6 * 3600)
  const [skyOpen, setSkyOpen] = useState(false)
  // Start closer on wide views so the terrain fills the frame; portrait phones
  // keep the farther view so the whole tile stays in sight.
  const [cameraStart] = useState<[number, number, number]>(() =>
    typeof window !== 'undefined' && window.innerWidth / Math.max(window.innerHeight, 1) < 1 ? [0, 7000, 18500] : [0, 6200, 16400],
  )
  // The Moon globe view is offered only when NASA's colour map is deployed.
  const [globeReady, setGlobeReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    globeTextureAvailable().then((ok) => {
      if (!cancelled) setGlobeReady(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const [hintVisible, setHintVisible] = useState(true)
  const compassRef = useRef<HTMLSpanElement>(null)
  const selectedSite = sites.find((site) => site.site_id === selectedSiteId) ?? null
  const siteLabelRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null)

  const { scenario, error: scenarioError, unavailable, loading: scenarioLoading, retry } = useScenario(selectedSite)
  const { names, shares } = useSiteDirectory(sites)

  // Each site derives its own nearest sample from the shared moment; the moment itself never moves.
  const offsetS = scenario ? clockOffsetFor(clock, scenario) : 0
  const sample = scenario ? scenario.series[sampleIndexAt(scenario, offsetS)] : null
  const live = scenario && sample ? liveStatusAt(scenario, offsetS, utcAtOffset(scenario, offsetS, sample)) : null
  const seek = (target: number) => {
    if (scenario) setClock(clockAt(scenario, target))
  }

  const selectSite = (siteId: SiteId) => setSelectedSiteId(siteId)

  const togglePlay = () => {
    if (!scenario) return
    if (!playing && offsetS >= offsetBounds(scenario).end) seek(offsetBounds(scenario).start)
    setPlaying((value) => !value)
  }

  // Latest values for the animation loop and the keyboard shortcuts.
  const latest = useRef({ scenario, clock, offsetS, sites, speed, togglePlay })
  useEffect(() => {
    latest.current = { scenario, clock, offsetS, sites, speed, togglePlay }
  })

  // Playback: advances the exact clock at the chosen speed; stops at the period end.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000
      if (elapsed >= 1 / 30) {
        last = now
        const { scenario: current, clock: currentClock, speed: currentSpeed } = latest.current
        if (current) {
          const end = offsetBounds(current).end
          const next = Math.min(clockOffsetFor(currentClock, current) + Math.min(elapsed, 1) * currentSpeed, end)
          setClock(clockAt(current, next))
          if (next >= end) {
            setPlaying(false)
            return
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  // Keyboard: Space play/pause, [ and ] previous/next event, 1–4 select a site.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSkyOpen(false)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        if (!(tag === 'INPUT' && (target as HTMLInputElement).type === 'range' && (event.key === '[' || event.key === ']'))) return
      }
      const { scenario: current, offsetS: at, sites: list } = latest.current
      if (event.key === ' ' && tag !== 'BUTTON' && tag !== 'SUMMARY' && tag !== 'A') {
        event.preventDefault()
        latest.current.togglePlay()
      } else if ((event.key === '[' || event.key === ']') && current) {
        const found = event.key === '[' ? previousEvent(current.events, at) : nextEvent(current.events, at)
        if (found) setClock(clockAt(current, found.offset_s))
      } else if (/^[1-9]$/.test(event.key)) {
        const site = list[Number(event.key) - 1]
        if (site) setSelectedSiteId(site.site_id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const place = names[selectedSiteId] ?? (terrain && loadedSiteId === selectedSiteId ? placeName(terrain.name) : null)
  const scenarioStatus = unavailable ?? (scenarioLoading && selectedSite ? `Loading the ${selectedSite.name} scenario…` : null)
  const tileKm = terrain ? (terrain.pixel_m * terrain.width_px) / 1000 : null

  useEffect(() => {
    let cancelled = false
    loadSites()
      .then((loaded) => {
        if (!cancelled) setSites(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setSitesError(messageFrom(caught, 'Could not load the site list'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setHeightError(null)
    setTerrain(null)
    setHeight(null)
    setSamples(null)
    setMesh(null)
    setLoadedSiteId(null)
    loadTerrainMeta(selectedSiteId)
      .then((meta) => {
        if (cancelled) return
        setLoadedSiteId(selectedSiteId)
        setTerrain(meta)
        const nearest = nearestSiteVertex(meta)
        return loadHeightData(meta, nearest.column, nearest.row)
          .then((data) => {
            if (cancelled) return
            setHeight(data.summary)
            setSamples(data.samples)
          })
          .catch((caught: unknown) => {
            if (!cancelled) setHeightError(messageFrom(caught, 'Could not read the height PNG'))
          })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageFrom(caught, 'Could not load terrain JSON'))
      })
    return () => {
      cancelled = true
    }
  }, [selectedSiteId])

  useEffect(() => {
    if (!terrain || !samples) return
    const next = buildTerrainGeometry(terrain, samples)
    setMesh(next)
    return () => next.geometry.dispose()
  }, [terrain, samples])

  useEffect(() => {
    if (!terrain) return
    const loader = new TextureLoader()
    let alive = true
    const texture = loader.load(terrainAssetUrl(terrain.hillshade_png), () => {
      if (!alive) {
        texture.dispose()
        return
      }
      setHillshade(texture)
    })
    texture.colorSpace = SRGBColorSpace
    texture.flipY = true
    return () => {
      alive = false
      texture.dispose()
      setHillshade(null)
    }
  }, [terrain])

  return (
    <div className="atlas" data-mode={mode}>
      <header className="atlas-top">
        <div className="atlas-brand">
          <img className="atlas-mark" src={`${import.meta.env.BASE_URL}logo-96.png`} alt="" width="34" height="34" />
          <div className="atlas-brand-text">
            <p className="atlas-brand-name">Lunar Landing Site Navigator</p>
            <p className="atlas-brand-sub">Mission Atlas · Team Outliers · NASA Space Apps 2026</p>
          </div>
        </div>
        <nav className="atlas-modes" aria-label="Views">
          {modes.filter((item) => item.id !== 'globe' || globeReady).map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="atlas-mode"
              aria-current={mode === item.id ? 'page' : undefined}
              onClick={() => setMode(item.id)}
            >
              <span className="atlas-mode-n" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        <p className="atlas-period">
          {scenario && (
            <>
              <span className="atlas-period-label">Scenario</span>
              <span className="atlas-period-dates">
                {formatUtcDay(Date.parse(scenario.period.start_utc))} → {formatUtcDay(Date.parse(scenario.period.end_utc))}{' '}
                {scenario.period.end_utc.slice(0, 4)}
              </span>
            </>
          )}
          <span className="atlas-period-utc" title="All times are UTC">
            UTC
          </span>
        </p>
      </header>

      <SiteRail
        sites={sites}
        selectedId={selectedSiteId}
        onSelect={selectSite}
        names={names}
        shares={shares}
        live={live}
        error={sitesError}
      />

      <main
        className="atlas-viewport"
        aria-label="3D terrain"
        onPointerDown={() => setHintVisible(false)}
        onWheel={() => setHintVisible(false)}
      >
        <Canvas
          frameloop={mode === 'explore' ? 'always' : 'never'}
          camera={{ position: cameraStart, fov: 45, near: 1, far: 400000 }}
        >
          <color attach="background" args={['#07080b']} />
          <ambientLight intensity={0.45} />
          <directionalLight position={[4, 6, 3]} intensity={1.2} />
          {mesh && (
            <mesh geometry={mesh.geometry} scale={[1, exaggeration, 1]}>
              <HillshadeMaterial texture={hillshade} />
            </mesh>
          )}
          {terrain && <SiteMarker terrain={terrain} labelRef={siteLabelRef} exaggeration={exaggeration} />}
          {terrain?.north && <CompassTracker northDeg={terrain.north.north_at_site_deg} needleRef={compassRef} />}
          <OrbitControls ref={controlsRef} />
          <RememberView controlsRef={controlsRef} />
        </Canvas>

        {terrain && loadedSiteId && (
          <div ref={siteLabelRef} className="pin-label">
            <span className="pin-label-name">
              <span className="pin-label-kicker">Site</span> {loadedSiteId.slice(4)}
            </span>
            {live && (
              <span className="pin-label-dots" title={liveLabel(live)}>
                <Dot tone="sun" on={live.sunlight} />
                <Dot tone="earth" on={live.earth} />
                <Dot tone="joint" on={live.joint} />
                <span className="sr-only">{liveLabel(live)}</span>
              </span>
            )}
          </div>
        )}

        <div className="vp-shade" aria-hidden="true" />

        <div className="vp-frame" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="vp-title">
          {selectedSite && (
            <p className="vp-eyebrow">
              <span className="vp-eyebrow-site">{selectedSite.name}</span>
              <span className="vp-eyebrow-coords">{formatLatLon(selectedSite.latitude_deg, selectedSite.longitude_deg)}</span>
            </p>
          )}
          <h1 className="vp-place">{place ?? selectedSite?.name ?? 'Loading sites…'}</h1>
        </div>

        {(error || heightError) && (
          <div className="vp-message" role="alert">
            {error ?? heightError}
          </div>
        )}
        {!error && !heightError && !mesh && (
          <div className="vp-loading" aria-live="polite">
            <span className="vp-loading-bar" />
            Loading terrain…
          </div>
        )}

        {hintVisible && mesh && (
          <p className="vp-hint" aria-hidden="true">
            <span className="vp-hint-mouse">Drag to orbit · Scroll to zoom · Right-drag to pan</span>
            <span className="vp-hint-touch">Drag to orbit · Pinch to zoom · Two fingers to pan</span>
          </p>
        )}

        <div className="vp-controls">
          {terrain?.north && (
            <span className="vp-compass" title="Local north at the landing point (from the terrain file)">
              <span ref={compassRef} className="vp-compass-needle">
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <circle className="vp-compass-ring" cx="16" cy="16" r="10.5" />
                  <path className="vp-compass-tick" d="M26.5 16h-2M16 26.5v-2M5.5 16h2" />
                  <path className="vp-compass-n" d="M16 8.6 18.7 16h-5.4z" />
                  <path className="vp-compass-s" d="M16 23.4 13.3 16h5.4z" />
                </svg>
              </span>
              <span className="vp-compass-letter" aria-hidden="true">
                N
              </span>
              <span className="sr-only">Compass: the arrow points to local north</span>
            </span>
          )}
          <button type="button" className="vp-btn" onClick={() => controlsRef.current?.reset()}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" />
              <path d="M3 2.5v3h3" />
            </svg>
            Reset view
          </button>
          <span className="vp-ctl-label" aria-hidden="true">
            Vertical
          </span>
          <div className="vp-seg" role="radiogroup" aria-label="Vertical exaggeration (visual only)">
            {exaggerations.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={exaggeration === value}
                className="vp-seg-btn"
                onClick={() => setExaggeration(value)}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
        {exaggeration > 1 && (
          <span className="vp-chip" role="status">
            Heights ×{formatScale(exaggeration)} · visual only
          </span>
        )}

        {skyOpen && scenario && sample && selectedSite && (
          <div className="vp-sky" role="dialog" aria-label="Sky panorama, expanded">
            <div className="vp-sky-inner">
              <button type="button" className="vp-sky-close" onClick={() => setSkyOpen(false)}>
                Close <kbd>Esc</kbd>
              </button>
              <HorizonView site={selectedSite} scenario={scenario} sample={sample} offsetS={offsetS} idSuffix="-expanded" />
            </div>
          </div>
        )}

        <dl className="vp-legend">
          {tileKm !== null && terrain && (
            <div>
              <dt>Tile</dt>
              <dd>
                {Number.isInteger(tileKm) ? tileKm : tileKm.toFixed(1)} × {Number.isInteger(tileKm) ? tileKm : tileKm.toFixed(1)} km
              </dd>
            </div>
          )}
          {terrain && (
            <div>
              <dt>Grid</dt>
              <dd>{terrain.pixel_m} m</dd>
            </div>
          )}
          <div>
            <dt>Light</dt>
            <dd>Synthetic, not the Sun</dd>
          </div>
        </dl>
      </main>

      <ConditionsRail
        site={selectedSite}
        scenario={scenario}
        offsetS={offsetS}
        onSeek={seek}
        status={scenarioStatus}
        error={scenarioError}
        onRetry={retry}
        quiet={playing}
        onExpandSky={() => setSkyOpen(true)}
      />

      <TimeDeck
        scenario={scenario}
        offsetS={offsetS}
        onSeek={seek}
        status={scenarioError ?? scenarioStatus}
        playing={playing}
        onTogglePlay={togglePlay}
        speed={speed}
        onSpeed={setSpeed}
      />

      {mode === 'compare' && selectedSite && (
        <section className="atlas-page compare" aria-labelledby="compare-title">
          <div className="page-inner page-inner-wide">
            <p className="eyebrow">Compare sites</p>
            <h1 id="compare-title" className="page-title">
              How the four candidate sites compare
            </h1>
            <SiteComparison
              site={selectedSite}
              scenario={scenario}
              clock={clock}
              names={names}
              onSelectSite={(siteId) => {
                selectSite(siteId)
                setMode('explore')
              }}
              onPick={(siteId, picked) => {
                setClock(picked)
                selectSite(siteId)
                setMode('explore')
              }}
            />
          </div>
        </section>
      )}

      {mode === 'globe' && globeReady && (
        <Suspense
          fallback={
            <section className="atlas-page globe" aria-busy="true">
              <p className="globe-loading">Loading the Moon globe…</p>
            </section>
          }
        >
          <MoonGlobe
            sites={sites}
            names={names}
            selectedId={selectedSiteId}
            onOpenSite={(siteId) => {
              selectSite(siteId)
              setMode('explore')
            }}
          />
        </Suspense>
      )}

      {mode === 'method' && (
        <MethodPage
          site={selectedSite}
          sites={sites}
          names={names}
          placeName={place}
          scenario={scenario}
          terrain={terrain}
          height={height}
          mesh={mesh}
          terrainError={error}
          heightError={heightError}
        />
      )}
    </div>
  )
}

const markerRadius = 200

/**
 * Rotates the compass needle so it points to local north on screen. North comes
 * from the terrain file (clockwise from image up); image up is scene −Z and
 * image right is scene +X. Screen up and right are projected onto the ground.
 */
function CompassTracker({ northDeg, needleRef }: { northDeg: number; needleRef: RefObject<HTMLSpanElement | null> }) {
  const up = useRef(new Vector3())
  const right = useRef(new Vector3())
  useFrame(({ camera }) => {
    const needle = needleRef.current
    if (!needle) return
    const a = (northDeg * Math.PI) / 180
    const nx = Math.sin(a)
    const nz = -Math.cos(a)
    up.current.set(0, 1, 0).applyQuaternion(camera.quaternion)
    right.current.set(1, 0, 0).applyQuaternion(camera.quaternion)
    const angle = Math.atan2(nx * right.current.x + nz * right.current.z, nx * up.current.x + nz * up.current.z)
    needle.style.transform = `rotate(${angle}rad)`
    // The N label orbits with the needle tip but stays upright.
    const label = needle.nextElementSibling as HTMLElement | null
    if (label) label.style.transform = `translate(${Math.sin(angle) * 13}px, ${-Math.cos(angle) * 13}px)`
  })
  return null
}

type ViewControls = {
  saveState: () => void
  reset: () => void
}

function formatScale(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function RememberView({ controlsRef }: { controlsRef: RefObject<ViewControls | null> }) {
  const saved = useRef(false)
  useEffect(() => {
    if (saved.current) return
    const controls = controlsRef.current
    if (!controls) return
    controls.saveState()
    saved.current = true
  })
  return null
}

function SiteMarker({
  terrain,
  labelRef,
  exaggeration,
}: {
  terrain: TerrainMeta
  labelRef: RefObject<HTMLDivElement | null>
  exaggeration: number
}) {
  const [x, y, z] = terrain.site.scene_xyz_m
  const { camera, size } = useThree()
  const point = useRef(new Vector3())
  const exaggerationRef = useRef(exaggeration)
  exaggerationRef.current = exaggeration

  useFrame(() => {
    const label = labelRef.current
    if (!label) return
    const markerY = y * exaggerationRef.current
    point.current.set(x, markerY + markerRadius * 2, z)
    const projected = point.current.project(camera)
    const left = (projected.x * 0.5 + 0.5) * size.width
    const top = (-projected.y * 0.5 + 0.5) * size.height
    label.style.transform = `translate(-50%, -100%) translate(${left}px, ${top}px)`
    label.style.visibility = projected.z < 1 ? 'visible' : 'hidden'
  })

  return (
    <group position={[x, y * exaggeration + markerRadius, z]}>
      <mesh>
        <sphereGeometry args={[markerRadius, 32, 24]} />
        <meshBasicMaterial color="#f4f6fa" />
      </mesh>
    </group>
  )
}

function HillshadeMaterial({ texture }: { texture: Texture | null }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    if (!texture) return
    texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    texture.needsUpdate = true
  }, [gl, texture])

  return (
    <meshBasicMaterial
      map={texture ?? undefined}
      color={texture ? '#ffffff' : '#b7bec8'}
      side={DoubleSide}
      toneMapped={false}
    />
  )
}

function messageFrom(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}

