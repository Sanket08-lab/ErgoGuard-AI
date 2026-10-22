import React from 'react';

export const departmentList = [
  'All Zones',
  'Warehouse',
  'Manufacturing',
  'Packaging',
  'Loading Zone',
];

export const departmentData = {
  'All Zones': {
    name: 'All Zones',
    cameraTag: 'Camera 1 - Production Area',
    image: '/factory_feed.jpg',
    workersCount: 24,
    workersChange: '+12%',
    violationsCount: 7,
    violationsChange: '+3',
    ppeRate: 82,
    ppeChange: '+5%',
    postureAlerts: 3,
    postureChange: '+1',
    workers: [
      { id: 'W1', tag: 'PPE: OK', status: 'ok', x: 24, y: 34, w: 11, h: 44 },
      { id: 'W2', tag: 'No Helmet', status: 'alert', x: 41, y: 35, w: 10, h: 43 },
      { id: 'W3', tag: 'Unsafe Posture', status: 'warn', x: 57, y: 39, w: 12, h: 36 },
      { id: 'W4', tag: 'PPE: OK', status: 'ok', x: 49, y: 53, w: 13, h: 44 },
    ]
  },
  'Manufacturing': {
    name: 'Manufacturing',
    cameraTag: 'Camera 1 - Manufacturing Assembly',
    image: '/factory_feed.jpg',
    workersCount: 14,
    workersChange: '+8%',
    violationsCount: 4,
    violationsChange: '+2',
    ppeRate: 85,
    ppeChange: '+3%',
    postureAlerts: 2,
    postureChange: '+1',
    workers: [
      { id: 'W1', tag: 'PPE: OK', status: 'ok', x: 24, y: 34, w: 11, h: 44 },
      { id: 'W2', tag: 'No Helmet', status: 'alert', x: 41, y: 35, w: 10, h: 43 },
      { id: 'W3', tag: 'Unsafe Posture', status: 'warn', x: 57, y: 39, w: 12, h: 36 },
    ]
  },
  'Warehouse': {
    name: 'Warehouse',
    cameraTag: 'Camera 2 - Warehouse Storage Bay',
    image: '/warehouse_feed.jpg',
    workersCount: 6,
    workersChange: '+2%',
    violationsCount: 1,
    violationsChange: '0',
    ppeRate: 95,
    ppeChange: '+6%',
    postureAlerts: 0,
    postureChange: '0',
    workers: [
      { id: 'W1', tag: 'PPE: OK', status: 'ok', x: 21, y: 58, w: 7, h: 32 },
      { id: 'W2', tag: 'Forklift Zone', status: 'warn', x: 46, y: 56, w: 14, h: 36 },
      { id: 'W3', tag: 'PPE: OK', status: 'ok', x: 70, y: 56, w: 7, h: 32 },
    ]
  },
  'Packaging': {
    name: 'Packaging',
    cameraTag: 'Camera 3 - Packaging & Sorting Line',
    image: '/packaging_feed.jpg',
    workersCount: 10,
    workersChange: '+15%',
    violationsCount: 2,
    violationsChange: '+2',
    ppeRate: 78,
    ppeChange: '-3%',
    postureAlerts: 2,
    postureChange: '+2',
    workers: [
      { id: 'W1', tag: 'PPE: OK', status: 'ok', x: 17, y: 68, w: 14, h: 30 },
      { id: 'W2', tag: 'No Safety Vest', status: 'alert', x: 43, y: 45, w: 8, h: 32 },
      { id: 'W3', tag: 'Unsafe Posture', status: 'warn', x: 52, y: 44, w: 9, h: 34 },
      { id: 'W4', tag: 'PPE: OK', status: 'ok', x: 62, y: 51, w: 10, h: 34 },
    ]
  },
  'Loading Zone': {
    name: 'Loading Zone',
    cameraTag: 'Camera 4 - Loading Dock Freight Bay',
    image: '/loading_feed.jpg',
    workersCount: 5,
    workersChange: '-5%',
    violationsCount: 1,
    violationsChange: '-1',
    ppeRate: 88,
    ppeChange: '+4%',
    postureAlerts: 1,
    postureChange: '0',
    workers: [
      { id: 'W1', tag: 'PPE: OK', status: 'ok', x: 31, y: 50, w: 8, h: 28 },
      { id: 'W2', tag: 'Fall Risk Zone', status: 'alert', x: 35, y: 59, w: 9, h: 32 },
      { id: 'W3', tag: 'PPE: OK', status: 'ok', x: 51, y: 54, w: 9, h: 32 },
    ]
  }
};

