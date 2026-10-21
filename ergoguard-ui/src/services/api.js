import demoDetection from '../../demo-data.json';
import { incidentTrend, mockIncidents, mockSummary, zoneRisk, workers as mockWorkers } from '../data/mockData';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, '');
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
let sourceIsMock = USE_MOCK;

// Prefer the repository's live detection endpoint and keep a representative preview available offline.
async function getSnapshot() {
  if (USE_MOCK) { sourceIsMock = true; return demoDetection; }
  try {
    const response = await fetch(`${API_BASE}/detections/latest`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Detection API returned ${response.status}`);
    sourceIsMock = false;
    return await response.json();
  } catch {
    sourceIsMock = true;
    return demoDetection;
  }
}

// Adapt the existing frame summary without inventing a safety score absent from its schema.
async function getSummary() {
  if (USE_MOCK) return { ...mockSummary, criticalAlerts: mockIncidents.filter((item) => item.severity === 'Critical').length, dangerZoneIntrusions: 1, fps: 29 };
  const data = await getSnapshot();
  const workers = data.workers || [];
  const summary = data.summary || {};
  return {
    safetyScore: null,
    workers: summary.total_workers ?? workers.length,
    activeIncidents: summary.total_violations_count ?? countViolations(data, workers),
    criticalAlerts: summary.critical_alerts_count ?? (data.critical_alerts || []).filter((item) => item.severity === 'CRITICAL').length,
    dangerZoneIntrusions: summary.danger_zone_intrusions_count ?? workers.filter((worker) => worker.danger_zone?.is_inside).length,
    activeFalls: summary.active_falls_count ?? workers.filter((worker) => worker.fall?.is_fallen).length,
    fps: data.fps_processing ?? null,
    ppeCompliance: workers.length ? Math.round(((summary.compliant_ppe_workers || 0) / workers.length) * 100) : null,
    change: {},
  };
}

// Flatten the current frame's alerts and violations into the table's display model.
async function getIncidents() {
  if (USE_MOCK) return mockIncidents;
  const data = await getSnapshot();
  const workers = data.workers || [];
  const byTrack = new Map(workers.map((worker) => [worker.track_id, worker]));
  const raw = [
    ...(data.critical_alerts || []).map((item) => ({ ...item, track_id: item.track_id ?? null })),
    ...workers.flatMap((worker) => (worker.violations || []).map((item) => ({ ...item, track_id: worker.track_id }))),
  ];
  const seen = new Set();
  return raw.filter((item) => {
    const key = `${item.violation_type}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item, index) => {
    const worker = byTrack.get(item.track_id);
    const zone = worker?.danger_zone?.zone_name || item.zone_id || worker?.danger_zone?.zone_id || '—';
    return {
      id: `${data.camera_id || 'CAM'}-${data.frame_id ?? 'FRAME'}-${index + 1}`,
      type: readable(item.violation_type || item.message),
      worker: item.track_id == null ? 'Unassigned' : `Worker #${item.track_id}`,
      zone,
      severity: titleCase(item.severity || 'MEDIUM'),
      score: null,
      time: formatTime(item.timestamp || data.timestamp),
      status: 'Active',
      duration: worker?.danger_zone?.time_in_zone_seconds ? `${Number(worker.danger_zone.time_in_zone_seconds).toFixed(1)}s` : '—',
      message: item.message || '',
      trackId: item.track_id,
    };
  });
}

// Build a one-frame series because the existing API does not expose historical analytics endpoints.
async function getTimeseries() {
  if (USE_MOCK) return incidentTrend;
  const data = await getSnapshot();
  const summary = data.summary || {};
  const workerList = data.workers || [];
  const compliant = workerList.length ? Math.round(((summary.compliant_ppe_workers || 0) / workerList.length) * 100) : 0;
  return [{
    time: data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Latest',
    incidents: summary.total_violations_count ?? countViolations(data, workerList),
    safety: 0,
    ppe: compliant,
  }];
}

// Convert polygon zone records to the zones view without assuming a numeric risk score exists.
async function getZones() {
  if (USE_MOCK) return zoneRisk;
  const data = await getSnapshot();
  return (data.danger_zones || []).map((zone) => ({
    zone: zone.zone_name || zone.zone_id || 'Safety zone',
    zoneId: zone.zone_id,
    severity: titleCase(zone.severity || 'MONITORED'),
    risk: null,
    incidents: Number(zone.current_occupancy || 0),
    occupancy: Number(zone.current_occupancy || 0),
    maxDwell: Number(zone.max_dwell_seconds || 0),
  }));
}

// Map live track IDs to anonymized worker rows used by the supplied interface.
async function getWorkers() {
  if (USE_MOCK) return mockWorkers;
  const data = await getSnapshot();
  return (data.workers || []).map((worker) => {
    const danger = worker.danger_zone || {};
    const posture = worker.posture || {};
    const fall = worker.fall || {};
    const missing = worker.ppe?.missing_required_ppe || [];
    const risk = fall.is_fallen || fall.emergency_alert ? 'Critical' : danger.is_inside ? titleCase(danger.severity || 'High') : titleCase(posture.risk_level || (worker.fatigue?.is_fatigued ? 'Medium' : 'Low'));
    const status = !worker.ppe ? 'PPE status unavailable' : !worker.ppe.compliant ? `Missing ${missing.length ? missing.join(', ') : 'required PPE'}` : fall.is_fallen ? 'Fall detected' : posture.status && posture.status !== 'SAFE' ? readable(posture.status) : worker.fatigue?.is_fatigued ? 'Fatigue detected' : 'Compliant';
    return {
      id: `WK-${String(worker.track_id).padStart(3, '0')}`,
      name: `Worker #${worker.track_id}`,
      zone: danger.is_inside ? danger.zone_name || danger.zone_id || 'Restricted zone' : 'Clear',
      status,
      risk,
      lastSeen: 'Latest frame',
    };
  });
}

// Keep mutations local because the current FastAPI service exposes read-only detection endpoints.
async function createIncident(payload) {
  if (!USE_MOCK) throw new Error('The current ErgoGuard API does not support creating incidents.');
  return { ...payload, id: `INC-${Date.now()}`, status: 'Active' };
}

export const api = { getSnapshot, getSummary, getIncidents, getTimeseries, getZones, getWorkers, createIncident };
export const isMockMode = USE_MOCK;
export const getDataSource = () => sourceIsMock ? 'demo' : 'live';

function countViolations(data, list = data.workers || []) {
  return (data.critical_alerts || []).length + list.reduce((count, worker) => count + (worker.violations || []).length, 0);
}
function readable(value) { return String(value || 'Safety incident').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function titleCase(value) { return String(value || '').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatTime(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
