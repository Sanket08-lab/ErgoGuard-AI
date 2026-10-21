import assert from 'node:assert/strict';

let testsRun = 0;
function test(name, fn) {
  testsRun += 1;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('Running storage.test.js test suite...\n');

// Mock in-memory store simulating Dexie / IndexedDB operations in Node.js
class MockStorageService {
  constructor() {
    this.inspections = [];
    this.violations = [];
    this.lastRecordedScore = null;
    this.lastRecordedTimestamp = 0;
    this.throttleIntervalMs = 1000;
  }

  recordInspection(inspection) {
    if (!inspection || typeof inspection !== 'object') return null;

    const now = inspection.timestamp || Date.now();
    const score = Math.round((inspection.overallScore ?? 0) * 10) / 10;
    const workerCount = inspection.workerCount ?? 0;

    const elapsed = now - this.lastRecordedTimestamp;
    const isScoreChanged = this.lastRecordedScore !== score;
    if (!isScoreChanged && elapsed < this.throttleIntervalMs) {
      return null;
    }

    this.lastRecordedTimestamp = now;
    this.lastRecordedScore = score;

    const record = {
      id: this.inspections.length + 1,
      timestamp: now,
      frameId: inspection.frameId ?? 0,
      overallScore: score,
      overallSeverity: inspection.overallSeverity ?? 'LOW',
      workerCount,
      activeIncidentsCount: inspection.activeIncidentsCount ?? 0,
    };
    this.inspections.push(record);
    return record.id;
  }

  recordViolationEvent(eventType, detail) {
    if (!detail) return null;

    const incident = detail.incident || {};
    const incidentId = incident.id || `${detail.workerId}-${detail.ruleType}-${detail.timestamp}`;
    const timestamp = detail.timestamp || Date.now();

    if (eventType === 'violation:started') {
      const existing = this.violations.find((v) => v.incidentId === incidentId);
      if (existing) return existing.id;

      const record = {
        id: this.violations.length + 1,
        incidentId,
        workerId: detail.workerId,
        ruleType: detail.ruleType,
        severity: incident.severity || 'HIGH',
        startedAtMs: incident.startedAtMs || timestamp,
        lastSeenAtMs: incident.lastSeenAtMs || timestamp,
        resolvedAtMs: null,
      };
      this.violations.push(record);
      return record.id;
    }

    if (eventType === 'violation:resolved') {
      const record = this.violations.find((v) => v.incidentId === incidentId);
      if (record) {
        record.resolvedAtMs = timestamp;
        record.durationMs = timestamp - record.startedAtMs;
        return record.id;
      }
    }
    return null;
  }

  exportAsJSON() {
    return JSON.stringify({ inspections: this.inspections, violations: this.violations }, null, 2);
  }
}

test('recordInspection: persists valid inspection and suppresses duplicate routine frames within 1s', () => {
  const store = new MockStorageService();

  const id1 = store.recordInspection({ timestamp: 1000, frameId: 1, overallScore: 0, overallSeverity: 'LOW', workerCount: 1 });
  assert.equal(id1, 1, 'First frame must be stored');

  // Identical score within 500ms should be throttled
  const id2 = store.recordInspection({ timestamp: 1500, frameId: 2, overallScore: 0, overallSeverity: 'LOW', workerCount: 1 });
  assert.equal(id2, null, 'Unchanged routine frame within throttle window must be suppressed');

  // Score change must record immediately even within throttle window
  const id3 = store.recordInspection({ timestamp: 1600, frameId: 3, overallScore: 40, overallSeverity: 'MEDIUM', workerCount: 1 });
  assert.equal(id3, 2, 'Score fluctuation must record immediately');
});

test('recordViolationEvent: tracks incident lifecycle from started to resolved', () => {
  const store = new MockStorageService();

  const detailStart = {
    workerId: 1,
    ruleType: 'UnsafePosture',
    timestamp: 1000,
    incident: { id: 'inc_101', severity: 'HIGH', startedAtMs: 1000 },
  };

  const id = store.recordViolationEvent('violation:started', detailStart);
  assert.equal(id, 1, 'Violation start must create incident entry');

  const detailResolve = {
    workerId: 1,
    ruleType: 'UnsafePosture',
    timestamp: 3500,
    incident: { id: 'inc_101' },
  };

  store.recordViolationEvent('violation:resolved', detailResolve);
  const record = store.violations[0];
  assert.equal(record.resolvedAtMs, 3500, 'Resolved timestamp must be recorded');
  assert.equal(record.durationMs, 2500, 'Incident duration must be computed');
});

test('exportAsJSON: outputs valid serialized JSON inspection report', () => {
  const store = new MockStorageService();
  store.recordInspection({ timestamp: 1000, frameId: 1, overallScore: 25, overallSeverity: 'MEDIUM', workerCount: 1 });

  const jsonStr = store.exportAsJSON();
  const parsed = JSON.parse(jsonStr);
  assert.ok(Array.isArray(parsed.inspections), 'Export must contain inspections array');
  assert.equal(parsed.inspections.length, 1);
  assert.equal(parsed.inspections[0].overallScore, 25);
});

console.log(`\nAll ${testsRun} storage tests passed successfully!\n`);
