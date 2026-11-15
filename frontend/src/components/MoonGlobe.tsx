import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BufferGeometry, Float32BufferAttribute, SRGBColorSpace, TextureLoader, Vector3, type Texture } from 'three'
import { loadTerrainMeta, terrainAssetUrl } from '../terrain/loadTerrain'
import { globeTextureUrl } from './globeAsset'
import type { TerrainMeta } from '../terrain/types'
import type { Site, SiteId } from '../types/science'

/** Radius of the reference sphere used by the terrain grids (metres). */
const moonRadiusM = 1737400

/** Planetocentric latitude and east longitude on a unit sphere; +Y is the north pole, 0° longitude faces +Z. */
function onSphere(latDeg: number, lonDeg: number, r = 1) {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  return new Vector3(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon))
}

/** Inverse south polar stereographic (the grid of the terrain tiles). */
function fromStereo(x: number, y: number) {
  const rho = Math.hypot(x, y)
  const colat = 2 * Math.atan(rho / (2 * moonRadiusM))
  return { lat: -90 + (colat * 180) / Math.PI, lon: (Math.atan2(x, y) * 180) / Math.PI }
}

type View = 'moon' | 'pole'

const views: Record<View, Vector3> = {
  moon: onSphere(-58, 20, 4.3),
  // Just off the polar axis on the 0° side, so 0° longitude is up and 90°E is right, as on the polar map.
  pole: new Vector3(0, -1.1, 0.0025),
}

type Tile = { id: SiteId; meta: TerrainMeta }

/**
 * Contextual Moon globe. The sphere, its grid and its light are illustrative;
 * the four patches at the south pole are the real LOLA terrain tiles from the
 * Explore view, draped at their true polar stereographic position.
 */
export default function MoonGlobe({
  sites,
  names,
  selectedId,
  onOpenSite,
}: {
  sites: Site[]
  names: Partial<Record<SiteId, string>>
  selectedId: SiteId
  onOpenSite: (siteId: SiteId) => void
}) {
  const [view, setView] = useState<View>('moon')
  const [tiles, setTiles] = useState<Tile[]>([])
  const labelsRef = useRef<HTMLDivElement>(null)
  const key = sites.map((site) => site.site_id).join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    Promise.all((key.split(',') as SiteId[]).map((id) => loadTerrainMeta(id).then((meta) => ({ id, meta })).catch(() => null))).then(
      (list) => {
        if (!cancelled) setTiles(list.filter((tile): tile is Tile => tile !== null))
      },
    )
    return () => {
      cancelled = true
    }
  }, [key])

  return (
    <section className="atlas-page globe" aria-labelledby="globe-title">
      <div className="globe-stage" data-view={view}>
        <Canvas camera={{ position: views.moon.toArray(), fov: 34, near: 0.001, far: 100 }} dpr={[1, 2]}>
          <color attach="background" args={['#05060a']} />
          <ambientLight intensity={0.05} />
          <directionalLight position={[4, -1.2, 1.4]} intensity={2.2} />
          <Globe />
          {tiles.map((tile) => (
            <TerrainPatch key={tile.id} meta={tile.meta} />
          ))}
          {sites.map((site) => (
            <SiteMarker key={site.site_id} site={site} selected={site.site_id === selectedId} />
          ))}
          <LabelProjector container={labelsRef} />
          <CameraRig view={view} />
        </Canvas>
        <div ref={labelsRef} className="globe-labels">
          {sites.map((site) => (
            <button
              key={site.site_id}
              type="button"
              data-lat={site.latitude_deg}
              data-lon={site.longitude_deg}
              data-near-only="true"
              className={`globe-pin globe-pin-${site.longitude_deg > -150 && site.longitude_deg < 0 ? 'left' : 'right'}${
                site.site_id === selectedId ? ' is-selected' : ''
              }`}
              onClick={() => onOpenSite(site.site_id)}
            >
              <span className="globe-pin-num">{site.site_id.slice(4)}</span>
              <span className="globe-pin-name">{names[site.site_id] ?? site.name}</span>
              <span className="sr-only"> · open in Explore</span>
            </button>
          ))}
          <button type="button" data-lat={-90} data-lon={0} data-far-only="true" className="globe-cluster" onClick={() => setView('pole')}>
            <span className="globe-cluster-dot" aria-hidden="true" />
            South pole · 4 candidate sites
          </button>
        </div>
      </div>

      <div className="globe-panel">
        <p className="eyebrow">Moon globe · context</p>
        <h1 id="globe-title" className="globe-title">
          Where the four sites are
        </h1>
        <p className="globe-text">
          All four candidates sit within 1.4° of the lunar south pole. Zoom in to see them; select one to open its
          terrain in Explore.
        </p>
        <div className="globe-views" role="group" aria-label="Globe view">
          <button type="button" aria-pressed={view === 'moon'} onClick={() => setView('moon')}>
            Whole Moon
          </button>
          <button type="button" aria-pressed={view === 'pole'} onClick={() => setView('pole')}>
            South-pole sites
          </button>
        </div>
        <ul className="globe-sites">
          {sites.map((site) => (
            <li key={site.site_id}>
              <button
                type="button"
                className={site.site_id === selectedId ? 'is-selected' : undefined}
                onClick={() => onOpenSite(site.site_id)}
              >
                <span className="globe-site-num">{site.site_id.slice(4)}</span>
                <span className="globe-site-name">{names[site.site_id] ?? site.name}</span>
                <span className="globe-site-coord">
                  {Math.abs(site.latitude_deg).toFixed(2)}°S {Math.abs(site.longitude_deg).toFixed(2)}°
                  {site.longitude_deg < 0 ? 'W' : 'E'}
                </span>
                <span className="sr-only">Open in Explore</span>
              </button>
            </li>
          ))}
        </ul>
        <dl className="globe-key">
          <div>
            <dt>Surface</dt>
            <dd>
              LRO Camera colour mosaic (latitudes beyond 70° from LOLA albedo), made for appearance, not analysis.
              Lighting is illustrative.
            </dd>
          </div>
          <div>
            <dt>Patches</dt>
            <dd>The 16 km LOLA terrain tiles analysed in Explore, at their true coordinates (synthetic relief shading).</dd>
          </div>
          <div>
            <dt>Credit</dt>
            <dd>
              Moon colour map:{' '}
              <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">
                NASA&rsquo;s Scientific Visualization Studio
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              , CGI Moon Kit.
            </dd>
          </div>
        </dl>
        <p className="globe-hint">Drag to rotate · scroll or pinch to zoom</p>
      </div>
    </section>
  )
}

