import type { Manifest } from '../types/science'

let manifestPromise: Promise<Manifest> | null = null

export function loadManifest(): Promise<Manifest> {
  if (manifestPromise) return manifestPromise
  const url = new URL('data/manifest.json', document.baseURI)
  const pending = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load the manifest (${response.status})`)
    }
    return (await response.json()) as Manifest
  })
  manifestPromise = pending
  pending.catch(() => {
    manifestPromise = null
  })
  return pending
}
