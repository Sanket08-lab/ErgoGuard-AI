export const CONFIG = {
  // Minimum detection and landmark confidence scores (0.0 to 1.0) required to consider AI model outputs valid.
  minConf: {
    person: 0.5,
    hardhat: 0.4,
    vest: 0.4,
    landmark: 0.5,
  },

  // Ergonomic posture angle thresholds in degrees for trunk flexion, stooping, and straight knee lifting.
  posture: {
    trunkBendDeg: 60,
    stoopTrunkDeg: 45,
    straightKneeDeg: 150,
    briefBendGraceMs: 1500,     // < 1500ms: brief transient movement (0 points)
    sustainedBendMs: 3000,      // >= 3000ms: sustained hazard escalation (HIGH / CRITICAL)
    hysteresisMarginDeg: 3.0,   // Fluctuating angle deadband margin
    minPersonHeightPx: 120,
    minTorsoLengthPx: 25,
  },

  // Bounding box vertical fractions [ymin, ymax], minimum IoA overlap, and minimum person pixel height for PPE checks.
  ppe: {
    headRegion: [0, 0.28],
    torsoRegion: [0.2, 0.65],
    hardhatIoA: 0.5,
    vestIoA: 0.5,
    minPersonHeightPx: 120,
  },

  // Base penalty score points assigned to each safety violation event type.
  violations: {
    FallEvent: { base: 90 },
    UnsafePosture: {
      base: 40,      // Moderate stoop >= 1500ms (MEDIUM)
      high: 60,      // Sustained moderate stoop >= 3000ms (HIGH)
      critical: 80,  // Severe sustained stoop >= 60° for >= 3000ms (CRITICAL)
    },
    MissingHardhat: { base: 55 },
    MissingVest: { base: 35 },
    Fatigue: { base: 45 },
    WorkerFatigue: { base: 45 },
  },

  // Score threshold boundaries classifying violation severity into Low, Medium, High, and Critical.
  severityLevels: {
    Low: 0,
    Medium: 25,
    High: 50,
    Critical: 75,
  },

  // Severity classification hysteresis deadband margin to prevent oscillation
  severityHysteresis: 5,

  // Temporal windows in milliseconds (derived from 30 FPS defaults)
  timing: {
    onsetDebounceMs: 167,    // ~5 frames @ 30 FPS
    gracePeriodMs: 500,      // ~15 frames @ 30 FPS
    cooldownMs: 15000,       // 15 seconds cooldown for duplicate alerts
    fallConfirmationMs: 333, // 10 frames @ 30 FPS
    fallRecoveryTimeoutMs: 5000, // 5.0s on floor before emergency
    fatigueDwellMs: 2000,    // 60 frames @ 30 FPS (2.0s)
    immobilityMs: 15000,     // 15.0s immobility threshold
    riskUpdateIntervalMs: 200, // 5 Hz max update rate (200ms)
  },

  // Fall detection thresholds
  fall: {
    aspectRatioThreshold: 0.85,
    torsoAngleThresholdDeg: 30.0,
    // Vertical descent velocity normalized by person bounding box height over 133ms (~4 frames)
    normalizedVelocityThreshold: 0.08,
  },
};

export default CONFIG;
