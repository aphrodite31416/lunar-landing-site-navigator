/** Scientific JSON v1. URLs are relative to the manifest's directory. */
export type SiteId = 'site01' | 'site04' | 'site07' | 'site11';
export type TerrainStatus = 'ready' | 'awaiting_horizon';

export interface Site {
  site_id: SiteId;
  name: string;
  latitude_deg: number;
  longitude_deg: number;
  coordinate_source: 'derived_from_authoritative_observer_xyz' | 'horizon_handoff';
  observer_xyz_m: [number, number, number];
  observer_radius_m: number;
  observer_height_m: number | null;
  frame: 'MOON_ME_DE421';
  geometry_url: string;
  horizon_url: string | null;
  scenario_url: string | null;
  terrain_status: TerrainStatus;
}

export interface VisibilitySample {
  offset_s: number;
  utc: string;
  sun_azimuth_deg: number | null;
  sun_elevation_deg: number | null;
  sun_clearance_deg: number | null;
  sun_horizon_deg: number | null;
  earth_azimuth_deg: number | null;
  earth_elevation_deg: number | null;
  earth_clearance_deg: number | null;
  earth_horizon_deg: number | null;
  sun_angular_radius_deg: number;
  sun_visible_fraction: number;
  sun_terrain_visible_fraction: number;
  sunlight_available: boolean;
  earth_center_visible: boolean;
  power_w: number | null;
}

export interface VisibilityWindow {
  start_utc: string;
  end_utc: string;
  start_offset_s: number;
  end_offset_s: number;
  duration_s: number;
  start_clipped: boolean;
  end_clipped: boolean;
}

export interface VisibilityEvent {
  kind: 'sunlight' | 'earth' | 'darkness';
  active_after: boolean;
  offset_s: number;
  utc: string;
}

export interface Settings {
  minimum_sun_fraction: number;
  disc_samples: number;
  search_max_step_s: number;
  event_tolerance_s: number;
}

export interface Panel {
  area_m2: number;
  efficiency: number;
  normal_enu: [number, number, number];
  irradiance_at_1au_w_m2: number;
}

export interface ScenarioMetrics {
  sunlight_s: number;
  sunlight_time_fraction: number;
  longest_sunlight_s: number;
  longest_insufficient_light_s: number;
  longest_darkness_s: number;
  earth_visible_s: number;
  longest_earth_gap_s: number;
  joint_s: number;
  longest_joint_s: number;
  mean_sun_visible_fraction: number;
  equivalent_full_disc_s: number;
  energy_wh: number | null;
}

export interface TerrainScenario {
  schema_version: '1.0';
  kind: 'terrain_scenario';
  site_id: SiteId;
  period: { start_utc: string; end_utc: string; duration_s: number };
  model: {
    frame: 'MOON_ME_DE421';
    abcorr: 'CN+S';
    refloc: 'OBSERVER';
    earth_visibility_criterion: 'centre_strictly_above_terrain';
    solar_visibility_model: 'sampled_disc_with_terrain_and_earth_occultation';
    vector_method: 'spice_spkcpo_cn+s' | 'linear_interpolation_of_handoff_vectors';
    settings: Settings;
    panel: Panel | null;
    sun_radius_m: number;
    earth_radius_m: number;
    integration: 'trapezoid_on_exported_samples';
    horizon_margin_deg: number;
  };
  provenance: { input_sha256: Record<string, string>; horizon_sha256: string; kernel_sha256: Record<string, string> };
  quality: { terrain_coverage: 'complete'; warnings: string[]; evaluation_count: number; search_max_gap_s: number };
  series: VisibilitySample[];
  windows: Record<'sunlight' | 'earth' | 'joint' | 'darkness' | 'insufficient_light' | 'earth_gap', VisibilityWindow[]>;
  events: VisibilityEvent[];
  metrics: ScenarioMetrics;
}

export interface BodyPositions {
  schema_version: '1.0';
  kind: 'body_positions';
  site_id: SiteId;
  frame: 'MOON_ME_DE421';
  abcorr: 'CN+S';
  terrain_applied: false;
  series: Pick<VisibilitySample, 'offset_s' | 'utc' | 'sun_azimuth_deg' | 'sun_elevation_deg' | 'earth_azimuth_deg' | 'earth_elevation_deg'>[];
  provenance: { input_sha256: Record<string, string> };
  warnings: string[];
}

export interface Mission {
  duration_s: number;
  landing_step_s: number;
  max_darkness_s: number | null;
  max_insufficient_light_s: number | null;
  max_earth_gap_s: number | null;
  min_sunlight_fraction: number | null;
  min_joint_s: number | null;
  min_energy_wh: number | null;
}

export interface Candidate {
  site_id: SiteId;
  landing_utc: string;
  mission_end_utc: string;
  start_offset_s: number;
  end_offset_s: number;
  metrics: Pick<ScenarioMetrics, 'sunlight_time_fraction' | 'joint_s' | 'longest_joint_s' | 'longest_darkness_s' | 'longest_insufficient_light_s' | 'longest_earth_gap_s' | 'mean_sun_visible_fraction' | 'energy_wh'>;
  feasible: boolean;
  violations: { constraint: keyof Mission; limit: number; actual: number | null; reason: 'panel_model_required' | 'constraint_not_met' }[];
  pareto_optimal: boolean;
}

export interface MissionPlan {
  schema_version: '1.0';
  kind: 'mission_plan';
  mission: Mission;
  search: { site_ids: SiteId[]; candidate_count: number; feasible_count: number; scope: string; ranking: string[]; pareto_objectives: string[] };
  status: 'feasible' | 'no_feasible_candidates' | 'awaiting_horizons';
  recommendations: Candidate[];
  candidates: Candidate[];
  available_site_ids?: SiteId[];
  missing_site_ids?: SiteId[];
  coverage_complete?: boolean;
  warnings?: string[];
  sensitivity?: { uniform_horizon_margin_deg: number; interpretation: string; lower_horizon_url: string; higher_horizon_url: string };
}

export interface HistoricalDaily {
  schema_version: '1.0';
  kind: 'historical_daily_aggregates';
  site_id: SiteId;
  period: { start_date: string; end_date: string };
  aggregation: 'sample_mean';
  solar_disc_samples: number;
  metrics: {
    sample_count: number;
    mean_sun_visible_fraction: number;
    sun_fraction_ge_0_8_sample_fraction: number;
    earth_center_visible_sample_fraction: number;
    sun_visible_fraction_min: number;
    sun_visible_fraction_max: number;
  };
  series: { date: string; mean_sun_visible_fraction: number; earth_center_visible_sample_fraction: number; partial_day: boolean }[];
  warnings: string[];
  provenance: { input_sha256: Record<string, string> };
}

export interface Manifest {
  schema_version: '1.0';
  status: 'ready' | 'awaiting_horizons';
  units: Record<string, string>;
  sites_url: string;
  planner_url: string;
  examples_url?: string;
  datasets: ({ id: string; start_utc: string; end_utc: string } & (
    { kind: 'terrain_scenarios'; site_ids: SiteId[]; scenarios: { site_id: SiteId; url: string; metrics: ScenarioMetrics }[]; missing_horizon_site_ids: SiteId[] } |
    { kind: 'historical_daily_aggregates'; sites: { site_id: SiteId; url: string; metrics: HistoricalDaily['metrics'] }[] }
  ))[];
  settings: Settings;
  kernel_sha256: Record<string, string>;
}