/**
 * The Moon with NASA's LROC colour map. Three.js sphere UVs start at the -X
 * axis; turning the mesh by -90° puts texture longitude 0° on +Z, where
 * `onSphere` places 0° longitude, so markers and imagery share coordinates.
 */
function Globe() {
  const gl = useThree((state) => state.gl)
  const [map, setMap] = useState<Texture | null>(null)
  useEffect(() => {
    let cancelled = false
    new TextureLoader().load(globeTextureUrl, (loaded) => {
      loaded.colorSpace = SRGBColorSpace
      loaded.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      if (!cancelled) setMap(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [gl])

  const polar = useMemo(() => {
    const points: number[] = []
    for (const lat of [-89, -88]) {
      for (let lon = 0; lon < 360; lon += 2) {
        const a = onSphere(lat, lon, 1.0003)
        const b = onSphere(lat, lon + 2, 1.0003)
        points.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
    return geometry
  }, [])
  return (
    <group>
      <mesh rotation={[0, -Math.PI / 2, 0]}>
        <sphereGeometry args={[1, 192, 128]} />
        {/* Keyed so the shader is rebuilt with the map once it arrives. */}
        {map ? (
          <meshStandardMaterial key="map" map={map} roughness={1} metalness={0} />
        ) : (
          <meshStandardMaterial key="plain" color="#2a2c31" roughness={1} metalness={0} />
        )}
      </mesh>
      <lineSegments geometry={polar}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.22} />
      </lineSegments>
    </group>
  )
}

/** A terrain tile draped on the sphere through the inverse stereographic projection. */
function TerrainPatch({ meta }: { meta: TerrainMeta }) {
  const [texture, setTexture] = useState<Texture | null>(null)
  useEffect(() => {
    let cancelled = false
    new TextureLoader().load(terrainAssetUrl(meta.hillshade_png), (loaded) => {
      loaded.colorSpace = SRGBColorSpace
      if (!cancelled) setTexture(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [meta.hillshade_png])

  const geometry = useMemo(() => {
    const n = 16
    const [x0, x1] = meta.x_range_m
    const [y0, y1] = meta.y_range_m
    const positions: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const u = i / n
        const v = j / n
        const { lat, lon } = fromStereo(x0 + u * (x1 - x0), y0 + v * (y1 - y0))
        const p = onSphere(lat, lon, 1.0004)
        positions.push(p.x, p.y, p.z)
        uvs.push(u, v)
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i
        index.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2)
      }
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    result.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    result.setIndex(index)
    result.computeVertexNormals()
    return result
  }, [meta])

  if (!texture) return null
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial map={texture} toneMapped={false} side={2} />
    </mesh>
  )
}

function SiteMarker({ site, selected }: { site: Site; selected: boolean }) {
  const position = useMemo(() => onSphere(site.latitude_deg, site.longitude_deg, 1.0007), [site])
  return (
    <mesh position={position}>
      <sphereGeometry args={[selected ? 0.0006 : 0.00045, 16, 12]} />
      <meshBasicMaterial color={selected ? '#f2b640' : '#f4f6fa'} />
    </mesh>
  )
}

/**
 * Places the HTML labels over their points each frame and hides labels on the
 * far side of the globe. Labels stay ordinary buttons, so they keep keyboard
 * focus and screen-reader names.
 */
function LabelProjector({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree()
  const point = useRef(new Vector3())
  const toCamera = useRef(new Vector3())
  useFrame(() => {
    const root = container.current
    if (!root) return
    const near = camera.position.length() < 1.6
    for (const element of Array.from(root.children) as HTMLElement[]) {
      const lat = Number(element.dataset.lat)
      const lon = Number(element.dataset.lon)
      const wanted = element.dataset.nearOnly ? near : !near
      const p = onSphere(lat, lon, 1.0007)
      toCamera.current.copy(camera.position).sub(p)
      const facing = toCamera.current.dot(p) > 0
      point.current.copy(p).project(camera)
      const x = (point.current.x * 0.5 + 0.5) * size.width
      const y = (-point.current.y * 0.5 + 0.5) * size.height
      const show = wanted && facing && point.current.z < 1
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      // Keep side labels inside the view: flip them when they would run off an edge.
      if (element.dataset.nearOnly) {
        const width = element.offsetWidth
        const prefersLeft = element.classList.contains('globe-pin-left')
        const fitsLeft = x - width - 10 > 4
        const fitsRight = x + width + 10 < size.width - 4
        const left = prefersLeft ? fitsLeft || !fitsRight : !fitsRight && fitsLeft
        element.style.translate = left ? 'calc(-100% - 10px) -50%' : '10px -50%'
      }
      element.style.visibility = show ? 'visible' : 'hidden'
    }
  })
  return null
}

/** Eases the camera to the chosen view and slows rotation close to the surface. */
function CameraRig({ view }: { view: View }) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const { camera, size } = useThree()
  const flying = useRef(true)

  useEffect(() => {
    flying.current = true
  }, [view])

  useFrame((_, delta) => {
    // Narrow (portrait) views stand farther back so the whole subject fits.
    const widen = Math.max(1, 1.25 / (size.width / Math.max(size.height, 1)))
    const base = views[view]
    const target = view === 'pole' ? new Vector3(0, -(1 + 0.1 * widen), 0.0025) : base.clone().multiplyScalar(widen)
    if (flying.current) {
      camera.position.lerp(target, 1 - Math.exp(-Math.min(delta, 0.5) * 4))
      if (camera.position.distanceTo(target) < 0.002) flying.current = false
    }
    const distance = camera.position.length()
    if (controls.current) {
      controls.current.rotateSpeed = Math.min(0.8, Math.max(0.04, (distance - 1) * 0.5))
      controls.current.zoomSpeed = Math.min(1, Math.max(0.15, (distance - 1) * 0.6))
      controls.current.update()
    }
  })

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minDistance={1.035}
      maxDistance={6}
      enableDamping
      dampingFactor={0.08}
      onStart={() => {
        flying.current = false
      }}
    />
  )
}
