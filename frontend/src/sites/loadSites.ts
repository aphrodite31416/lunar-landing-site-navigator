import { loadManifest, manifestUrl } from './loadManifest'
import type { Site } from '../types/science'

let sitesRequest: Promise<Site[]> | null = null

export function loadSites(): Promise<Site[]> {
  if (sitesRequest) return sitesRequest
  const pending = loadManifest().then(async (manifest) => {
    const response = await fetch(new URL(manifest.sites_url, manifestUrl()))
    if (!response.ok) {
      throw new Error(`Could not load sites (${response.status})`)
    }
    const body = (await response.json()) as { sites?: Site[] }
    if (!Array.isArray(body.sites) || body.sites.length === 0) {
      throw new Error('sites.json did not include any sites')
    }
    return body.sites
  })
  sitesRequest = pending
  pending.catch(() => {
    if (sitesRequest === pending) sitesRequest = null
  })
  return pending
}
