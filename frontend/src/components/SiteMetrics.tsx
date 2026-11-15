import type { ReactNode } from 'react'
import { exactSeconds, formatDuration, formatPercent, formatUtc } from '../science/format'
import { longestIsClipped } from '../science/timeline'
import type { TerrainScenario, VisibilityWindow } from '../types/science'

export function SiteMetrics({ scenario }: { scenario: TerrainScenario }) {
  const metrics = scenario.metrics
  const windows = scenario.windows
  const settings = scenario.model.settings
  const duration = scenario.period.duration_s
  const threshold = formatPercent(settings.minimum_sun_fraction, 0)
  const ofPeriod = (seconds: number) => (duration > 0 ? `${formatPercent(seconds / duration)} of the period` : null)

  return (
    <>
      <p className="terrain-science-note">
        Terrain-aware results for {formatUtc(scenario.period.start_utc)} – {formatUtc(scenario.period.end_utc)}.
        Durations are integrated over the exported samples within this period only.
      </p>
      <MetricGroup title={`Sunlight (≥ ${threshold} of the solar disc visible)`}>
        <DurationMetric
          label="Total sunlight"
          seconds={metrics.sunlight_s}
          extra={`${formatPercent(metrics.sunlight_time_fraction)} of the period`}
        />
        <LongestMetric label="Longest sunlight" seconds={metrics.longest_sunlight_s} windows={windows.sunlight} />
        <LongestMetric
          label={`Longest below ${threshold}`}
          seconds={metrics.longest_insufficient_light_s}
          windows={windows.insufficient_light}
        />
        <LongestMetric label="Longest darkness" seconds={metrics.longest_darkness_s} windows={windows.darkness} />
        <Metric label="Mean disc visible">{formatPercent(metrics.mean_sun_visible_fraction)}</Metric>
        <DurationMetric label="Full-disc equivalent" seconds={metrics.equivalent_full_disc_s} />
      </MetricGroup>
      <MetricGroup title="Earth line of sight (geometric)">
        <DurationMetric label="Total Earth visible" seconds={metrics.earth_visible_s} extra={ofPeriod(metrics.earth_visible_s)} />
        <LongestMetric label="Longest Earth gap" seconds={metrics.longest_earth_gap_s} windows={windows.earth_gap} />
      </MetricGroup>
      <MetricGroup title="Joint (sunlight and Earth line of sight together)">
        <DurationMetric label="Total joint" seconds={metrics.joint_s} extra={ofPeriod(metrics.joint_s)} />
        <LongestMetric label="Longest joint" seconds={metrics.longest_joint_s} windows={windows.joint} />
      </MetricGroup>
      <MetricGroup title="Energy">
        <Metric label="Panel energy">
          {metrics.energy_wh === null ? 'Not computed: this scenario has no panel model' : `${metrics.energy_wh.toFixed(1)} Wh`}
        </Metric>
      </MetricGroup>
      <div className="terrain-track-block">
        <p className="terrain-track-name">How to read these values</p>
        <ul className="terrain-track-list">
          <li>
            Sunlight is available when at least {threshold} of the solar disc ({settings.disc_samples} sampled points) is
            visible above terrain and not blocked by Earth. The disc fraction is not a fraction of time.
          </li>
          <li>
            Earth visibility means the Earth&apos;s centre is strictly above the local terrain horizon. It is geometric
            line of sight, not a guaranteed communication link.
          </li>
          <li>
            “Clipped” means the window touches the edge of the analysis period, so the real duration may be longer.
          </li>
          <li>
            {scenario.series.length.toLocaleString('en-US')} exported samples; the largest gap between samples is{' '}
            {formatDuration(scenario.quality.search_max_gap_s)}.
          </li>
        </ul>
      </div>
      {scenario.quality.warnings.length > 0 && (
        <div className="terrain-track-block">
          <p className="terrain-track-name">Model warnings</p>
          <ul className="terrain-track-list">
            {scenario.quality.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function MetricGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="terrain-track-block">
      <p className="terrain-track-name">{title}</p>
      <dl>{children}</dl>
    </div>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function DurationMetric({ label, seconds, extra }: { label: string; seconds: number; extra?: string | null }) {
  return (
    <Metric label={label}>
      <span title={exactSeconds(seconds)}>{formatDuration(seconds)}</span>
      {extra && ` · ${extra}`}
    </Metric>
  )
}

function LongestMetric({ label, seconds, windows }: { label: string; seconds: number; windows: VisibilityWindow[] }) {
  const clipped = longestIsClipped(windows, seconds)
  return (
    <DurationMetric
      label={label}
      seconds={seconds}
      extra={seconds === 0 ? 'none in this period' : clipped ? 'clipped, may be longer' : null}
    />
  )
}
