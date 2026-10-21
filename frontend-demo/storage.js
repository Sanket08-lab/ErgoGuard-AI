import Dexie from './vendor/dexie/dist/dexie.mjs';

// Manages privacy-first IndexedDB persistence for inspection records and violation incidents using Dexie.js.
export class StorageService {
  constructor() {
    this.db = new Dexie('ErgoGuardDB');

    // Schema version 1: Indexes for time-series queries and incident deduplication
    this.db.version(1).stores({
      inspections: '++id, timestamp, frameId, overallScore, overallSeverity, workerCount',
      violations: '++id, incidentId, workerId, ruleType, severity, startedAtMs, resolvedAtMs',
      settings: 'key',
    });

    this.lastRecordedScore = null;
    this.lastRecordedTimestamp = 0;
    this.throttleIntervalMs = 1000; // Throttle periodic routine frame persistence to 1 Hz
  }

  // Opens or verifies local IndexedDB database connectivity.
  async init() {
    try {
      await this.db.open();
      return true;
    } catch (err) {
      console.error('[StorageService] IndexedDB initialization error:', err);
      return false;
    }
  }

  // Persists aggregated frame safety scores with deduplication and throttling to prevent redundant entries.
  async recordInspection(inspection) {
    if (!inspection || typeof inspection !== 'object') return null;

    const now = inspection.timestamp || Date.now();
    const score = Math.round((inspection.overallScore ?? 0) * 10) / 10;
    const workerCount = inspection.workerCount ?? 0;

    // Throttle unchanged routine risk readings while always recording significant score fluctuations
    const elapsed = now - this.lastRecordedTimestamp;
    const isScoreChanged = this.lastRecordedScore !== score;
    if (!isScoreChanged && elapsed < this.throttleIntervalMs) {
      return null;
    }

    this.lastRecordedTimestamp = now;
    this.lastRecordedScore = score;

    try {
      const id = await this.db.inspections.add({
        timestamp: now,
        frameId: inspection.frameId ?? 0,
        overallScore: score,
        overallSeverity: inspection.overallSeverity ?? 'LOW',
        workerCount,
        activeIncidentsCount: inspection.activeIncidentsCount ?? 0,
        workerSummary: (inspection.workers || []).map((w) => ({
          trackId: w.trackId,
          score: w.riskScore,
          severity: w.severity,
          findings: (w.findings || []).map((f) => f.type || f.status),
        })),
      });
      return id;
    } catch (err) {
      console.error('[StorageService] Failed to record inspection:', err);
      return null;
    }
  }

  // Records and updates violation incident lifecycles (started, escalated, resolved).
  async recordViolationEvent(eventType, detail) {
    if (!detail) return null;

    const incident = detail.incident || {};
    const incidentId = incident.id || `${detail.workerId}-${detail.ruleType}-${detail.timestamp}`;
    const timestamp = detail.timestamp || Date.now();

    try {
      if (eventType === 'violation:started') {
        const existing = await this.db.violations.where('incidentId').equals(incidentId).first();
        if (existing) return existing.id;

        return await this.db.violations.add({
          incidentId,
          workerId: detail.workerId,
          ruleType: detail.ruleType,
          severity: incident.severity || 'HIGH',
          startedAtMs: incident.startedAtMs || timestamp,
          lastSeenAtMs: incident.lastSeenAtMs || timestamp,
          resolvedAtMs: null,
          details: incident.details || null,
        });
      }

      if (eventType === 'violation:escalated') {
        const record = await this.db.violations.where('incidentId').equals(incidentId).first();
        if (record) {
          await this.db.violations.update(record.id, {
            severity: incident.severity,
            lastSeenAtMs: timestamp,
          });
          return record.id;
        }
      }

      if (eventType === 'violation:resolved') {
        const record = await this.db.violations.where('incidentId').equals(incidentId).first();
        if (record) {
          await this.db.violations.update(record.id, {
            resolvedAtMs: timestamp,
            durationMs: timestamp - (record.startedAtMs || timestamp),
          });
          return record.id;
        }
      }
    } catch (err) {
      console.error('[StorageService] Failed to record violation event:', err);
    }
    return null;
  }

  // Fetches recent inspection telemetry records ordered by timestamp descending.
  async getRecentInspections(limit = 50) {
    try {
      return await this.db.inspections.orderBy('timestamp').reverse().limit(limit).toArray();
    } catch (err) {
      console.error('[StorageService] Failed to fetch inspections:', err);
      return [];
    }
  }

  // Fetches recorded violation incidents.
  async getRecentViolations(limit = 100) {
    try {
      return await this.db.violations.orderBy('startedAtMs').reverse().limit(limit).toArray();
    } catch (err) {
      console.error('[StorageService] Failed to fetch violations:', err);
      return [];
    }
  }

  // Clears historical telemetry and incident databases upon explicit operator request.
  async clearAll() {
    try {
      await this.db.inspections.clear();
      await this.db.violations.clear();
      this.lastRecordedScore = null;
      this.lastRecordedTimestamp = 0;
      return true;
    } catch (err) {
      console.error('[StorageService] Failed to clear history:', err);
      return false;
    }
  }

  // Exports inspection history as formatted JSON string for audits or offline backups.
  async exportAsJSON() {
    try {
      const inspections = await this.db.inspections.toArray();
      const violations = await this.db.violations.toArray();
      return JSON.stringify({ exportedAt: new Date().toISOString(), inspections, violations }, null, 2);
    } catch (err) {
      console.error('[StorageService] Export error:', err);
      return null;
    }
  }
}

export const storage = new StorageService();
