export type TerrainMeta = {
  name: string
  height_png: string
  hillshade_png: string
  width_px: number
  height_px: number
  pixel_m: number
  x_range_m: [number, number]
  y_range_m: [number, number]
  center_xy_m: [number, number]
  elevation: {
    zmin_m: number
    zmax_m: number
  }
  /** Local north at the site: clockwise angle from image up (equals longitude). */
  north?: {
    north_at_site_deg: number
  }
  site: {
    px: [number, number]
    scene_xyz_m: [number, number, number]
  }
}

export type HeightSummary = {
  depth: number
  pixelCount: number
  minDn: number
  maxDn: number
  column: number
  row: number
  elevationM: number
}
