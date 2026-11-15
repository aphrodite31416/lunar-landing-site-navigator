/**
 * Validation evidence for the Method & data page.
 *
 * Values were extracted programmatically from the repository files named in
 * each comment (not typed by hand). Most of those files are validation outputs
 * that are not shipped with the app, so the page cites them by path. Records
 * that carry a horizon or input SHA-256 are checked on the page against the
 * loaded scenario, so a stale record is flagged instead of shown as current.
 * Update this file whenever those validation outputs are regenerated.
 */
import type { SiteId } from '../types/science'

export const convergenceTargetDeg = 0.01

/** Radius of the reference sphere (R_m in the deployed horizon files) */
export const moonRadiusM = 1737400.0

/** terrain/data/derived/horizons/site_XX_checks.json (released profiles) */
export const horizonConvergence: Record<SiteId, {
  azimuthStepsDeg: [number, number]
  azimuthMaxDeg: number
  azimuthCount: number
  azimuthAbove: number
  distanceMaxDeg: number
  distanceAbove: number
  pass: boolean
  horizonSha256: string
}> = {
  "site01": {
    "azimuthStepsDeg": [
      0.025,
      0.05
    ],
    "azimuthMaxDeg": 0.005,
    "azimuthCount": 7200,
    "azimuthAbove": 0,
    "distanceMaxDeg": 0.0013,
    "distanceAbove": 0,
    "pass": true,
    "horizonSha256": "7a3ca70531ef4aabebbb1fbdb0def7d82e51b47521bf1707a962ebc3cdd4cb8e"
  },
  "site04": {
    "azimuthStepsDeg": [
      0.0125,
      0.025
    ],
    "azimuthMaxDeg": 0.0064,
    "azimuthCount": 14400,
    "azimuthAbove": 0,
    "distanceMaxDeg": 0.0058,
    "distanceAbove": 0,
    "pass": true,
    "horizonSha256": "8bdde2bd749ead1f5216090f996d9a33ec71971dc688df081d4054d9d9da05be"
  },
  "site07": {
    "azimuthStepsDeg": [
      0.025,
      0.05
    ],
    "azimuthMaxDeg": 0.0049,
    "azimuthCount": 7200,
    "azimuthAbove": 0,
    "distanceMaxDeg": 0.002,
    "distanceAbove": 0,
    "pass": true,
    "horizonSha256": "19f223c154890afd44bd37aa7289a342497e828129b2982b118c05750fc36b87"
  },
  "site11": {
    "azimuthStepsDeg": [
      0.025,
      0.05
    ],
    "azimuthMaxDeg": 0.0058,
    "azimuthCount": 7200,
    "azimuthAbove": 0,
    "distanceMaxDeg": 0.0033,
    "distanceAbove": 0,
    "pass": true,
    "horizonSha256": "bd240659c5e574b16dec1759c0f229433478ce0beb0c6951b0bb39a614a99c07"
  }
}

/**
 * The superseded first Site04 profile (0.05° rays): 2 of 7,200 azimuths changed
 * by 0.0104° (docs/scientific_validation_and_limitations.md). The released
 * profile was recomputed with 0.025° rays and half the distance steps
 * (docs/terrain-validation.md, terrain/data/derived/horizons/README.md).
 */
export const site04OriginalProfile = { exceededAzimuths: 2, ofAzimuths: 7200, maxDeg: 0.0104, raySpacingDeg: 0.05 }

/** terrain/data/derived/validation/spice_vs_horizons.json */
export const spiceVsHorizons = {
  "maxAbsDiffDeg": 1.1e-05,
  "comparisons": 40,
  "epochs": [
    "2026-11-14 00:00",
    "2026-11-20 06:00",
    "2026-12-01 12:00",
    "2027-03-15 18:00",
    "2027-06-21 00:00"
  ],
  "sites": 4
}

/** data/processed/ephemeris_validation.json: handoff vectors vs recomputed spkcpo, same kernels */
export const ephemerisConsistency: {
  toleranceM: number
  sites: Record<SiteId, { epochs: number; maxErrorM: number; pass: boolean; inputSha256: Record<string, string> }>
} = {
  "toleranceM": 1.0,
  "sites": {
    "site01": {
      "epochs": 17,
      "maxErrorM": 0.0,
      "pass": true,
      "inputSha256": {
        "ephemeris_site01.json": "975b59cd692a1073d0e490937af9217fc71348096302c2bc36f61ecbf52126d4",
        "ephemeris_site01.npz": "32b5b3bd3404b85332e92418ef055fd75de0558afb70f37edd7e100da17ad86a"
      }
    },
    "site04": {
      "epochs": 17,
      "maxErrorM": 0.0,
      "pass": true,
      "inputSha256": {
        "ephemeris_site04.json": "14a19ac5422da857e595322bbf5481b7a5b9466377db408c5efa661f7467bb7a",
        "ephemeris_site04.npz": "a4b2a94aa87fb2d3013fdfa5d4e680cbfa696a6bce4385598c42930f9a9cbe97"
      }
    },
    "site07": {
      "epochs": 17,
      "maxErrorM": 0.0,
      "pass": true,
      "inputSha256": {
        "ephemeris_site07.json": "dcfda70b601dde1d27f4232a34090fa5c560ce36c9e41aed272dcc9ba3946002",
        "ephemeris_site07.npz": "d2404deba113671d4a6678a99720b266894ba42bc77a3baa51ebf8d779b9e2c8"
      }
    },
    "site11": {
      "epochs": 17,
      "maxErrorM": 0.0,
      "pass": true,
      "inputSha256": {
        "ephemeris_site11.json": "a49a890378eb8f2fd292dca90cd0e66b097d1f02376bc859dd9fb9ee54abe568",
        "ephemeris_site11.npz": "c0b60f3d9df5fce6f4b585f9dc831759d4f51e66264cb2b38758c2e99a31ad2c"
      }
    }
  }
}

