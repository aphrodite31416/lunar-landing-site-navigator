import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TerrainReadout } from './DataInspector'
import { VisibilityDefinitions } from './ScenarioTimeline'
import { formatPercent, formatUtc } from '../science/format'
import { loadHorizon } from '../sites/loadHorizon'
import {
  convergenceTargetDeg,
  ephemerisConsistency,
  formulaAudit,
  horizonConvergence,
  horizonUncertainty,
  moonRadiusM,
  nasaComparison,
  numericalEventShifts,
  site04OriginalProfile,
  spiceVsHorizons,
  terrainCoverage,
} from '../method/evidence'
import {
  ConvergenceChart,
  CoverageBars,
  DiscThreshold,
  HorizonGeometry,
  HorizonSourceStrip,
  NasaComparisonChart,
  UncertaintyChart,
  type SiteLabel,
} from '../method/MethodDiagrams'
import { dataSources, describeInput, repositoryHref } from '../method/sources'
import { manifestUrl } from '../sites/loadManifest'
import type { TerrainMesh } from '../terrain/buildGeometry'
import type { HeightSummary, TerrainMeta } from '../terrain/types'
import type { HorizonProfile, Site, SiteId, TerrainScenario } from '../types/science'

const sections = [
  { id: 'm-method', label: 'Method' },
  { id: 'm-sources', label: 'Data sources' },
  { id: 'm-validation', label: 'Validation' },
  { id: 'm-uncertainty', label: 'Uncertainty & limits' },
  { id: 'm-coverage', label: 'Terrain coverage' },
  { id: 'm-nasa', label: 'NASA map' },
  { id: 'm-provenance', label: 'Provenance' },
  { id: 'm-team', label: 'Team' },
  { id: 'm-inspector', label: 'Data inspector' },
] as const

