export const mockSummary = {
  safetyScore: 87,
  workers: 24,
  activeIncidents: 6,
  ppeCompliance: 94,
  change: { safety: 4.2, workers: 2, incidents: -12, ppe: 2.1 }
}

export const mockIncidents = [
  { id: 'INC-1048', type: 'Missing Hardhat', worker: 'Worker #08', zone: 'Assembly Line A', severity: 'High', score: 78, time: '10:42:18 AM', status: 'Active', duration: '00:02:14' },
  { id: 'INC-1047', type: 'Unsafe Posture', worker: 'Worker #12', zone: 'Packaging', severity: 'Medium', score: 54, time: '10:39:06 AM', status: 'Active', duration: '00:01:08' },
  { id: 'INC-1046', type: 'Danger Zone Entry', worker: 'Worker #03', zone: 'Forklift Lane', severity: 'Critical', score: 91, time: '10:35:44 AM', status: 'Active', duration: '00:00:32' },
  { id: 'INC-1045', type: 'Missing Safety Vest', worker: 'Worker #19', zone: 'Warehouse B', severity: 'Medium', score: 49, time: '10:31:21 AM', status: 'Resolved', duration: '00:03:41' },
  { id: 'INC-1044', type: 'Fall Detected', worker: 'Worker #06', zone: 'Loading Bay', severity: 'Critical', score: 96, time: '10:27:02 AM', status: 'Resolved', duration: '00:00:48' },
  { id: 'INC-1043', type: 'Unsafe Posture', worker: 'Worker #14', zone: 'Assembly Line A', severity: 'Low', score: 24, time: '10:21:15 AM', status: 'Resolved', duration: '00:01:22' },
]

export const incidentTrend = [
  { time: '08:00', incidents: 8, safety: 78, ppe: 88 },
  { time: '09:00', incidents: 6, safety: 81, ppe: 90 },
  { time: '10:00', incidents: 10, safety: 76, ppe: 87 },
  { time: '11:00', incidents: 4, safety: 85, ppe: 92 },
  { time: '12:00', incidents: 5, safety: 83, ppe: 91 },
  { time: '13:00', incidents: 3, safety: 87, ppe: 94 },
  { time: '14:00', incidents: 2, safety: 89, ppe: 95 },
]

export const zoneRisk = [
  { zone: 'Assembly Line A', risk: 78, incidents: 12 },
  { zone: 'Forklift Lane', risk: 66, incidents: 9 },
  { zone: 'Warehouse B', risk: 44, incidents: 6 },
  { zone: 'Loading Bay', risk: 31, incidents: 4 },
]

export const workers = [
  { id: 'WK-008', name: 'Worker #08', zone: 'Assembly Line A', status: 'PPE missing', risk: 'High', lastSeen: 'Just now' },
  { id: 'WK-012', name: 'Worker #12', zone: 'Packaging', status: 'Unsafe posture', risk: 'Medium', lastSeen: 'Just now' },
  { id: 'WK-003', name: 'Worker #03', zone: 'Forklift Lane', status: 'Danger zone', risk: 'Critical', lastSeen: '2 sec ago' },
  { id: 'WK-019', name: 'Worker #19', zone: 'Warehouse B', status: 'Compliant', risk: 'Low', lastSeen: '4 sec ago' },
]