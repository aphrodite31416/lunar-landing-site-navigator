import { useEffect, useState } from 'react'
import { loadScenario } from '../sites/loadScenario'
import type { Site, TerrainScenario, VisibilitySample } from '../types/science'

export function SiteScience({ site }: { site: Site }) {
  const [scenario, setScenario] = useState<TerrainScenario | null>(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scenarioUrl = site.site_id === 'site01' ? site.scenario_url : null

  useEffect(() => {
    if (!scenarioUrl || site.terrain_status !== 'ready') return
    let cancelled = false
    setLoading(true)
    setError(null)
    loadScenario(scenarioUrl)
      .then((loaded) => {
        if (cancelled) return
        if (loaded.site_id !== 'site01') {
          setError('The scenario file is not for Site 01')
          return
        }
        setScenario(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageFrom(caught, 'Could not load the Site 01 timeline'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scenarioUrl, site.terrain_status])

  if (site.site_id !== 'site01') {
    return (
      <aside className="terrain-science">
        <p>Time readout is available for Site 01.</p>
      </aside>
    )
  }

  if (!scenarioUrl || site.terrain_status !== 'ready') {
    return (
      <aside className="terrain-science">
        <p>Site 01 has no scenario file yet.</p>
      </aside>
    )
  }

  const sample = scenario ? scenario.series[Math.min(index, scenario.series.length - 1)] : null

  return (
    <aside className="terrain-science" aria-label="Site 01 time">
      <p className="terrain-science-title">{site.name} time</p>
      {error && <p className="terrain-readout-status">{error}</p>}
      {loading && !sample && <p>Loading the Site 01 timeline…</p>}
      {scenario && sample && (
        <Timeline scenario={scenario} sample={sample} index={index} onIndex={setIndex} />
      )}
    </aside>
  )
}

function Timeline({
  scenario,
  sample,
  index,
  onIndex,
}: {
  scenario: TerrainScenario
  sample: VisibilitySample
  index: number
  onIndex: (index: number) => void
}) {
  const last = scenario.series.length - 1
  const utc = formatUtc(sample.utc)

  return (
    <>
      <p className="terrain-science-period">
        {formatUtc(scenario.period.start_utc)} – {formatUtc(scenario.period.end_utc)}
      </p>
      <label className="terrain-science-time">
        Time
        <span className="terrain-exaggeration-row">
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={Math.min(index, last)}
            aria-valuetext={utc}
            onChange={(event) => onIndex(Number(event.target.value))}
          />
        </span>
      </label>
      <p className="terrain-science-utc">{utc}</p>
      <p className="terrain-science-note">
        Sample {index + 1} of {scenario.series.length}. Each step is one exported sample.
      </p>
      <div className="terrain-science-chips">
        <p className={sample.sunlight_available ? 'terrain-chip terrain-chip-on' : 'terrain-chip'}>
          {sample.sunlight_available ? 'Sunlit' : 'Not sunlit'}
        </p>
        <p className={sample.earth_center_visible ? 'terrain-chip terrain-chip-on' : 'terrain-chip'}>
          {sample.earth_center_visible ? 'Earth visible' : 'Earth not visible'}
        </p>
      </div>
      <dl>
        <div>
          <dt>Solar disc visible</dt>
          <dd>{formatPercent(sample.sun_visible_fraction)}</dd>
        </div>
        <div>
          <dt>Sun azimuth</dt>
          <dd>{formatAngle(sample.sun_azimuth_deg)}</dd>
        </div>
        <div>
          <dt>Sun elevation</dt>
          <dd>{formatAngle(sample.sun_elevation_deg)}</dd>
        </div>
        <div>
          <dt>Earth azimuth</dt>
          <dd>{formatAngle(sample.earth_azimuth_deg)}</dd>
        </div>
        <div>
          <dt>Earth elevation</dt>
          <dd>{formatAngle(sample.earth_elevation_deg)}</dd>
        </div>
        <div>
          <dt>Panel</dt>
          <dd>{sample.power_w === null ? 'No panel was calculated' : `${sample.power_w} W`}</dd>
        </div>
      </dl>
    </>
  )
}

function formatUtc(utc: string) {
  if (!utc.endsWith('Z')) return utc
  return `${utc.slice(0, -1).replace('T', ' ')} UTC`
}

function formatAngle(value: number | null) {
  if (value === null) return 'Undefined'
  return `${value.toFixed(2)}°`
}

function formatPercent(fraction: number) {
  return `${(fraction * 100).toFixed(1)}%`
}

function messageFrom(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}