export const recentAlertsList = [
  { id: 1, title: 'No Helmet Detected', location: 'Camera 1 • Production Area', time: '2 min ago', severity: 'High', image: '/alert_worker.jpg' },
  { id: 2, title: 'Unsafe Posture', location: 'Camera 2 • Assembly Line', time: '5 min ago', severity: 'Medium', image: '/alert_worker.jpg' },
  { id: 3, title: 'No Safety Vest', location: 'Camera 3 • Packaging', time: '8 min ago', severity: 'High', image: '/alert_worker.jpg' },
  { id: 4, title: 'Fall Detected', location: 'Camera 1 • Production Area', time: '12 min ago', severity: 'Critical', image: '/alert_worker.jpg' },
  { id: 5, title: 'Fatigue Detected', location: 'Camera 2 • Assembly Line', time: '18 min ago', severity: 'Medium', image: '/alert_worker.jpg' },
];

export const safetyViolationTrends = [
  { date: 'Oct 14', count: 3 },
  { date: 'Oct 15', count: 7 },
  { date: 'Oct 16', count: 6 },
  { date: 'Oct 17', count: 11 },
  { date: 'Oct 18', count: 13 },
  { date: 'Oct 19', count: 11 },
  { date: 'Oct 20', count: 14 },
];

export const violationTypesDonut = [
  { name: 'No Helmet', value: 38, count: 12, color: '#3A0F34' },
  { name: 'No Safety Vest', value: 25, count: 8, color: '#EAAA00' },
  { name: 'Unsafe Posture', value: 19, count: 6, color: '#94A3B8' },
  { name: 'Fall Detected', value: 9, count: 3, color: '#EF4444' },
  { name: 'Fatigue', value: 9, count: 3, color: '#A855F7' },
];

// Backward-compatibility exports for api.js and other pages
export const topMetrics = [
  { id: 'workers', label: 'Total Workers Detected', value: '24', sub: 'Live on site', type: 'workers' },
  { id: 'incidents', label: 'Safety Violations', value: '7', badge: '+3', sub: 'In last 1 hour', type: 'incidents' },
  { id: 'ppe', label: 'PPE Compliance', value: '82%', badge: '+5%', sub: 'Workers with proper PPE', type: 'ppe' },
  { id: 'posture', label: 'Fatigue / Unsafe Posture', value: '3', badge: '+1', sub: 'Detected today', type: 'posture' },
];

export const detectedWorkers = departmentData['All Zones'].workers;
export const recentAlerts = recentAlertsList;
export const riskTrendData = safetyViolationTrends.map(t => ({ time: t.date, score: t.count * 5 }));
export const incidentTypesData = violationTypesDonut;
export const workersStatusData = [
  { id: 'W1', ppe: 'OK', posture: 'Normal', zone: 'Safe', risk: 'Low' },
  { id: 'W2', ppe: 'Missing', posture: 'Bending', zone: 'Safe', risk: 'High' },
  { id: 'W3', ppe: 'OK', posture: 'Normal', zone: 'Safe', risk: 'Low' },
  { id: 'W4', ppe: 'OK', posture: 'Normal', zone: 'Safe', risk: 'Low' },
];

export const dashboardSummary = {
  safetyScore: 82,
  workersOnSite: 24,
  activeAlerts: 7,
  ppeCompliance: 82,
  scoreChange: 5,
  complianceChange: 5,
};

export const violations = recentAlertsList.map(a => ({
  id: `EV-${a.id}`,
  type: a.title,
  location: a.location,
  time: a.time,
  severity: a.severity,
  status: 'Open',
  worker: `Worker 00${a.id}`
}));

export const zoneStatus = [
  { zone: 'Manufacturing', code: 'ZONE A', workers: 14, status: 'Active', risk: 35 },
  { zone: 'Warehouse', code: 'ZONE B', workers: 6, status: 'Normal', risk: 10 },
  { zone: 'Packaging', code: 'ZONE C', workers: 10, status: 'Review', risk: 42 },
  { zone: 'Loading Zone', code: 'ZONE D', workers: 5, status: 'Normal', risk: 18 },
];

export const safetyTrend = safetyViolationTrends.map(t => ({ day: t.date, score: t.count, compliance: 85 }));
export const incidentTrend = safetyViolationTrends.map(t => ({ day: t.date, critical: 1, high: 2, medium: 1 }));
export const violationBreakdown = violationTypesDonut;