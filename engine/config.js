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
    UnsafePosture: { base: 40 },
    MissingHardhat: { base: 55 },
    MissingVest: { base: 35 },
  },

  // Score threshold boundaries classifying violation severity into Low, Medium, High, and Critical.
  severityLevels: {
    Low: 0,
    Medium: 25,
    High: 50,
    Critical: 75,
  },
};

export default CONFIG;
