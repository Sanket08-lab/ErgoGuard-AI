import { dashboardSummary, violations, zoneStatus, safetyTrend, incidentTrend, violationBreakdown } from '../data/demoData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, fallback) {
  if (!API_BASE_URL) return fallback;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`ErgoGuard API request failed for ${path}`, error);
    throw error;
  }
}

// Components use these methods now; swap endpoint paths or response mapping to match the backend contract.
export const api = {
  getDashboardSummary: () => request('/api/dashboard/summary', dashboardSummary),
  getIncidents: () => request('/api/incidents', violations),
  getZones: () => request('/api/zones', zoneStatus),
  getSafetyTrend: () => request('/api/analytics/safety-trend', safetyTrend),
  getIncidentTrend: () => request('/api/analytics/incidents-over-time', incidentTrend),
  getViolationBreakdown: () => request('/api/analytics/violation-breakdown', violationBreakdown),
};

export const isDemoMode = !API_BASE_URL;