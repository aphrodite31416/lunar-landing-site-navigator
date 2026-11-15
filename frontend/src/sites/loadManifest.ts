import type { Manifest } from '../types/science'

export type ScenarioDataset = Extract<Manifest['datasets'][number], { kind: 'terrain_scenarios' }>

let manifestRequest: Promise<Manifest> | null = null

function manifestUrl() {
  return new URL('data/manifest.json', document.baseURI)
}

export function loadManifest(): Promise<Manifest> {
  if (manifestRequest) return manifestRequest
  const pending = fetch(manifestUrl()).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load the manifest (${response.status})`)
    }
    const manifest = (await response.json()) as Manifest
    if (!Array.isArray(manifest.datasets)) {
      throw new Error('manifest.json did not include any datasets')
    }
    return manifest
  })
  manifestRequest = pending
  pending.catch(() => {
    if (manifestRequest === pending) manifestRequest = null
  })
  return pending
}

/**
 * The terrain-scenario dataset that contains the given scenario URL. Historical
 * datasets are never returned, so their sample statistics cannot be mixed in.
 */
export function scenarioDatasetFor(manifest: Manifest, scenarioUrl: string | null): ScenarioDataset | null {
  const datasets = manifest.datasets.filter(
    (dataset): dataset is ScenarioDataset => dataset.kind === 'terrain_scenarios',
  )
  if (scenarioUrl) {
    const target = new URL(scenarioUrl, manifestUrl()).href
    const match = datasets.find((dataset) =>
      dataset.scenarios.some((entry) => new URL(entry.url, manifestUrl()).href === target),
    )
    if (match) return match
  }
  return datasets.length === 1 ? datasets[0] : null
}