/** data/processed/validation/release_summary.json: event shifts (s) when the time step is halved or the disc samples doubled */
export const numericalEventShifts: Record<SiteId, { half_time_step: number; double_disc_samples: number }> = {
  "site01": {
    "half_time_step": 0.0,
    "double_disc_samples": 0.0
  },
  "site04": {
    "half_time_step": 0.0,
    "double_disc_samples": 26.367187507101335
  },
  "site07": {
    "half_time_step": 0.0,
    "double_disc_samples": 0.0
  },
  "site11": {
    "half_time_step": 0.0,
    "double_disc_samples": 0.0
  }
}

/**
 * Terrain coverage of each released horizon, counted from the deployed
 * horizon files (frontend/public/data/horizons/siteXX.json): directions whose
 * blocking terrain lies within 100 m, elsewhere inside the 5 m site tile, or
 * beyond it in the 80 m / 240 m mosaics.
 */
export const terrainCoverage: Record<SiteId, {
  directions: number
  azimuthStepDeg: number
  nearCount: number
  tileCount: number
  blendZoneCount: number
  farthestBlockerKm: number
  searchLimitKm: number
  horizonMinDeg: number
  horizonMaxDeg: number
  demSources: string[]
  distanceStepsM: number[]
  bandEdgesKm: number[]
}> = {
  "site01": {
    "directions": 7200,
    "azimuthStepDeg": 0.05,
    "nearCount": 2611,
    "tileCount": 4003,
    "blendZoneCount": 0,
    "farthestBlockerKm": 198.6,
    "searchLimitKm": 461.0,
    "horizonMinDeg": -2.6157,
    "horizonMaxDeg": 0.3536,
    "demSources": [
      "Site01_final_adj_5mpp_surf.tif",
      "LDEM_80S_80MPP_ADJ.TIF",
      "LDEM_60S_240MPP_ADJ.TIF"
    ],
    "distanceStepsM": [
      2.5,
      40.0,
      120.0
    ],
    "bandEdgesKm": [
      15.0,
      300.0
    ]
  },
  "site04": {
    "directions": 14400,
    "azimuthStepDeg": 0.025,
    "nearCount": 3856,
    "tileCount": 6957,
    "blendZoneCount": 0,
    "farthestBlockerKm": 120.9,
    "searchLimitKm": 459.0,
    "horizonMinDeg": -2.5536,
    "horizonMaxDeg": 1.2991,
    "demSources": [
      "Site04_final_adj_5mpp_surf.tif",
      "LDEM_80S_80MPP_ADJ.TIF",
      "LDEM_60S_240MPP_ADJ.TIF"
    ],
    "distanceStepsM": [
      1.25,
      20.0,
      60.0
    ],
    "bandEdgesKm": [
      15.0,
      300.0
    ]
  },
  "site07": {
    "directions": 7200,
    "azimuthStepDeg": 0.05,
    "nearCount": 2556,
    "tileCount": 5014,
    "blendZoneCount": 0,
    "farthestBlockerKm": 161.9,
    "searchLimitKm": 458.3,
    "horizonMinDeg": -2.5347,
    "horizonMaxDeg": -0.2756,
    "demSources": [
      "Site07_final_adj_5mpp_surf.tif",
      "LDEM_80S_80MPP_ADJ.TIF",
      "LDEM_60S_240MPP_ADJ.TIF"
    ],
    "distanceStepsM": [
      2.5,
      40.0,
      120.0
    ],
    "bandEdgesKm": [
      15.0,
      300.0
    ]
  },
  "site11": {
    "directions": 7200,
    "azimuthStepDeg": 0.05,
    "nearCount": 1050,
    "tileCount": 2770,
    "blendZoneCount": 0,
    "farthestBlockerKm": 166.5,
    "searchLimitKm": 459.7,
    "horizonMinDeg": -3.5741,
    "horizonMaxDeg": 0.3394,
    "demSources": [
      "Site11_final_adj_5mpp_surf.tif",
      "LDEM_80S_80MPP_ADJ.TIF",
      "LDEM_60S_240MPP_ADJ.TIF"
    ],
    "distanceStepsM": [
      2.5,
      40.0,
      120.0
    ],
    "bandEdgesKm": [
      15.0,
      300.0
    ]
  }
}

