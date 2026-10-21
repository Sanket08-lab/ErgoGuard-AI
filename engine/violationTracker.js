import { CONFIG } from './config.js';
import { isSeverityHigher } from './severity.js';

// Normalizes timestamp inputs (numbers, ISO strings, or fallbacks) into safe non-negative millisecond epoch numbers.
function parseTimestampMs(ts, fallbackMs = null) {
  if (typeof ts === 'number' && Number.isFinite(ts) && ts >= 0) {
    return ts;
  }
  if (typeof ts === 'string' && ts.trim() !== '') {
    const parsed = Date.parse(ts);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  if (typeof fallbackMs === 'number' && Number.isFinite(fallbackMs) && fallbackMs >= 0) {
    return fallbackMs;
  }
  return Date.now();
}

export class ViolationTracker {
  // Configures temporal threshold windows in milliseconds for debounce, grace, and cooldown.
  constructor(options = {}) {
    const timing = options.timing ?? CONFIG.timing ?? {};
    this.onsetDebounceMs = options.onsetDebounceMs ?? timing.onsetDebounceMs ?? 167; // ~5 frames @ 30 FPS
    this.gracePeriodMs = options.gracePeriodMs ?? timing.gracePeriodMs ?? 500;       // ~15 frames @ 30 FPS
    this.cooldownMs = options.cooldownMs ?? timing.cooldownMs ?? 15000;             // 15 seconds cooldown

    // Stores tracking state per key: `${workerId}:${ruleType}`
    this.records = new Map();
    this.lastTimestampMs = null;
  }

  // Generates composite map key for isolated per-worker per-rule tracking.
  _makeKey(workerId, ruleType) {
    return `${workerId}:${ruleType}`;
  }

  // Evaluates a temporal observation and advances the incident lifecycle state machine.
  update(workerId, ruleType, status, timestamp, details = {}) {
    const key = this._makeKey(workerId, ruleType);
    let record = this.records.get(key);

    if (!record) {
      record = {
        workerId,
        ruleType,
        state: 'INACTIVE',
        firstObservedViolationMs: null,
        activeSinceMs: null,
        lastObservedViolationMs: null,
        lastAlertedMs: null,
        lastCompliantMs: null,
        lastTimestampMs: null,
        severity: details.severity ?? null,
        details: { ...details },
      };
      this.records.set(key, record);
    }

    const fallbackMs = record.lastTimestampMs ?? this.lastTimestampMs;
    const nowMs = parseTimestampMs(timestamp, fallbackMs);

    // Guard against out-of-order timestamps: prevent older observations from rewinding state or calculating negative durations
    if (record.lastTimestampMs !== null && nowMs < record.lastTimestampMs) {
      return {
        state: record.state,
        action: 'NONE',
        shouldAlert: false,
        incident: (record.state === 'ACTIVE' || record.state === 'COOLDOWN')
          ? this._buildIncident(record, record.lastTimestampMs)
          : null,
      };
    }

    record.lastTimestampMs = nowMs;
    this.lastTimestampMs = Math.max(this.lastTimestampMs ?? 0, nowMs);

    const upperStatus = String(status ?? '').toUpperCase();
    const isViolation = upperStatus === 'VIOLATION';
    const isCompliant = upperStatus === 'COMPLIANT';
    const isUncertainOrSkipped = upperStatus === 'UNCERTAIN' || upperStatus === 'SKIPPED' || upperStatus === 'INVALID';

    // --- Case 1: Violation Observed ---
    if (isViolation) {
      record.lastObservedViolationMs = Math.max(record.lastObservedViolationMs ?? 0, nowMs);
      const currentSeverity = details.severity ?? record.severity;

      // Subcase 1A: Inactive -> Start debouncing
      if (record.state === 'INACTIVE') {
        record.state = 'DEBOUNCING';
        record.firstObservedViolationMs = nowMs;
        record.severity = currentSeverity;
        record.details = { ...details };

        // If debounce time is zero or already met, activate immediately
        if (this.onsetDebounceMs <= 0) {
          record.state = 'ACTIVE';
          record.activeSinceMs = nowMs;
          record.lastAlertedMs = nowMs;
          return {
            state: 'ACTIVE',
            action: 'STARTED',
            shouldAlert: true,
            incident: this._buildIncident(record, nowMs),
          };
        }

        return {
          state: 'DEBOUNCING',
          action: 'NONE',
          shouldAlert: false,
          incident: null,
        };
      }

      // Subcase 1B: Debouncing -> Check if debounce duration elapsed
      if (record.state === 'DEBOUNCING') {
        const elapsed = Math.max(0, nowMs - (record.firstObservedViolationMs ?? nowMs));
        if (elapsed >= this.onsetDebounceMs) {
          record.state = 'ACTIVE';
          record.activeSinceMs = nowMs;
          record.lastAlertedMs = nowMs;
          record.severity = currentSeverity;
          record.details = { ...details };
          return {
            state: 'ACTIVE',
            action: 'STARTED',
            shouldAlert: true,
            incident: this._buildIncident(record, nowMs),
          };
        }

        return {
          state: 'DEBOUNCING',
          action: 'NONE',
          shouldAlert: false,
          incident: null,
        };
      }

      // Subcase 1C: Active or Cooldown -> Check for escalation or cooldown expiry
      if (record.state === 'ACTIVE' || record.state === 'COOLDOWN') {
        record.details = { ...details };

        // Check if severity escalated to a strictly higher tier
        if (currentSeverity && record.severity && isSeverityHigher(currentSeverity, record.severity)) {
          record.severity = currentSeverity;
          record.lastAlertedMs = nowMs;
          record.state = 'ACTIVE';
          return {
            state: 'ACTIVE',
            action: 'ESCALATED',
            shouldAlert: true,
            incident: this._buildIncident(record, nowMs),
          };
        }

        // Check alert cooldown window
        const timeSinceAlert = Math.max(0, nowMs - (record.lastAlertedMs ?? 0));
        if (timeSinceAlert >= this.cooldownMs) {
          record.state = 'ACTIVE';
          record.lastAlertedMs = nowMs;
          return {
            state: 'ACTIVE',
            action: 'STARTED',
            shouldAlert: true,
            incident: this._buildIncident(record, nowMs),
          };
        }

        // Cooldown remains in effect (suppress duplicate alert)
        record.state = 'COOLDOWN';
        return {
          state: 'COOLDOWN',
          action: 'NONE',
          shouldAlert: false,
          incident: this._buildIncident(record, nowMs),
        };
      }
    }

    // --- Case 2: No Violation (COMPLIANT or UNCERTAIN/SKIPPED) ---
    if (record.state === 'DEBOUNCING') {
      // Transitional flicker before confirmation cancels debounce
      record.state = 'INACTIVE';
      record.firstObservedViolationMs = null;
      return {
        state: 'INACTIVE',
        action: 'NONE',
        shouldAlert: false,
        incident: null,
      };
    }

    if (record.state === 'ACTIVE' || record.state === 'COOLDOWN') {
      // If observation is uncertain or skipped, grant grace period
      const lastSeen = record.lastObservedViolationMs ?? nowMs;
      const timeSinceViolation = Math.max(0, nowMs - lastSeen);

      // Immediate compliance or grace period expiry resolves the incident
      if (isCompliant || timeSinceViolation >= this.gracePeriodMs) {
        const closedIncident = this._buildIncident(record, nowMs);
        record.state = 'INACTIVE';
        record.firstObservedViolationMs = null;
        record.activeSinceMs = null;
        record.lastAlertedMs = null;
        return {
          state: 'RESOLVED',
          action: 'RESOLVED',
          shouldAlert: false,
          incident: closedIncident,
        };
      }

      // Within grace period (evidence temporarily missing/uncertain)
      return {
        state: record.state,
        action: 'NONE',
        shouldAlert: false,
        incident: this._buildIncident(record, nowMs),
      };
    }

    return {
      state: 'INACTIVE',
      action: 'NONE',
      shouldAlert: false,
      incident: null,
    };
  }

  // Serializes an immutable snapshot of an active or resolved incident event.
  _buildIncident(record, nowMs) {
    const startedAt = record.activeSinceMs ?? record.firstObservedViolationMs ?? nowMs;
    const effectiveNow = Math.max(startedAt, nowMs);
    return {
      id: `${record.workerId}_${record.ruleType}_${startedAt}`,
      workerId: record.workerId,
      ruleType: record.ruleType,
      severity: record.severity,
      startedAtMs: startedAt,
      lastSeenAtMs: record.lastObservedViolationMs ?? effectiveNow,
      durationMs: Math.max(0, effectiveNow - startedAt),
      details: { ...record.details },
    };
  }

  // Retrieves all currently active or debouncing incidents.
  getActiveIncidents() {
    const list = [];
    const currentMs = this.lastTimestampMs ?? Date.now();
    for (const record of this.records.values()) {
      if (record.state === 'ACTIVE' || record.state === 'COOLDOWN') {
        list.push(this._buildIncident(record, record.lastTimestampMs ?? currentMs));
      }
    }
    return list;
  }

  // Resets internal state for clean testing or new session.
  reset() {
    this.records.clear();
    this.lastTimestampMs = null;
  }
}

export default ViolationTracker;
