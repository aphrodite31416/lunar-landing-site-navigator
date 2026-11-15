import { manifestUrl, type ScenarioDataset } from './loadManifest'
import { metricDifferences } from '../science/timeline'
import type { CompareSummary, Manifest } from '../types/science'

const windowKinds = ['sunlight', 'earth', 'joint', 'darkness', 'insufficient_light', 'earth_gap'] as const
const cache = new Map<string, Promise<CompareSummary>>()

/** The summary lives next to the dataset's scenario files. */
export function compareSummaryUrl(dataset: ScenarioDataset) {
  const first = dataset.scenarios[0]
  if (!first) throw new Error('The dataset lists no scenarios')
  return new URL('compare_summary.json', new URL(first.url, manifestUrl()))
}

/**
 * Loads the lightweight Compare summary and checks it against the manifest:
 * same dataset, period, threshold, sites, scenario URLs and metrics, and
 * well-formed window lists. Any mismatch throws, so the caller can fall back
 * to the full scenario files.
 */
export function loadCompareSummary(manifest: Manifest, dataset: ScenarioDataset): Promise<CompareSummary> {
  const url = compareSummaryUrl(dataset)
  const cached = cache.get(url.href)
  if (cached) return cached
  const pending = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`Could not load the comparison summary (${response.status})`)
    const summary = (await response.json()) as CompareSummary
    checkSummary(summary, manifest, dataset)
    return summary
  })
  cache.set(url.href, pending)
  pending.catch(() => cache.delete(url.href))
  return pending
}

function checkSummary(summary: CompareSummary, manifest: Manifest, dataset: ScenarioDataset) {
  const fail = (why: string) => {
    throw new Error(`The comparison summary does not match the manifest: ${why}`)
  }
  if (summary.kind !== 'compare_summary' || summary.schema_version !== '1.0') fail('unknown format')
  if (summary.dataset_id !== dataset.id || summary.start_utc !== dataset.start_utc || summary.end_utc !== dataset.end_utc) {
    fail('different dataset or period')
  }
  if (summary.settings?.minimum_sun_fraction !== manifest.settings.minimum_sun_fraction) fail('different sunlight threshold')
  if (!Array.isArray(summary.sites) || summary.sites.length !== dataset.scenarios.length) fail('different site count')
  for (const entry of dataset.scenarios) {
    const site = summary.sites.find((item) => item.site_id === entry.site_id)
    if (!site) return fail(`missing ${entry.site_id}`)
    if (site.scenario_url !== entry.url) fail(`${entry.site_id} scenario URL`)
    if (metricDifferences(site.metrics, entry.metrics).length > 0) fail(`${entry.site_id} metrics`)
    if (!(Number.isFinite(site.origin_offset_s) && site.end_offset_s > site.origin_offset_s)) fail(`${entry.site_id} offsets`)
    if (!Array.isArray(site.events)) fail(`${entry.site_id} events`)
    for (const kind of windowKinds) {
      const windows = site.windows?.[kind]
      if (!Array.isArray(windows)) return fail(`${entry.site_id} ${kind} windows`)
      let previous = -Infinity
      for (const w of windows) {
        if (!(w.start_offset_s >= previous && w.end_offset_s > w.start_offset_s)) fail(`${entry.site_id} ${kind} window order`)
        previous = w.end_offset_s
      }
    }
  }
}