/**
 * terrain/data/derived/validation/horizon_uncertainty.json: independent
 * height errors at fixed blockers, small-angle. Not a bound for the whole
 * horizon and not propagated into event times.
 */
export const horizonUncertainty: Record<SiteId, {
  sigmaFarMedianDeg: number
  sigmaFarP95Deg: number
  farSubsetShare: number
  sigmaNearMedianDeg: number
  nearShare: number
  nearHorizonMedianDeg: number
  observerSigmaZm: number
  mosaicMedianDistanceKm: number
  mosaicDegPerMetreMedian: number
  horizonSha256: string
}> = {
  "site01": {
    "sigmaFarMedianDeg": 0.0439,
    "sigmaFarP95Deg": 0.1951,
    "farSubsetShare": 0.193,
    "sigmaNearMedianDeg": 0.3954,
    "nearShare": 0.363,
    "nearHorizonMedianDeg": -0.7525,
    "observerSigmaZm": 0.271,
    "mosaicMedianDistanceKm": 46.2124,
    "mosaicDegPerMetreMedian": 0.0012,
    "horizonSha256": "7a3ca70531ef4aabebbb1fbdb0def7d82e51b47521bf1707a962ebc3cdd4cb8e"
  },
  "site04": {
    "sigmaFarMedianDeg": 0.0196,
    "sigmaFarP95Deg": 0.4688,
    "farSubsetShare": 0.215,
    "sigmaNearMedianDeg": 2.0505,
    "nearShare": 0.268,
    "nearHorizonMedianDeg": -0.3072,
    "observerSigmaZm": 0.559,
    "mosaicMedianDistanceKm": 28.4742,
    "mosaicDegPerMetreMedian": 0.002,
    "horizonSha256": "8bdde2bd749ead1f5216090f996d9a33ec71971dc688df081d4054d9d9da05be"
  },
  "site07": {
    "sigmaFarMedianDeg": 0.1707,
    "sigmaFarP95Deg": 0.2347,
    "farSubsetShare": 0.341,
    "sigmaNearMedianDeg": 0.387,
    "nearShare": 0.355,
    "nearHorizonMedianDeg": -1.7262,
    "observerSigmaZm": 0.367,
    "mosaicMedianDistanceKm": 36.2556,
    "mosaicDegPerMetreMedian": 0.0016,
    "horizonSha256": "19f223c154890afd44bd37aa7289a342497e828129b2982b118c05750fc36b87"
  },
  "site11": {
    "sigmaFarMedianDeg": 0.2427,
    "sigmaFarP95Deg": 0.3701,
    "farSubsetShare": 0.239,
    "sigmaNearMedianDeg": 0.5039,
    "nearShare": 0.146,
    "nearHorizonMedianDeg": -1.6673,
    "observerSigmaZm": 0.546,
    "mosaicMedianDistanceKm": 85.3894,
    "mosaicDegPerMetreMedian": 0.0007,
    "horizonSha256": "bd240659c5e574b16dec1759c0f229433478ce0beb0c6951b0bb39a614a99c07"
  }
}

/**
 * terrain/data/derived/validation/sun_visibility_periods.json. Long-term
 * fractions (0..1) computed with the original 0.05° horizon profiles. They are
 * validation context, not the monthly values shown elsewhere in the app.
 */
export const nasaComparison: Record<SiteId, {
  anyPart4yr: number
  anyPart186yr: number
  meanDisc186yr: number
  umarAnyPart: number
  nasaPixel: number
  nasaBilinear: number
}> = {
  "site01": {
    "anyPart4yr": 0.8778804471822952,
    "anyPart186yr": 0.873420281683235,
    "meanDisc186yr": 0.823038437821807,
    "umarAnyPart": 0.8776,
    "nasaPixel": 0.68484,
    "nasaBilinear": 0.6714731431850862
  },
  "site04": {
    "anyPart4yr": 0.7859057723020763,
    "anyPart186yr": 0.783626089408073,
    "meanDisc186yr": 0.7302212199170641,
    "umarAnyPart": 0.7852,
    "nasaPixel": 0.6722800000000001,
    "nasaBilinear": 0.667576612080209
  },
  "site07": {
    "anyPart4yr": 0.8215263518138262,
    "anyPart186yr": 0.8185239210110197,
    "meanDisc186yr": 0.7829390277228326,
    "umarAnyPart": 0.8209,
    "nasaPixel": 0.8595600000000001,
    "nasaBilinear": 0.8366179803705643
  },
  "site11": {
    "anyPart4yr": 0.8510723248916268,
    "anyPart186yr": 0.8470293328103358,
    "meanDisc186yr": 0.8109389144383291,
    "umarAnyPart": 0.8506,
    "nasaPixel": 0.7024,
    "nasaBilinear": 0.7224041978726197
  }
}

/** scientific/FORMULA_AUDIT.md (summary) */
export const formulaAudit = { equationBlocks: 154, testsPassed: 52, functionsExercised: 70 }
