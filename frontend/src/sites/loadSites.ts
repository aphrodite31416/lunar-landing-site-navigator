import type { Site } from '../types/science'

export async function loadSites(): Promise<Site[]> {
  const response = await fetch('/data/sites.json')
  if (!response.ok) {
    throw new Error(`Could not load sites (${response.status})`)
  }
  const body = (await response.json()) as { sites?: Site[] }
  if (!Array.isArray(body.sites) || body.sites.length === 0) {
    throw new Error('sites.json did not include any sites')
  }
  return body.sites
}
