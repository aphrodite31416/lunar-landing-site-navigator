import { BufferAttribute, BufferGeometry } from 'three'
import { elevationFromDn } from './elevation'
import type { TerrainMeta } from './types'

export type TerrainMesh = {
  geometry: BufferGeometry
  minY: number
  maxY: number
  siteColumn: number
  siteRow: number
  siteY: number
  heightAtMarker: number
}

export function terrainHeightAt(meta: TerrainMeta, samples: Uint16Array, sceneX: number, sceneZ: number) {
  const width = meta.width_px
  const height = meta.height_px
  const xMin = Math.min(meta.x_range_m[0], meta.x_range_m[1])
  const yMax = Math.max(meta.y_range_m[0], meta.y_range_m[1])
  const [centerX, centerY] = meta.center_xy_m
  const { zmin_m, zmax_m } = meta.elevation
  const mapX = sceneX + centerX
  const mapY = centerY - sceneZ
  const column = (mapX - xMin) / meta.pixel_m - 0.5
  const row = (yMax - mapY) / meta.pixel_m - 0.5
  const column0 = Math.min(width - 1, Math.max(0, Math.floor(column)))
  const row0 = Math.min(height - 1, Math.max(0, Math.floor(row)))
  const column1 = Math.min(width - 1, column0 + 1)
  const row1 = Math.min(height - 1, row0 + 1)
  const tx = column <= 0 ? 0 : column >= width - 1 ? 1 : column - column0
  const ty = row <= 0 ? 0 : row >= height - 1 ? 1 : row - row0

  const stored = new Float32Array(1)
  const heightAt = (sampleColumn: number, sampleRow: number) => {
    stored[0] = elevationFromDn(samples[sampleRow * width + sampleColumn], zmin_m, zmax_m)
    return stored[0]
  }
  const y00 = heightAt(column0, row0)
  const y10 = heightAt(column1, row0)
  const y01 = heightAt(column0, row1)
  const y11 = heightAt(column1, row1)
  if (tx + ty <= 1) return y00 * (1 - tx - ty) + y10 * tx + y01 * ty
  return y10 * (1 - ty) + y01 * (1 - tx) + y11 * (tx + ty - 1)
}

export function nearestSiteVertex(meta: TerrainMeta) {
  const [pixelX, pixelY] = meta.site.px
  const column = Math.min(meta.width_px - 1, Math.max(0, Math.round(pixelX - 0.5)))
  const row = Math.min(meta.height_px - 1, Math.max(0, Math.round(pixelY - 0.5)))
  return { column, row }
}

export function buildTerrainGeometry(meta: TerrainMeta, samples: Uint16Array): TerrainMesh {
  const width = meta.width_px
  const height = meta.height_px
  if (samples.length !== width * height) {
    throw new Error(`Expected ${width * height} height samples, got ${samples.length}`)
  }

  const pixelM = meta.pixel_m
  const xMin = Math.min(meta.x_range_m[0], meta.x_range_m[1])
  const yMax = Math.max(meta.y_range_m[0], meta.y_range_m[1])
  const [centerX, centerY] = meta.center_xy_m
  const { zmin_m, zmax_m } = meta.elevation
  const { column: siteColumn, row: siteRow } = nearestSiteVertex(meta)

  const positions = new Float32Array(width * height * 3)
  const uvs = new Float32Array(width * height * 2)
  let positionOffset = 0
  let uvOffset = 0
  let sampleIndex = 0
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let siteY = 0

  for (let row = 0; row < height; row++) {
    const mapY = yMax - (row + 0.5) * pixelM
    const sceneZ = -(mapY - centerY)
    const v = 1 - (row + 0.5) / height
    for (let column = 0; column < width; column++) {
      const mapX = xMin + (column + 0.5) * pixelM
      const y = elevationFromDn(samples[sampleIndex], zmin_m, zmax_m)
      sampleIndex += 1
      positions[positionOffset++] = mapX - centerX
      positions[positionOffset++] = y
      positions[positionOffset++] = sceneZ
      uvs[uvOffset++] = (column + 0.5) / width
      uvs[uvOffset++] = v
      const storedY = positions[positionOffset - 2]
      if (storedY < minY) minY = storedY
      if (storedY > maxY) maxY = storedY
      if (column === siteColumn && row === siteRow) siteY = storedY
    }
  }

  const indices = new Uint32Array((width - 1) * (height - 1) * 6)
  let indexOffset = 0
  for (let row = 0; row < height - 1; row++) {
    const rowStart = row * width
    const nextRow = rowStart + width
    for (let column = 0; column < width - 1; column++) {
      const i0 = rowStart + column
      const i1 = i0 + 1
      const i2 = nextRow + column
      const i3 = i2 + 1
      indices[indexOffset++] = i0
      indices[indexOffset++] = i2
      indices[indexOffset++] = i1
      indices[indexOffset++] = i1
      indices[indexOffset++] = i2
      indices[indexOffset++] = i3
    }
  }

  const [markerX, , markerZ] = meta.site.scene_xyz_m
  const heightAtMarker = terrainHeightAt(meta, samples, markerX, markerZ)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return { geometry, minY, maxY, siteColumn, siteRow, siteY, heightAtMarker }
}
