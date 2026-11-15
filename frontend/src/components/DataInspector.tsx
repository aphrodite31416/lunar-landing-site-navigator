import type { TerrainMesh } from '../terrain/buildGeometry'
import type { HeightSummary, TerrainMeta } from '../terrain/types'

/**
 * Engineering readouts for the loaded terrain tile (moved here from the main
 * view). Values are exactly the ones the renderer uses.
 */
export function TerrainReadout({
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
