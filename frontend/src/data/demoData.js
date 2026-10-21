// Clearly labelled sample data. Replace these fixtures with API responses during integration.
export const dashboardSummary = {
  safetyScore: 92,
  workersOnSite: 48,
  activeAlerts: 3,
  ppeCompliance: 96.4,
  scoreChange: 2.1,
  complianceChange: 1.3,
};

export const violations = [
  { id: 'EV-2048', type: 'Missing hard hat', location: 'Assembly line · Zone A', time: '10:42:18', severity: 'High', status: 'Open', worker: 'Worker 014' },
  { id: 'EV-2047', type: 'Restricted zone entry', location: 'Press station · Zone C', time: '10:39:51', severity: 'Critical', status: 'Open', worker: 'Worker 032' },
  { id: 'EV-2046', type: 'Unsafe bending posture', location: 'Packing area · Zone B', time: '10:31:06', severity: 'Medium', status: 'Review', worker: 'Worker 008' },
  { id: 'EV-2045', type: 'Safety vest not detected', location: 'Loading bay · Zone D', time: '10:18:42', severity: 'Medium', status: 'Resolved', worker: 'Worker 021' },
];

export const zoneStatus = [
  { zone: 'Assembly line', code: 'ZONE A', workers: 18, status: 'Normal', risk: 18 },
  { zone: 'Packing area', code: 'ZONE B', workers: 12, status: 'Review', risk: 42 },
  { zone: 'Press station', code: 'ZONE C', workers: 8, status: 'High risk', risk: 81 },
  { zone: 'Loading bay', code: 'ZONE D', workers: 10, status: 'Normal', risk: 22 },
];

export const safetyTrend = [
  { day: 'Mon', score: 86, compliance: 91 },
  { day: 'Tue', score: 88, compliance: 93 },
  { day: 'Wed', score: 85, compliance: 92 },
  { day: 'Thu', score: 90, compliance: 94 },
  { day: 'Fri', score: 89, compliance: 95 },
  { day: 'Sat', score: 92, compliance: 96 },
  { day: 'Sun', score: 92, compliance: 96 },
];

export const incidentTrend = [
  { day: 'Mon', critical: 1, high: 2, medium: 4 },
  { day: 'Tue', critical: 0, high: 3, medium: 3 },
  { day: 'Wed', critical: 1, high: 1, medium: 5 },
  { day: 'Thu', critical: 0, high: 2, medium: 2 },
  { day: 'Fri', critical: 1, high: 2, medium: 3 },
  { day: 'Sat', critical: 0, high: 1, medium: 2 },
  { day: 'Sun', critical: 0, high: 1, medium: 2 },
];

export const violationBreakdown = [
  { name: 'PPE compliance', value: 38 },
  { name: 'Unsafe posture', value: 27 },
  { name: 'Restricted zone', value: 21 },
  { name: 'Fall events', value: 14 },
];