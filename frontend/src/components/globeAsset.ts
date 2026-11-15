/**
 * NASA SVS CGI Moon Kit colour map (LRO LROC WAC mosaic), 2048 × 1024,
 * equirectangular, centred on 0° longitude. Hosted with the app so the globe
 * needs no external request. Source: https://svs.gsfc.nasa.gov/4720/
 */
export const globeTextureUrl = `${import.meta.env.BASE_URL}globe/lroc_color_2k.jpg`

/** True when the colour map is deployed; the Moon globe view is offered only then. */
export async function globeTextureAvailable() {
  try {
    const response = await fetch(globeTextureUrl, { method: 'HEAD' })
    return response.ok && (response.headers.get('content-type') ?? '').startsWith('image/')
  } catch {
    return false
  }
}
