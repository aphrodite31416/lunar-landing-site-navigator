/**
 * Data sources and references for the Method & data page. Links are the ones
 * cited in the repository documentation (docs/, terrain/, formatreport.md) or
 * listed on those NASA product pages; references without a verified link are
 * shown as text only.
 */

export type SourceLink = { label: string; href: string }

/**
 * Where the project's documents and validation files are published. Paths on
 * the Method page link here; change this if the repository moves or the
 * default branch is renamed.
 */
export const repository = {
  url: 'https://github.com/aphrodite31416/lunar-landing-site-navigator',
  branch: 'main',
} as const

/** Web link for a repository path; a trailing slash links the folder. */
export function repositoryHref(path: string) {
  const kind = path.endsWith('/') ? 'tree' : 'blob'
  return `${repository.url}/${kind}/${repository.branch}/${path.replace(/\/$/, '')}`
}

export type DataSource = {
  id: string
  role: 'Terrain' | 'Site definition' | 'Ephemeris' | 'Comparison' | 'Independent check'
  name: string
  provider: string
  files: string[]
  use: string
  reference?: string
  links: SourceLink[]
}

export const dataSources: DataSource[] = [
  {
    id: 'lola-5m',
    role: 'Terrain',
    name: 'High-resolution LOLA topography for south-pole sites',
    provider: 'NASA Goddard · Planetary Geodesy Data Archive (PGDA)',
    files: ['SiteXX_final_adj_5mpp_surf.tif', 'SiteXX_final_adj_5mpp_toterr.tif'],
    use: 'Terrain at 5 m per pixel around each site, plus the per-pixel height error used for the uncertainty estimate.',
    reference: 'Barker et al. 2021, Planetary and Space Science 203, 105119',
    links: [{ label: 'PGDA product 78', href: 'https://pgda.gsfc.nasa.gov/products/78' }],
  },
  {
    id: 'lola-mosaics',
    role: 'Terrain',
    name: 'LOLA south-polar elevation mosaics, 80 m and 240 m',
    provider: 'NASA Goddard · PGDA, “A New View of the Lunar South Pole from LOLA”',
    files: ['LDEM_80S_80MPP_ADJ.TIF', 'LDEM_60S_240MPP_ADJ.TIF'],
    use: 'Distant terrain beyond the 5 m tile, out to the search limit of each horizon ray.',
    reference: 'Barker et al. 2023, Planetary Science Journal 4, 183',
    links: [
      { label: 'PGDA product 90', href: 'https://pgda.gsfc.nasa.gov/products/90' },
      { label: 'doi:10.3847/PSJ/acf3e1', href: 'https://doi.org/10.3847/PSJ/acf3e1' },
    ],
  },
  {
    id: 'roi',
    role: 'Site definition',
    name: 'Sunlit regions of interest (RoIs)',
    provider: 'NASA Goddard · PGDA, distributed with the 5 m site products',
    files: ['RoI shapefiles per site'],
    use: 'Each site point is the centroid of its largest sunlit region (mean illumination above 70%).',
    reference: 'Barker et al. 2021',
    links: [{ label: 'PGDA product 78', href: 'https://pgda.gsfc.nasa.gov/products/78' }],
  },
  {
    id: 'lola-extremes',
    role: 'Terrain',
    name: 'Global LOLA elevation extremes',
    provider: 'Lunar Orbiter Laser Altimeter science team',
    files: ['−9.129 km / +10.792 km'],
    use: 'Sets how far each horizon ray must search before no terrain could rise above it (extremes plus a 100 m margin).',
    reference: 'Smith et al. 2017, Icarus 283, 70–91',
    links: [],
  },
  {
    id: 'spice',
    role: 'Ephemeris',
    name: 'SPICE kernels and toolkit',
    provider: 'NASA JPL · Navigation and Ancillary Information Facility (NAIF)',
    files: ['de421.bsp', 'moon_pa_de421_1900-2050.bpc', 'moon_080317.tf', 'pck00011.tpc', 'naif0012.tls'],
    use: 'Directions of the Sun and Earth from each observer, corrected for light time and stellar aberration.',
    links: [
      { label: 'Generic kernels', href: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/aareadme.txt' },
      { label: 'Lunar frames (moon_080317.tf)', href: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf' },
      { label: 'spkcpo', href: 'https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkcpo_c.html' },
      { label: 'Event search (GF)', href: 'https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/gf.html' },
    ],
  },
  {
    id: 'nasa-illumination',
    role: 'Comparison',
    name: 'Lunar polar illumination map',
    provider: 'NASA Goddard · PGDA',
    files: ['AVGVISIB_85S_060M_201608'],
    use: 'Long-term average sunlight at 60 m per pixel, hourly over about 18.6 years. Used only for comparison.',
    reference: 'Mazarico et al. 2011, Icarus 211, 1066–1081',
    links: [
      { label: 'PGDA product 69', href: 'https://pgda.gsfc.nasa.gov/products/69' },
      { label: 'doi:10.1016/j.icarus.2010.10.030', href: 'https://doi.org/10.1016/j.icarus.2010.10.030' },
    ],
  },
  {
    id: 'horizons',
    role: 'Independent check',
    name: 'JPL Horizons',
    provider: 'NASA JPL · Solar System Dynamics',
    files: ['DE441 with its own lunar orientation'],
    use: 'An independent source of Sun and Earth directions, used to check the pipeline’s SPICE geometry.',
    links: [{ label: 'Horizons manual', href: 'https://ssd.jpl.nasa.gov/horizons/manual.html' }],
  },
]

/** Plain-language descriptions of the files fingerprinted in a scenario's provenance. */
export function describeInput(name: string): string {
  if (name.endsWith('.bsp')) return 'Planetary ephemeris: where the Sun, Earth and Moon are'
  if (name.endsWith('.bpc')) return 'Orientation of the Moon over time'
  if (name.endsWith('.tf')) return 'Definition of the lunar body-fixed frame'
  if (name.endsWith('.tpc')) return 'Planetary constants: sizes and shapes'
  if (name.endsWith('.tls')) return 'Leap seconds, linking UTC to ephemeris time'
  if (/^ephemeris_.*\.json$/.test(name)) return 'Ephemeris handoff: times, frame and observer metadata'
  if (/^ephemeris_.*\.npz$/.test(name)) return 'Ephemeris handoff: observer-relative Sun and Earth vectors'
  return 'Input file'
}