const siteIds: SiteId[] = ['site01', 'site04', 'site07', 'site11']
const pct = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`
const range = (values: number[], digits: number, unit = '') => {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return lo === hi ? `${lo.toFixed(digits)}${unit}` : `${lo.toFixed(digits)}–${hi.toFixed(digits)}${unit}`
}
const shortHash = (hash: string) => `${hash.slice(0, 12)}…`

/**
 * Method and data: how the results are produced, where the data come from,
 * how they were checked and what they leave out. Settings are read from the
 * loaded scenario; validation figures come from method/evidence.ts, which
 * cites the repository file behind every value.
 */
export function MethodPage({
  site,
  sites,
  names,
  placeName,
  scenario,
  terrain,
  height,
  mesh,
  terrainError,
  heightError,
}: {
  site: Site | null
  sites: Site[]
  names: Partial<Record<SiteId, string>>
  placeName: string | null
  scenario: TerrainScenario | null
  terrain: TerrainMeta | null
  height: HeightSummary | null
  mesh: TerrainMesh | null
  terrainError: string | null
  heightError: string | null
}) {
  const pageRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState<string>(sections[0].id)
  const model = scenario?.model
  const settings = model?.settings
  const threshold = settings?.minimum_sun_fraction ?? 0.8

  const label: SiteLabel = (id) => ({
    short: sites.find((entry) => entry.site_id === id)?.name ?? id,
    place: names[id] ?? null,
  })
  const siteName = site ? `${site.name}${placeName ? ` · ${placeName}` : ''}` : 'the selected site'

  // Highlight the section being read in the contents list: the last one whose
  // heading has scrolled past the top quarter of the view.
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    // On narrow screens the page scrolls with the document instead of itself.
    const scroller: HTMLElement | Window = getComputedStyle(page).overflowY === 'visible' ? window : page
    let frame = 0
    const update = () => {
      frame = 0
      const top = scroller === window ? 0 : page.getBoundingClientRect().top
      const height = scroller === window ? window.innerHeight : page.clientHeight
      let current: string = sections[0].id
      for (const section of sections) {
        const element = page.querySelector(`#${section.id}`)
        if (element && element.getBoundingClientRect().top - top <= height * 0.25) current = section.id
      }
      const atEnd =
        scroller === window
          ? window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
          : page.scrollTop + page.clientHeight >= page.scrollHeight - 2
      setActive(atEnd ? sections[sections.length - 1].id : current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  // In the horizontal contents bar (tablet and phone), keep the current entry visible.
  useEffect(() => {
    const list = pageRef.current?.querySelector<HTMLElement>('.m-toc ol')
    const button = list?.querySelector<HTMLElement>('[aria-current]')
    if (!list || !button || list.scrollWidth <= list.clientWidth) return
    const listBox = list.getBoundingClientRect()
    const box = button.getBoundingClientRect()
    if (box.left < listBox.left || box.right > listBox.right - 32) {
      list.scrollTo({ left: list.scrollLeft + box.left - listBox.left - 16, behavior: 'smooth' })
    }
  }, [active])

  const jump = (id: string) => {
    const page = pageRef.current
    const element = page?.querySelector<HTMLElement>(`#${id}`)
    if (!page || !element) return
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (getComputedStyle(page).overflowY === 'visible') {
      element.scrollIntoView({ behavior, block: 'start' })
    } else {
      // Scroll only the page panel, not the whole app shell.
      const top = element.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop
      page.scrollTo({ top, behavior })
    }
    element.focus({ preventScroll: true })
  }

  // Do the validation records describe the data that is loaded?
  const check = useMemo(() => {
    if (!scenario) return null
    const id = scenario.site_id
    const horizonHash = scenario.provenance.horizon_sha256
    const ephemeris = ephemerisConsistency.sites[id]
    const ephemerisMatch =
      !!ephemeris &&
      Object.entries(ephemeris.inputSha256).every(([name, hash]) => scenario.provenance.input_sha256[name] === hash)
    return {
      id,
      convergence: horizonConvergence[id]?.horizonSha256 === horizonHash,
      uncertainty: horizonUncertainty[id]?.horizonSha256 === horizonHash,
      ephemeris: ephemerisMatch,
    }
  }, [scenario])
  const allMatch = !!check && check.convergence && check.uncertainty && check.ephemeris

  const directions = siteIds.map((id) => terrainCoverage[id].directions)
  const searchLimits = siteIds.map((id) => terrainCoverage[id].searchLimitKm)
  const farthest = siteIds.map((id) => terrainCoverage[id].farthestBlockerKm)
  const sigmaFar = siteIds.map((id) => horizonUncertainty[id].sigmaFarMedianDeg)
  const days = scenario ? Math.round(scenario.period.duration_s / 86400) : null

  return (
    <section ref={pageRef} className="atlas-page method" aria-labelledby="method-title">
      <div className="m-layout">
        <nav className="m-toc" aria-label="On this page">
          <p className="eyebrow">On this page</p>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={active === section.id ? 'location' : undefined}
                  onClick={() => jump(section.id)}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="m-body">
          <header className="m-hero">
            <p className="eyebrow">Method and data</p>
            <h1 id="method-title" className="page-title m-title">
              How the navigator decides what a lander can see
            </h1>
            <p className="m-lede">
              For each candidate site we rebuild the skyline from NASA terrain data, then follow the Sun and Earth
              across it, moment by moment, with JPL’s SPICE ephemerides. Every state, window and number in the
              navigator is read from those precomputed results. This page explains the method, the evidence behind
              it, and what it does not yet capture.
            </p>
            <dl className="m-facts">
              <div>
                <dt>Sites</dt>
                <dd>{sites.length || 4}</dd>
              </div>
              {days != null && (
                <div>
                  <dt>Analysis period</dt>
                  <dd>
                    {days} days
                  </dd>
                </div>
              )}
              <div>
                <dt>Observer height</dt>
                <dd>{site?.observer_height_m != null ? `${site.observer_height_m} m` : '—'}</dd>
              </div>
              <div>
                <dt>Sunlight</dt>
                <dd>≥ {formatPercent(threshold, 0)} of disc</dd>
              </div>
              <div>
                <dt>Horizon directions</dt>
                <dd>{range(directions, 0).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')}</dd>
              </div>
            </dl>
          </header>

          {/* ---------------------------------------------------------- 1 */}
          <Section id="m-method" kicker="01 · Scientific method" title="From terrain to timeline">
            <p className="m-p">
              The calculation runs in five stages. Only the last one happens in your browser; the scientific work is
              done once, in Python, and exported as validated JSON.
            </p>
            <ol className="m-flow">
              <FlowStep
                n="1"
                title="NASA terrain"
                summary="Laser-altimeter elevation maps of the south pole, finest near the site."
                facts={['5 m tile', '80 m mosaic', '240 m mosaic']}
              >
                Elevations come from a 5 m map around each site, then the 80 m and 240 m LOLA mosaics further out,
                blended across the seams. The site itself is the centroid of its largest NASA sunlit region, and the
                observer stands {site?.observer_height_m ?? 1} m above the ground along the local vertical.
              </FlowStep>
              <FlowStep
                n="2"
                title="Local horizon"
                summary="How high the terrain rises in every compass direction."
                facts={[`${range(directions, 0).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')} directions`, `rays to ${range(searchLimits, 0)} km`]}
              >
                Rays follow great circles on a sphere of radius {(moonRadiusM / 1000).toLocaleString('en-US')} km
                with the terrain added. Steps start at {terrainCoverage.site01.distanceStepsM[0]} m near the site
                and grow to {terrainCoverage.site01.distanceStepsM[2]} m far away (half that at Site04), and the
                highest peaks on each ray are re-sampled more finely. The search reaches {range(searchLimits, 0)} km,
                set from the Moon’s global elevation extremes; the farthest terrain that actually blocks the view is{' '}
                {range(farthest, 0)} km away.
              </FlowStep>
              <FlowStep
                n="3"
                title="SPICE ephemerides"
                summary="Where the Sun and Earth appear from the observer at each moment."
                facts={model ? [model.frame, model.abcorr] : ['MOON_ME_DE421', 'CN+S']}
              >
                Directions come from NASA JPL’s SPICE toolkit with the DE421 ephemeris in the matching lunar frame
                ({model?.frame ?? 'MOON_ME_DE421'}), corrected for light travel time and stellar aberration (
                {model?.abcorr ?? 'CN+S'}). They are converted to azimuth and elevation in the observer’s local
                frame.
              </FlowStep>
              <FlowStep
                n="4"
                title="Visibility"
                summary="Compare the Sun and Earth with the horizon behind them."
                facts={[
                  `≥ ${formatPercent(threshold, 0)} of disc`,
                  settings ? `${settings.disc_samples.toLocaleString('en-US')} disc samples` : 'sampled disc',
                  'Earth centre',
                ]}
              >
                The solar disc is sampled with {settings ? settings.disc_samples.toLocaleString('en-US') : 'many'}{' '}
                points; a moment counts as sunlight when at least {formatPercent(threshold, 0)} of it clears the
                terrain (and Earth). Earth is in view when its centre is strictly above the terrain horizon. Event
                times are refined between samples
                {settings ? ` (search step up to ${settings.search_max_step_s} s, tolerance ${settings.event_tolerance_s} s)` : ''}.
              </FlowStep>
              <FlowStep
                n="5"
                title="Interactive view"
                summary="The navigator replays the exported windows, events and samples."
                facts={scenario ? [`${scenario.series.length.toLocaleString('en-US')} samples`, `${scenario.events.length} events`] : ['windows', 'events']}
              >
                The browser does not recompute any physics. In or out of view comes from the exact exported windows
                at the chosen moment; continuous values such as elevation show the time of the sample they come from.
              </FlowStep>
            </ol>

            <div className="m-figrow">
              <HorizonGeometry />
              <DiscThreshold threshold={threshold} />
            </div>

            {scenario && (
              <details className="sci-details m-more">
                <summary>Exact definitions used in the exported data</summary>
                <VisibilityDefinitions scenario={scenario} />
              </details>
            )}
          </Section>

          {/* ---------------------------------------------------------- 2 */}
          <Section id="m-sources" kicker="02 · Data sources" title="Where the data come from">
            <p className="m-p">
              All terrain and illumination products are public NASA data. The NASA illumination map and JPL Horizons
              are used only to check our results, never as inputs.
            </p>
            <ul className="m-sources">
              {dataSources.map((source) => (
                <li key={source.id} className="m-source">
                  <span className={`m-role m-role-${source.role === 'Comparison' || source.role === 'Independent check' ? 'check' : 'input'}`}>
                    {source.role}
                  </span>
                  <div className="m-source-main">
                    <h3>{source.name}</h3>
                    <p className="m-source-provider">{source.provider}</p>
                    <p>{source.use}</p>
                    <p className="m-source-files">
                      {source.files.map((file) => (
                        <code key={file}>{file}</code>
                      ))}
                    </p>
                  </div>
                  <div className="m-source-ref">
                    {source.reference && <cite>{source.reference}</cite>}
                    {source.links.map((link) => (
                      <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          {/* ---------------------------------------------------------- 3 */}
          <Section id="m-validation" kicker="03 · Scientific validation" title="How the results were checked">
            <p className="m-p">
              Three independent checks cover different parts of the chain. Each one answers a specific question;
              none of them alone shows that the results are physically exact.
            </p>
            {check && (
              <p className={`m-check ${allMatch ? 'is-ok' : 'is-warn'}`} role="status">
                <span aria-hidden="true">{allMatch ? '✓' : '!'}</span>
                {allMatch
                  ? `Checked against the loaded ${label(check.id).short} scenario: its horizon and ephemeris fingerprints match the validation records below.`
                  : `The loaded ${label(check.id).short} scenario does not match every validation record (${[
                      !check.convergence && 'convergence',
                      !check.uncertainty && 'uncertainty',
                      !check.ephemeris && 'ephemeris',
                    ]
                      .filter(Boolean)
                      .join(', ')}). Treat those records as context only.`}
              </p>
            )}

            <article className="m-val">
              <header className="m-val-head">
                <span className="m-val-n">A</span>
                <div>
                  <h3>Horizon convergence</h3>
                  <p className="m-val-q">Is the terrain sampled finely enough?</p>
                </div>
                <span className="m-badge">All four released profiles pass</span>
              </header>
              <p className="m-p">
                Each horizon was recomputed with half the azimuth spacing and, separately, half the distance steps.
                The largest change in any direction stays below the {convergenceTargetDeg}° target at every site.
              </p>
              <ConvergenceChart label={label} />
              <p className="m-note">
                <strong>Site04 history.</strong> The first Site04 profile, traced at {site04OriginalProfile.raySpacingDeg}°
                spacing, had {site04OriginalProfile.exceededAzimuths} of{' '}
                {site04OriginalProfile.ofAzimuths.toLocaleString('en-US')} directions change by{' '}
                {site04OriginalProfile.maxDeg}°, just above the target. It was replaced by a finer profile (
                {horizonConvergence.site04.azimuthStepsDeg[1]}° spacing, half the distance steps), whose largest
                changes are {horizonConvergence.site04.azimuthMaxDeg}° and {horizonConvergence.site04.distanceMaxDeg}°.
                That refined profile is the one deployed here.
              </p>
              <Scope
                proves="Finer sampling of the terrain map would not change the horizon by more than the target."
                not="Whether the terrain map itself is accurate. Height errors in the DEM are a separate, larger effect (see Uncertainty)."
                source={<RepoLink path="terrain/data/derived/horizons/" label="terrain/data/derived/horizons/site_XX_checks.json" />}
              />
            </article>

            <article className="m-val">
              <header className="m-val-head">
                <span className="m-val-n">B</span>
                <div>
                  <h3>Independent check with JPL Horizons</h3>
                  <p className="m-val-q">Are the Sun and Earth directions right?</p>
                </div>
                <span className="m-badge">
                  max {spiceVsHorizons.maxAbsDiffDeg.toFixed(6)}° · {spiceVsHorizons.comparisons} comparisons
                </span>
              </header>
              <p className="m-p">
                The pipeline’s own geometry functions, run with the real DE421 kernels, were compared with JPL
                Horizons, which uses a different ephemeris (DE441) and its own lunar orientation. Sun and Earth
                directions at all {spiceVsHorizons.sites} sites and {spiceVsHorizons.epochs.length} epochs agree to
                within {spiceVsHorizons.maxAbsDiffDeg.toFixed(6)}°. This also rules out an azimuth-convention mix-up.
              </p>
              <ul className="m-epochs" aria-label="Epochs compared">
                {spiceVsHorizons.epochs.map((epoch) => (
                  <li key={epoch}>{epoch.replace('T', ' ').replace(/:00(\.0+)?Z?$/, '')} UTC</li>
                ))}
              </ul>
              <Scope
                proves="Sun and Earth directional geometry: ephemeris, frames, aberration and the local azimuth/elevation conversion."
                not="Terrain-horizon accuracy. Horizons knows nothing about the local terrain."
                source={<RepoLink path="terrain/data/derived/validation/spice_vs_horizons.json" />}
              />
            </article>

            <article className="m-val">
              <header className="m-val-head">
                <span className="m-val-n">C</span>
                <div>
                  <h3>Mathematical audit</h3>
                  <p className="m-val-q">Does the code do what the equations say?</p>
                </div>
                <span className="m-badge">{formulaAudit.testsPassed} tests pass</span>
              </header>
              <p className="m-p">
                Every one of the {formulaAudit.equationBlocks} displayed equation blocks in the mathematical
                documentation is mapped to the code and tests that implement it, and all{' '}
                {formulaAudit.functionsExercised} top-level functions are exercised.
              </p>
              <Scope
                proves="The implementation matches the documented mathematics."
                not="Physical accuracy. The audit says so itself."
                source={<RepoLink path="scientific/FORMULA_AUDIT.md" />}
              />
            </article>

            <details className="sci-details m-more">
              <summary>Pipeline self-consistency checks</summary>
              <dl className="m-kv">
                <Row label="Ephemeris handoff">
                  Handoff vectors versus SPICE recomputed with the same kernels: largest position error{' '}
                  {Math.max(...siteIds.map((id) => ephemerisConsistency.sites[id].maxErrorM))} m at{' '}
                  {ephemerisConsistency.sites.site01.epochs} epochs per site (tolerance {ephemerisConsistency.toleranceM} m).
                </Row>
                <Row label="Halved time step">
                  {siteIds.every((id) => numericalEventShifts[id].half_time_step === 0)
                    ? 'No event moved at any site.'
                    : siteIds.map((id) => `${label(id).short} ${numericalEventShifts[id].half_time_step.toFixed(1)} s`).join(' · ')}
                </Row>
                <Row label="Doubled disc samples">
                  {siteIds
                    .map((id) => `${label(id).short} ${numericalEventShifts[id].double_disc_samples.toFixed(1)} s`)
                    .join(' · ')}{' '}
                  largest event shift.
                </Row>
                <Row label="Scope">
                  These are numerical checks, not a physical timing confidence interval.
                  <span className="m-src">
                    <RepoLink path="data/processed/validation/release_summary.json" /> ·{' '}
                    <RepoLink path="data/processed/ephemeris_validation.json" />
                  </span>
                </Row>
              </dl>
            </details>
          </Section>

          {/* ---------------------------------------------------------- 4 */}
          <Section id="m-uncertainty" kicker="04 · Uncertainty and limitations" title="What the numbers do not include">
            <aside className="m-callout">
              <p className="m-callout-big">
                {range(sigmaFar, 2, '°')}
                <small>median horizon uncertainty from terrain height error</small>
              </p>
              <p>
                This uncertainty has <strong>not</strong> been propagated into the headline results
                {model ? ` (the horizon margin in the loaded scenario is ${model.horizon_margin_deg}°)` : ''}. Near
                the pole the Sun skims the horizon, so a small horizon change can move a sunrise or sunset by a long
                time. That effect depends on each event and has not been quantified, so the navigator shows no
                confidence interval on event times.
              </p>
            </aside>
            <p className="m-p">
              The estimate turns NASA’s published per-pixel height error for the 5 m maps into an angle at the
              terrain that blocks each direction. It applies only to directions blocked inside the 5 m tile at
              least 100 m away, about {range(siteIds.map((id) => horizonUncertainty[id].farSubsetShare * 100), 0)}%
              of each horizon. It is not a bound for the whole horizon.
            </p>
            <UncertaintyChart label={label} />

            <h3 className="m-h3">Modeling choices and their effect</h3>
            <ul className="m-limits">
              <Limit title="Terrain resolution">
                Terrain is 5 m near each site and 80 m or 240 m further away. Coarse grids round off narrow ridge
                tops, so distant horizons are probably slightly low, which would mean slightly more light and Earth
                visibility than reality.
              </Limit>
              <Limit title={`Observer height ${site?.observer_height_m ?? 1} m`}>
                Results apply to a point {site?.observer_height_m ?? 1} m above the ground. A taller lander, mast or
                panel sees a different horizon; NASA studies show that height changes the predicted light
                substantially.
              </Limit>
              <Limit title={`Sunlight threshold ${formatPercent(threshold, 0)}`}>
                “Sunlight” means at least {formatPercent(threshold, 0)} of the solar disc is visible, not any light.
                The disc is treated as uniformly bright (no limb darkening).
              </Limit>
              <Limit title="Earth visibility is geometric">
                Earth counts as visible when its centre clears the terrain. Earth is about 1.9° wide, so a partly
                visible Earth near the horizon counts as not visible. This is line of sight, not a radio link budget.
              </Limit>
              <Limit title="Limited analysis period">
                {scenario
                  ? `One month, ${formatUtc(scenario.period.start_utc)} to ${formatUtc(scenario.period.end_utc)}. `
                  : 'One month. '}
                Polar illumination follows a cycle of about 347 days and a longer 18.6-year cycle, so this month is
                not year-round. Long-term sunlight runs changed by about a point or less between 4 and 18.6 years;
                no long-term Earth-visibility result exists yet.
              </Limit>
            </ul>
            <details className="sci-details m-more">
              <summary>More assumptions</summary>
              <ul className="m-limits m-limits-small">
                <Limit title="Single point, radial vertical">
                  Each site is one point; “up” is the radial direction with no local slope. Horizons change quickly
                  near ridges, so results apply to that point, not the whole region.
                </Limit>
                <Limit title="Short events">
                  Shadows or lit periods shorter than the search step
                  {settings ? ` (${settings.search_max_step_s} s)` : ''} may be missed. The {settings?.event_tolerance_s ?? 1} s
                  event tolerance is numerical, not physical accuracy.
                </Limit>
                <Limit title="Not modeled">
                  Slope, roughness, boulders, temperature, dust, radiation and light reflected from the terrain.
                </Limit>
                <Limit title="Ephemeris and seams">
                  DE421 is older than DE440 but consistent with the lunar orientation kernel. Heights inside DEM
                  blend zones are synthetic; no site’s horizon is set by terrain in a blend zone.
                </Limit>
                <Limit title="Four sites">All near the south pole; results do not generalize to other latitudes.</Limit>
              </ul>
            </details>
            <p className="m-src">
              <RepoLink path="docs/scientific_validation_and_limitations.md" /> ·{' '}
              <RepoLink path="terrain/data/derived/validation/horizon_uncertainty.json" />
            </p>
          </Section>

          {/* ---------------------------------------------------------- 5 */}
          <Section id="m-coverage" kicker="05 · Terrain coverage" title="How much of each horizon is high-resolution">
            <p className="m-p">
              A horizon is only as good as the terrain that sets it. For each site, this shows which map the blocking
              terrain comes from in every direction. Select a site to see its horizon.
            </p>
            <CoverageSection label={label} sites={sites} initial={site?.site_id ?? 'site01'} />
          </Section>

          {/* ---------------------------------------------------------- 6 */}
          <Section id="m-nasa" kicker="06 · Comparison" title="Comparison with NASA’s illumination map">
            <p className="m-p">
              NASA’s map gives the long-term share of time any part of the Sun is visible, at 60 m resolution,
              averaged hourly over about 18.6 years. We ran our own horizons over the same kind of period and metric.
              Site07 agrees within a few points; at the other three sites our terrain gives more sunlight.
            </p>
            <NasaComparisonChart label={label} />
            <p className="m-note">
              These long-term runs used the original horizon profiles (0.05° rays at all sites), not the refined
              Site04 profile, and they are not the one-month values shown elsewhere in the navigator.
            </p>
            <div className="m-ledger">
              <div className="m-ledger-col is-verified">
                <h3>Verified</h3>
                <ul>
                  <li>
                    An independent rerun with real SPICE reproduces the team’s 5-minute long-term results to within
                    0.1 percentage point. No calculation error was found.
                  </li>
                  <li>
                    The averaging period is not the cause: 4 versus 18.6 years changes our values by{' '}
                    {range(siteIds.map((id) => Math.abs(nasaComparison[id].anyPart4yr - nasaComparison[id].anyPart186yr) * 100), 1)}{' '}
                    points.
                  </li>
                  <li>
                    The metric is not the cause: switching from “any part” to mean disc fraction moves our values by{' '}
                    {range(siteIds.map((id) => (nasaComparison[id].anyPart186yr - nasaComparison[id].meanDisc186yr) * 100), 1)}{' '}
                    points, not enough to close the gap.
                  </li>
                  <li>Site04’s value falls inside the range NASA’s map shows within ±120 m of the site.</li>
                </ul>
              </div>
              <div className="m-ledger-col is-open">
                <h3>Still under investigation</h3>
                <ul>
                  <li>
                    <strong>Terrain resolution is a possible explanation, not a confirmed cause.</strong> Our 5 m
                    terrain and 1 m observer differ from the 60 m terrain behind NASA’s map, and Barker et al. 2021
                    found that the newer, finer maps predict more light. This has not been tested with matched
                    inputs.
                  </li>
                  <li>The observer height assumed by NASA’s map has not been checked.</li>
                  <li>
                    Planned test: rerun Sites 01, 04 and 11 with the 80 m map only and a 0 m observer, and see whether
                    the results move toward NASA’s values.
                  </li>
                </ul>
              </div>
            </div>
            <p className="m-src">
              <RepoLink path="terrain/data/derived/validation/sun_visibility_periods.json" /> ·{' '}
              <RepoLink path="docs/terrain-validation.md" />
            </p>
          </Section>

          {/* ---------------------------------------------------------- 7 */}
          <Section id="m-provenance" kicker="07 · Provenance and settings" title="What produced the data you are looking at">
            {scenario && model && settings ? (
              <>
                <p className="m-p">
                  Settings and fingerprints for <strong>{siteName}</strong>, read from its scenario file. A SHA-256
                  fingerprint changes if a single byte of the input changes, so anyone can confirm these are the
                  validated files.
                </p>
                <dl className="m-kv m-settings">
                  <Row label="Period">
                    {formatUtc(scenario.period.start_utc)} – {formatUtc(scenario.period.end_utc)}
                  </Row>
                  <Row label="Sunlight">
                    At least {formatPercent(settings.minimum_sun_fraction, 0)} of the solar disc visible, estimated from{' '}
                    {settings.disc_samples.toLocaleString('en-US')} sample points across the disc.
                  </Row>
                  <Row label="Earth in view">Earth’s centre strictly above the terrain horizon.</Row>
                  <Row label="Event timing">
                    Searched with steps of up to {settings.search_max_step_s} s, then refined to{' '}
                    {settings.event_tolerance_s} s.
                  </Row>
                  <Row label="Geometry">
                    Lunar frame {model.frame}; light time and stellar aberration ({model.abcorr}); seen from the
                    observer.
                  </Row>
                  <Row label="Horizon margin">
                    {model.horizon_margin_deg}°, so terrain uncertainty is not added to the horizon.
                  </Row>
                  <Row label="Energy">
                    {model.panel ? 'A panel model is supplied.' : 'No panel model supplied, so no energy values are computed.'}
                  </Row>
                </dl>
                <ul className="m-prov">
                  <ProvRow name="Terrain horizon profile" detail="Horizon elevation in every direction" hash={scenario.provenance.horizon_sha256} />
                  {Object.entries(scenario.provenance.input_sha256).map(([name, hash]) => (
                    <ProvRow key={name} name={name} detail={describeInput(name)} hash={hash} />
                  ))}
                  {Object.entries(scenario.provenance.kernel_sha256).map(([name, hash]) => (
                    <ProvRow key={name} name={name} detail={describeInput(name)} hash={hash} />
                  ))}
                </ul>
              </>
            ) : (
              <p className="m-p m-dim">Loading the scenario…</p>
            )}
          </Section>

          {/* ---------------------------------------------------------- 8 */}
          <Section id="m-team" kicker="08 · Team" title="Team Outliers">
            <p className="m-p">Built for the NASA International Space Apps Challenge 2026.</p>
            <ul className="m-team">
              <TeamRow name="Tasneem">
                Team lead: overall coordination, frontend and data integration, development and deployment.
              </TeamRow>
              <TeamRow name="Esha">UI/UX design and the 3D frontend visualization.</TeamRow>
              <TeamRow name="Lucas">
                Terrain datasets, horizon processing and validation, including the convergence, JPL Horizons and NASA
                illumination-map checks.
              </TeamRow>
              <TeamRow name="Zarina">
                Led the scientific pipeline, from the mathematical visibility model to the formula audit.
              </TeamRow>
              <TeamRow name="Umar">Ephemerides and coordinate calculations with SPICE.</TeamRow>
              <TeamRow name="MaKenna">
                Scientific validation and aerospace analysis, including the scientific review of the model.
              </TeamRow>
            </ul>
            <h3 className="m-h3">Acknowledgments</h3>
            <p className="m-p">
              Terrain, sunlit regions and illumination maps: NASA Goddard Space Flight Center’s Planetary Geodesy
              Data Archive and the LOLA team. Ephemerides: NASA JPL’s Navigation and Ancillary Information Facility
              (SPICE). Independent check: JPL Solar System Dynamics (Horizons). Built with NumPy, SpiceyPy, React,
              Three.js and Vite.
            </p>
          </Section>

          {/* ---------------------------------------------------------- 9 */}
          <Section id="m-inspector" kicker="09 · Data inspector" title="Raw metadata">
            <p className="m-p">
              The exported settings, warnings, full fingerprints and the terrain readouts behind the 3D view, as they
              appear in the files.
            </p>
            <details className="sci-details m-inspector">
              <summary>Open the data inspector</summary>
              {scenario && model && settings && (
                <>
                  <h4 className="m-h4">Model</h4>
                  <dl className="method-dl method-dl-mono">
                    <Row label="model.frame">{model.frame}</Row>
                    <Row label="model.abcorr">{model.abcorr}</Row>
                    <Row label="model.refloc">{model.refloc}</Row>
                    <Row label="model.vector_method">{model.vector_method}</Row>
                    <Row label="model.solar_visibility_model">{model.solar_visibility_model}</Row>
                    <Row label="model.earth_visibility_criterion">{model.earth_visibility_criterion}</Row>
                    <Row label="model.integration">{model.integration}</Row>
                    <Row label="model.horizon_margin_deg">{model.horizon_margin_deg}</Row>
                    <Row label="model.sun_radius_m">{model.sun_radius_m}</Row>
                    <Row label="model.earth_radius_m">{model.earth_radius_m}</Row>
                    <Row label="settings.minimum_sun_fraction">{settings.minimum_sun_fraction}</Row>
                    <Row label="settings.disc_samples">{settings.disc_samples}</Row>
                    <Row label="settings.search_max_step_s">{settings.search_max_step_s}</Row>
                    <Row label="settings.event_tolerance_s">{settings.event_tolerance_s}</Row>
                    <Row label="quality.terrain_coverage">{scenario.quality.terrain_coverage}</Row>
                    <Row label="quality.evaluation_count">{scenario.quality.evaluation_count}</Row>
                    <Row label="quality.search_max_gap_s">{scenario.quality.search_max_gap_s}</Row>
                    <Row label="series.length">{scenario.series.length}</Row>
                  </dl>
                  {scenario.quality.warnings.length > 0 && (
                    <>
                      <h4 className="m-h4">Warnings stated by the model</h4>
                      <ul className="sci-explain">
                        {scenario.quality.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <h4 className="m-h4">Provenance (SHA-256)</h4>
                  <dl className="method-dl method-dl-mono">
                    <Row label="horizon_sha256">{scenario.provenance.horizon_sha256}</Row>
                    {Object.entries(scenario.provenance.input_sha256).map(([name, hash]) => (
                      <Row key={name} label={name}>
                        {hash}
                      </Row>
                    ))}
                    {Object.entries(scenario.provenance.kernel_sha256).map(([name, hash]) => (
                      <Row key={name} label={name}>
                        {hash}
                      </Row>
                    ))}
                  </dl>
                </>
              )}
              <h4 className="m-h4">Terrain tile</h4>
              <div className="terrain-readout method-readout">
                <TerrainReadout terrain={terrain} height={height} mesh={mesh} error={terrainError} heightError={heightError} />
              </div>
            </details>
          </Section>
        </div>
      </div>
    </section>
  )
}

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="m-section" aria-labelledby={`${id}-h`} tabIndex={-1}>
      <p className="m-kicker">{kicker}</p>
      <h2 id={`${id}-h`} className="m-h2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function FlowStep({ n, title, summary, facts, children }: { n: string; title: string; summary: string; facts: string[]; children: ReactNode }) {
  return (
    <li className="m-step">
      <span className="m-step-n" aria-hidden="true">
        {n}
      </span>
      <div className="m-step-body">
        <h3>{title}</h3>
        <p className="m-step-sum">{summary}</p>
        <p className="m-step-facts">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
        <details className="m-step-more">
          <summary>How</summary>
          <p>{children}</p>
        </details>
      </div>
    </li>
  )
}

function Scope({ proves, not, source }: { proves: string; not: string; source: ReactNode }) {
  return (
    <dl className="m-scope">
      <div>
        <dt>Shows</dt>
        <dd>{proves}</dd>
      </div>
      <div>
        <dt>Does not show</dt>
        <dd>{not}</dd>
      </div>
      <div className="m-scope-src">
        <dt>Source</dt>
        <dd>{source}</dd>
      </div>
    </dl>
  )
}

/** A repository path shown as a link to the published file or folder. */
function RepoLink({ path, label }: { path: string; label?: string }) {
  return (
    <a className="m-repo" href={repositoryHref(path)} target="_blank" rel="noreferrer">
      <code>{label ?? path}</code>
      <span className="sr-only"> (repository, opens in a new tab)</span>
    </a>
  )
}

function Limit({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="m-limit">
      <h4>{title}</h4>
      <p>{children}</p>
    </li>
  )
}

function TeamRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li>
      <span className="m-team-name">{name}</span>
      <span>{children}</span>
    </li>
  )
}

function ProvRow({ name, detail, hash }: { name: string; detail: string; hash: string }) {
  return (
    <li>
      <span className="m-prov-name">
        <b>{name}</b>
        <small>{detail}</small>
      </span>
      <code title={hash}>{shortHash(hash)}</code>
    </li>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Coverage bars for every site, plus the horizon of the chosen one. */
function CoverageSection({ label, sites, initial }: { label: SiteLabel; sites: Site[]; initial: SiteId }) {
  const [focus, setFocus] = useState<SiteId>(initial)
  const [horizon, setHorizon] = useState<{ id: SiteId; profile: HorizonProfile } | null>(null)
  const [failed, setFailed] = useState<SiteId | null>(null)
  const url = sites.find((entry) => entry.site_id === focus)?.horizon_url ?? null

  useEffect(() => {
    if (!url) return
    let cancelled = false
    loadHorizon(url)
      .then((profile) => {
        if (!cancelled) setHorizon({ id: focus, profile })
      })
      .catch(() => {
        if (!cancelled) setFailed(focus)
      })
    return () => {
      cancelled = true
    }
  }, [url, focus])

  const cov = terrainCoverage[focus]
  const unc = horizonUncertainty[focus]
  const names = label(focus)
  const inTile = cov.tileCount / cov.directions
  const shares = (Object.keys(terrainCoverage) as SiteId[]).map((id) => terrainCoverage[id].tileCount / terrainCoverage[id].directions)
  const lowest = inTile === Math.min(...shares)
  const highest = inTile === Math.max(...shares)

  return (
    <div className="m-coverage">
      <CoverageBars label={label} focus={focus} onFocus={setFocus} />
      <div className="m-focus" aria-live="polite">
        <h3 className="m-h3">
          {names.short}
          {names.place && <span> · {names.place}</span>}
        </h3>
        {horizon?.id === focus ? (
          <HorizonSourceStrip horizon={horizon.profile} />
        ) : failed === focus ? (
          <p className="m-dim">The horizon profile could not be loaded.</p>
        ) : (
          <div className="m-strip-loading" aria-hidden="true" />
        )}
        <ul className="m-considerations">
          <li>
            <b>{pct(inTile, 0)}</b> of {cov.directions.toLocaleString('en-US')} directions are set by terrain inside
            the 5 m tile{highest ? ', the most of the four sites' : lowest ? ', the fewest of the four sites' : ''}.
            The rest comes from the 80 m and 240 m mosaics, which have no error map; there a 1 m height error moves
            the horizon by about {unc.mosaicDegPerMetreMedian}° (median blocker {unc.mosaicMedianDistanceKm.toFixed(0)} km
            away).
          </li>
          <li>
            <b>{pct(unc.nearShare, 0)}</b> of directions are blocked within 100 m. These mostly look down at nearby
            ground (median horizon {unc.nearHorizonMedianDeg.toFixed(1).replace('-', '−')}°), well below the Sun and Earth, but their
            estimated uncertainty is large (median {unc.sigmaNearMedianDeg.toFixed(2)}°).
          </li>
          <li>
            For blockers in the tile at least 100 m away ({pct(unc.farSubsetShare, 0)} of directions), the median
            uncertainty is <b>{unc.sigmaFarMedianDeg.toFixed(2)}°</b>
            {unc.sigmaFarMedianDeg === Math.max(...siteIds.map((id) => horizonUncertainty[id].sigmaFarMedianDeg))
              ? ', the largest of the four sites'
              : unc.sigmaFarMedianDeg === Math.min(...siteIds.map((id) => horizonUncertainty[id].sigmaFarMedianDeg))
                ? ', the smallest of the four sites'
                : ''}
            .
          </li>
          {lowest && (
            <li>
              With the least high-resolution coverage, the project’s validation notes rate this the least certain of
              the four horizons.
            </li>
          )}
        </ul>
        <p className="m-src">
          Counted from the{' '}
          {url ? (
            <a href={new URL(url, manifestUrl()).href} target="_blank" rel="noreferrer">
              deployed horizon file<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            'deployed horizon file'
          )}{' '}
          · uncertainty from <RepoLink path="terrain/data/derived/validation/horizon_uncertainty.json" />
        </p>
      </div>
    </div>
  )
}
