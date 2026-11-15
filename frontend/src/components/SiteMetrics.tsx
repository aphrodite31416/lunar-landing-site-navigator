import type { ReactNode } from 'react'
import { exactSeconds, formatDuration, formatDurationCompact, formatPercent, formatUtc } from '../science/format'
import { longestIsClipped } from '../science/timeline'
import type { TerrainScenario, VisibilityWindow } from '../types/science'

type Tone = 'sun' | 'earth' | 'joint' | 'energy'

export function SiteMetrics({ scenario }: { scenario: TerrainScenario }) {
  const metrics = scenario.metrics
  const windows = scenario.windows
  const settings = scenario.model.settings
  const duration = scenario.period.duration_s
  const threshold = formatPercent(settings.minimum_sun_fraction, 0)
  const share = (seconds: number) => (duration > 0 ? seconds / duration : 0)

  return (
    <>
      <p className="terrain-science-note">
        Terrain-aware results for {formatUtc(scenario.period.start_utc)} – {formatUtc(scenario.period.end_utc)}.
        Durations are integrated over the exported samples within this period only.
      </p>

      <section className="sci-section" aria-labelledby="metrics-overview-title">
        <h3 className="sci-section-title" id="metrics-overview-title">
          Share of the period
        </h3>
        <div className="metrics-overview">
          <OverviewTile
            tone="sun"
            label={`Sunlight ≥ ${threshold}`}
            value={formatPercent(metrics.sunlight_time_fraction)}
            bar={metrics.sunlight_time_fraction}
            detail={formatDurationCompact(metrics.sunlight_s)}
          />
          <OverviewTile
            tone="earth"
            label="Earth line of sight"
            value={formatPercent(share(metrics.earth_visible_s))}
            bar={share(metrics.earth_visible_s)}
            detail={formatDurationCompact(metrics.earth_visible_s)}
          />
          <OverviewTile
            tone="joint"
            label="Sunlight + Earth"
            value={formatPercent(share(metrics.joint_s))}
            bar={share(metrics.joint_s)}
            detail={formatDurationCompact(metrics.joint_s)}
          />
        </div>
      </section>

      <MetricGroup tone="sun" title={`Sunlight (≥ ${threshold} of the solar disc visible)`}>
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

      <MetricGroup tone="earth" title="Earth line of sight (geometric)">
        <DurationMetric
          label="Total Earth visible"
          seconds={metrics.earth_visible_s}
          extra={`${formatPercent(share(metrics.earth_visible_s))} of the period`}
        />
        <LongestMetric label="Longest Earth gap" seconds={metrics.longest_earth_gap_s} windows={windows.earth_gap} />
      </MetricGroup>

      <MetricGroup tone="joint" title="Joint (sunlight and Earth together)">
        <DurationMetric
          label="Total joint"
          seconds={metrics.joint_s}
          extra={`${formatPercent(share(metrics.joint_s))} of the period`}
        />
        <LongestMetric label="Longest joint" seconds={metrics.longest_joint_s} windows={windows.joint} />
      </MetricGroup>

      <MetricGroup tone="energy" title="Energy">
        <Metric label="Panel energy">
          {metrics.energy_wh === null
            ? 'Not computed: this scenario has no panel model'
            : `${metrics.energy_wh.toFixed(1)} Wh`}
        </Metric>
      </MetricGroup>

      <details className="sci-details">
        <summary>How to read these values</summary>
        <ul className="sci-explain">
          <li>
            <strong className="tone-sun">Sunlight</strong> is available when at least {threshold} of the solar disc (
            {settings.disc_samples.toLocaleString('en-US')} sampled points) is above terrain and not blocked by Earth.
            The disc fraction is not a fraction of time.
          </li>
          <li>
            <strong className="tone-earth">Earth line of sight</strong> means Earth&apos;s centre is strictly above the
            local terrain horizon. It is geometric visibility, not a guaranteed radio link.
          </li>
          <li>
            <strong className="tone-joint">Joint</strong> means both hold at the same time — useful for sunlit operations
            with Earth contact.
          </li>
          <li>
            “Clipped” means the window touches the edge of the analysis period, so the real duration may be longer.
          </li>
          <li>
            {scenario.series.length.toLocaleString('en-US')} exported samples; the largest gap between samples is{' '}
            {formatDuration(scenario.quality.search_max_gap_s)}.
          </li>
        </ul>
      </details>

      {scenario.quality.warnings.length > 0 && (
        <details className="sci-details">
          <summary>Model warnings</summary>
          <ul className="sci-explain">
            {scenario.quality.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function OverviewTile({
  tone,
  label,
  value,
  bar,
  detail,
}: {
  tone: Tone
  label: string
  value: string
  bar: number
  detail: string
}) {
  return (
    <div className={`metrics-tile metrics-tile-${tone}`}>
      <p className="metrics-tile-label">{label}</p>
      <p className="metrics-tile-value">{value}</p>
      <span className="cmp-bar" aria-hidden="true">
        <span className="cmp-bar-fill" style={{ width: `${Math.min(100, Math.max(0, bar) * 100)}%` }} />
      </span>
      <p className="metrics-tile-detail" title={detail}>
        {detail}
      </p>
    </div>
  )
}

function MetricGroup({ tone, title, children }: { tone: Tone; title: string; children: ReactNode }) {
  return (
    <section className={`sci-section metrics-group metrics-group-${tone}`} aria-label={title}>
      <h3 className="sci-section-title">{title}</h3>
      <dl className="metrics-list">{children}</dl>
    </section>
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
