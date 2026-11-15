import { decode } from 'fast-png'
import type { SiteId } from '../types/science'
import { elevationFromDn } from './elevation'
import type { HeightSummary, TerrainMeta } from './types'

export type HeightData = {
  summary: HeightSummary
  samples: Uint16Array
}

export function terrainAssetUrl(filename: string) {
  return `${import.meta.env.BASE_URL}terrain/${filename}`
}

export async function loadTerrainMeta(siteId: SiteId): Promise<TerrainMeta> {
  const response = await fetch(terrainAssetUrl(`site_${siteId.slice(4)}_terrain.json`))
  if (!response.ok) {
    throw new Error(`Could not load terrain JSON (${response.status})`)
  }
  return response.json() as Promise<TerrainMeta>
}

export async function loadHeightData(
  meta: TerrainMeta,
  column: number,
  row: number,
): Promise<HeightData> {
  const response = await fetch(terrainAssetUrl(meta.height_png))
  if (!response.ok) {
    throw new Error(`Could not load height PNG (${response.status})`)
  }

  const decoded = decode(new Uint8Array(await response.arrayBuffer()))
  if (decoded.depth !== 16 || decoded.channels !== 1) {
    throw new Error(
      `Expected a 16-bit grayscale PNG, got depth ${decoded.depth} and ${decoded.channels} channels`,
    )
  }
  if (!(decoded.data instanceof Uint16Array)) {
    throw new Error('Height PNG did not decode to 16-bit samples')
  }
  if (decoded.width !== meta.width_px || decoded.height !== meta.height_px) {
    throw new Error(
      `Height PNG is ${decoded.width}×${decoded.height}, JSON says ${meta.width_px}×${meta.height_px}`,
    )
  }
  if (decoded.data.length !== decoded.width * decoded.height) {
    throw new Error('Height sample count does not match the image size')
  }
  if (column < 0 || row < 0 || column >= decoded.width || row >= decoded.height) {
    throw new Error(`Pixel column ${column}, row ${row} is outside the image`)
  }

  let minDn = decoded.data[0]
  let maxDn = decoded.data[0]
  for (const dn of decoded.data) {
    if (dn < minDn) minDn = dn
    if (dn > maxDn) maxDn = dn
  }

  const dn = decoded.data[row * decoded.width + column]
  const { zmin_m, zmax_m } = meta.elevation

  return {
    summary: {
      depth: decoded.depth,
      pixelCount: decoded.data.length,
      minDn,
      maxDn,
      column,
      row,
      elevationM: elevationFromDn(dn, zmin_m, zmax_m),
    },
    samples: decoded.data,
  }
}
