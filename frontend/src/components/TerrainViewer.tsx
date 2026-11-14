import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { SRGBColorSpace, DoubleSide, TextureLoader, Vector3, type Texture } from 'three'
import { loadSites } from '../sites/loadSites'
import { buildTerrainGeometry, nearestSiteVertex, type TerrainMesh } from '../terrain/buildGeometry'
import { loadHeightData, loadTerrainMeta } from '../terrain/loadTerrain'
import type { Site, SiteId } from '../types/science'
import type { HeightSummary, TerrainMeta } from '../terrain/types'

export function TerrainViewer() {
  const [terrain, setTerrain] = useState<TerrainMeta | null>(null)
  const [height, setHeight] = useState<HeightSummary | null>(null)
  const [samples, setSamples] = useState<Uint16Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heightError, setHeightError] = useState<string | null>(null)
  const [mesh, setMesh] = useState<TerrainMesh | null>(null)
  const [hillshade, setHillshade] = useState<Texture | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [exaggeration, setExaggeration] = useState(1)
  const [sites, setSites] = useState<Site[]>([])
  const [sitesError, setSitesError] = useState<string | null>(null)
  const [selectedSiteId, setSelectedSiteId] = useState<SiteId>('site01')
  const [loadedSiteId, setLoadedSiteId] = useState<SiteId | null>(null)
  const siteLabelRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<ViewControls | null>(null)

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
    const texture = loader.load(`/terrain/${terrain.hillshade_png}`, () => {
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
    <div className="terrain-viewer">
      <div className="terrain-hud">
        <div className="terrain-site-selector" role="group" aria-label="Landing sites">
          {sites.map((site) => (
            <button
              key={site.site_id}
              type="button"
              className="terrain-info-toggle"
              aria-pressed={site.site_id === selectedSiteId}
              onClick={() => setSelectedSiteId(site.site_id)}
            >
              {site.name}
            </button>
          ))}
        </div>
        {sitesError && <p className="terrain-readout-status">{sitesError}</p>}
        <div className="terrain-hud-actions">
          <button
            type="button"
            className="terrain-info-toggle"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen((open) => !open)}
          >
            {infoOpen ? 'Hide info' : 'Show info'}
          </button>
          <button type="button" className="terrain-info-toggle" onClick={() => controlsRef.current?.reset()}>
            Reset view
          </button>
        </div>
        <label className="terrain-exaggeration">
          Vertical exaggeration (visual only)
          <span className="terrain-exaggeration-row">
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={exaggeration}
              onChange={(event) => setExaggeration(Number(event.target.value))}
            />
            <span>{formatScale(exaggeration)}x</span>
          </span>
        </label>
        {exaggeration > 1 && (
          <p className="terrain-exaggeration-note">
            Vertical exaggeration x{formatScale(exaggeration)} applied (visual only)
          </p>
        )}
        {(infoOpen || error || heightError) && (
          <aside className="terrain-readout">
            <TerrainReadout
              terrain={terrain}
              height={height}
              mesh={mesh}
              error={error}
              heightError={heightError}
            />
          </aside>
        )}
      </div>
      <p className="terrain-note">Hillshade: visual only, synthetic light (not the real Sun)</p>
      {terrain && loadedSiteId && (
        <div ref={siteLabelRef} className="terrain-site-label">
          Site{loadedSiteId.slice(4)} landing point
        </div>
      )}
      <Canvas camera={{ position: [0, 8000, 22000], fov: 45, near: 1, far: 400000 }}>
        <color attach="background" args={['#16171d']} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[4, 6, 3]} intensity={1.2} />
        {mesh && (
          <mesh geometry={mesh.geometry} scale={[1, exaggeration, 1]}>
            <HillshadeMaterial texture={hillshade} />
          </mesh>
        )}
        {terrain && <SiteMarker terrain={terrain} labelRef={siteLabelRef} exaggeration={exaggeration} />}
        <mesh>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial color="#c084fc" />
        </mesh>
        <OrbitControls ref={controlsRef} />
        <RememberView controlsRef={controlsRef} />
      </Canvas>
    </div>
  )
}

const markerRadius = 200

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
    point.current.set(x, markerY + markerRadius * 2 + 60, z)
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
        <meshBasicMaterial color="#f5b000" />
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

function TerrainReadout({
  terrain,
  height,
  mesh,
  error,
  heightError,
}: {
  terrain: TerrainMeta | null
  height: HeightSummary | null
  mesh: TerrainMesh | null
  error: string | null
  heightError: string | null
}) {
  if (error) {
    return <p className="terrain-readout-status">{error}</p>
  }
  if (!terrain) {
    return <p className="terrain-readout-status">Loading terrain…</p>
  }

  const [markerX, markerY, markerZ] = terrain.site.scene_xyz_m

  return (
    <>
      <p className="terrain-readout-name">{terrain.name}</p>
      <dl>
        <div>
          <dt>Size</dt>
          <dd>
            {terrain.width_px} × {terrain.height_px} px
          </dd>
        </div>
        <div>
          <dt>Pixel size</dt>
          <dd>{terrain.pixel_m} m</dd>
        </div>
        <div>
          <dt>z min</dt>
          <dd>{terrain.elevation.zmin_m} m</dd>
        </div>
        <div>
          <dt>z max</dt>
          <dd>{terrain.elevation.zmax_m} m</dd>
        </div>
        <div>
          <dt>Marker (X, Y, Z)</dt>
          <dd>
            {markerX}, {markerY}, {markerZ} m
          </dd>
        </div>
        <div>
          <dt>Terrain at marker</dt>
          <dd>{mesh ? metres(mesh.heightAtMarker) : '…'}</dd>
        </div>
      </dl>
      <HeightReadout height={height} heightError={heightError} />
      {height && <TerrainMeshReadout mesh={mesh} />}
    </>
  )
}

function metres(value: number) {
  return `${value.toFixed(3)} m`
}

function TerrainMeshReadout({ mesh }: { mesh: TerrainMesh | null }) {
  if (!mesh) {
    return <p className="terrain-readout-status">Building the terrain mesh…</p>
  }

  return (
    <>
      <p className="terrain-readout-name">Terrain mesh</p>
      <dl>
        <div>
          <dt>Lowest Y</dt>
          <dd>{metres(mesh.minY)}</dd>
        </div>
        <div>
          <dt>Highest Y</dt>
          <dd>{metres(mesh.maxY)}</dd>
        </div>
        <div>
          <dt>Nearest site Y</dt>
          <dd>
            {metres(mesh.siteY)} at column {mesh.siteColumn}, row {mesh.siteRow}
          </dd>
        </div>
      </dl>
    </>
  )
}

function HeightReadout({
  height,
  heightError,
}: {
  height: HeightSummary | null
  heightError: string | null
}) {
  if (heightError) {
    return <p className="terrain-readout-status">{heightError}</p>
  }
  if (!height) {
    return <p className="terrain-readout-status">Reading height samples…</p>
  }

  return (
    <>
      <p className="terrain-readout-name">Height samples</p>
      <dl>
        <div>
          <dt>Bit depth</dt>
          <dd>{height.depth}</dd>
        </div>
        <div>
          <dt>Pixel count</dt>
          <dd>{height.pixelCount.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Smallest DN</dt>
          <dd>{height.minDn}</dd>
        </div>
        <div>
          <dt>Largest DN</dt>
          <dd>{height.maxDn}</dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>
            {height.elevationM.toFixed(3)} m at column {height.column}, row {height.row}
          </dd>
        </div>
      </dl>
    </>
  )
}
