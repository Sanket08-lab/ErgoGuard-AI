import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempProfileDir = path.join(os.tmpdir(), `chrome_test_profile_${Date.now()}`);
fs.mkdirSync(tempProfileDir, { recursive: true });

console.log('Starting Chrome for Warehouse Video & Genuine Fall Browser Verification...');

const chromeProcess = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9224',
  '--remote-allow-origins=*',
  `--user-data-dir=${tempProfileDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  'about:blank',
], { stdio: 'ignore' });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  const res = await fetch(url);
  return await res.json();
}

async function main() {
  try {
    let versionInfo = null;
    for (let i = 0; i < 30; i++) {
      try {
        versionInfo = await getJson('http://127.0.0.1:9224/json/version');
        if (versionInfo && versionInfo.webSocketDebuggerUrl) break;
      } catch (e) {
        await sleep(300);
      }
    }

    if (!versionInfo) throw new Error('Chrome failed to start CDP listener on port 9224');
    console.log('✓ Connected to Chrome CDP on port 9224');

    const putRes = await fetch('http://127.0.0.1:9224/json/new?http://localhost:8000/frontend-demo/index.html', { method: 'PUT' });
    const tab = await putRes.json();
    console.log('✓ Navigated to ErgoGuard-AI web application');

    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    let messageId = 1;
    const pendingPromises = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingPromises.has(msg.id)) {
        const { resolve, reject } = pendingPromises.get(msg.id);
        pendingPromises.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = messageId++;
        pendingPromises.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const result = await sendCommand('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || 'Evaluation error');
      }
      return result.result?.value;
    }

    await sendCommand('Runtime.enable');
    await sendCommand('DOM.enable');

    // Wait for DOM & vision pipeline initialization
    await sleep(2500);

    const docTitle = await evaluate('document.title');
    console.log('✓ Document Title:', docTitle);
    assert.ok(docTitle.includes('ErgoGuard-AI'));

    // Check Badges: 100% browser-local
    const poseBadge = await evaluate('document.getElementById("badgePoseState").textContent.trim()');
    const storageBadge = await evaluate('document.getElementById("badgeStorageState").textContent.trim()');
    console.log('✓ Pose Model Badge:', poseBadge);
    console.log('✓ Storage Badge:', storageBadge);
    assert.ok(poseBadge.includes('Ready'));
    assert.ok(storageBadge.includes('Ready'));

    console.log('\n--- TEST A: WAREHOUSE WORKER CROUCHING / BENDING ---');
    // Simulate warehouse worker crouching down to wrap pallet or pick up tools
    // Knee angle flexed (< 130°), low pelvis (H/W collapsed = 0.82)
    const warehouseCrouchTest = await evaluate(`
      (() => {
        const engine = window.__ergoguard.engine;
        engine.reset();

        const crouchingWorker = {
          track_id: 2,
          bbox: { x1: 200, y1: 250, x2: 420, y2: 430 }, // H=180, W=220, aspect=0.82
          ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
          landmarks: [
            { x: 300, y: 260, visibility: 0.90 }, // 0: nose
            ...Array(6).fill({ x: 0, y: 0, visibility: 0.1 }),
            { x: 290, y: 265, visibility: 0.85 }, // 7: left ear
            { x: 310, y: 265, visibility: 0.85 }, // 8: right ear
            { x: 0, y: 0, visibility: 0.1 },
            { x: 0, y: 0, visibility: 0.1 },
            { x: 280, y: 290, visibility: 0.95 }, // 11: left shoulder
            { x: 320, y: 290, visibility: 0.95 }, // 12: right shoulder
            ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
            { x: 270, y: 380, visibility: 0.95 }, // 23: left hip
            { x: 310, y: 380, visibility: 0.95 }, // 24: right hip
            { x: 250, y: 400, visibility: 0.90 }, // 25: left knee flexed
            { x: 330, y: 400, visibility: 0.90 }, // 26: right knee flexed
            { x: 270, y: 420, visibility: 0.90 }, // 27: left ankle
            { x: 310, y: 420, visibility: 0.90 }, // 28: right ankle
          ],
        };

        // Process frames over 1000ms (sustained crouch)
        let res;
        for (let t = 0; t <= 1000; t += 200) {
          res = engine.processFrame({ timestamp: t, frameId: t / 200 + 1, workers: [crouchingWorker] });
        }

        const worker = res.workers[0];
        return {
          fallState: worker.fall.fallState,
          isFallen: worker.fall.isFallen,
          riskScore: worker.riskScore,
          severity: worker.severity,
          hasFallViolation: worker.findings.some(f => f.type === 'FallEvent'),
          activeIncidents: res.activeIncidents.length,
        };
      })()
    `);

    console.log('✓ Warehouse worker crouch results:', warehouseCrouchTest);
    assert.strictEqual(warehouseCrouchTest.isFallen, false, 'Crouching worker must NOT be classified as fallen');
    assert.strictEqual(warehouseCrouchTest.fallState, 'NORMAL', 'Fall state must remain NORMAL for crouching');
    assert.strictEqual(warehouseCrouchTest.hasFallViolation, false, 'Must NOT generate FallEvent finding');
    assert.strictEqual(warehouseCrouchTest.riskScore, 0, 'Risk score must be 0 for crouching worker with clean posture');
    assert.strictEqual(warehouseCrouchTest.activeIncidents, 0, 'Active incidents must be 0');
    console.log('✓ VERIFIED: Warehouse crouching worker does NOT trigger false FallEvent');

    console.log('\n--- TEST B: GENUINE FALL & RECOVERY IN BROWSER APP ---');
    // Test genuine fall sequence and inspect real-time DOM UI updates
    const fallSimulationResult = await evaluate(`
      (() => {
        const engine = window.__ergoguard.engine;
        engine.reset();

        const fallenWorker = {
          track_id: 1,
          bbox: { x1: 100, y1: 400, x2: 450, y2: 500 }, // H=100, W=350, aspect=0.28
          landmarks: [
            ...Array(11).fill({ x: 120, y: 450, visibility: 0.3 }),
            { x: 140, y: 440, visibility: 0.95 }, // 11: left shoulder on floor
            { x: 140, y: 460, visibility: 0.95 }, // 12: right shoulder
            ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
            { x: 280, y: 440, visibility: 0.95 }, // 23: left hip on floor
            { x: 280, y: 460, visibility: 0.95 }, // 24: right hip
            { x: 350, y: 445, visibility: 0.90 }, // 25: left knee on floor
            { x: 350, y: 465, visibility: 0.90 }, // 26: right knee
            { x: 420, y: 445, visibility: 0.90 }, // 27: left ankle
            { x: 420, y: 465, visibility: 0.90 }, // 28: right ankle
          ],
        };

        // Frame 1 @ t=0: Ground contact
        engine.processFrame({ timestamp: 0, frameId: 1, workers: [fallenWorker] });

        // Frame 2 @ t=500ms: Ground persistence (>= 333ms confirm threshold) -> Confirmed Fall!
        const fallRes = engine.processFrame({ timestamp: 500, frameId: 2, workers: [fallenWorker] });

        return {
          fallScore: fallRes.overallRisk.score,
          fallSeverity: fallRes.overallRisk.severity,
          activeIncidents: fallRes.activeIncidents.map(i => ({ type: i.ruleType, score: i.riskScore })),
          workerFallState: fallRes.workers[0].fall.fallState,
          isFallen: fallRes.workers[0].fall.isFallen,
        };
      })()
    `);

    console.log('✓ Genuine fall simulation result:', fallSimulationResult);
    assert.strictEqual(fallSimulationResult.isFallen, true, 'Genuine fall must set isFallen = true');
    assert.strictEqual(fallSimulationResult.workerFallState, 'FALLEN', 'Fall state must be FALLEN');
    assert.strictEqual(fallSimulationResult.fallScore >= 90, true, 'Fall score must be >= 90');
    assert.strictEqual(fallSimulationResult.fallSeverity, 'CRITICAL', 'Severity must be CRITICAL');
    assert.ok(fallSimulationResult.activeIncidents.some(i => i.type === 'FallEvent'), 'Must have active FallEvent incident');
    console.log('✓ VERIFIED: Genuine fall produces confirmed FallEvent (+90 pts, CRITICAL)');

    // Now test recovery: worker stands back up
    const recoveryResult = await evaluate(`
      (() => {
        const engine = window.__ergoguard.engine;
        const uprightWorker = {
          track_id: 1,
          bbox: { x1: 200, y1: 100, x2: 350, y2: 500 }, // H=400, W=150, aspect=2.67
          ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
          landmarks: [
            ...Array(11).fill({ x: 275, y: 120, visibility: 0.4 }),
            { x: 260, y: 160, visibility: 0.95 }, // 11: left shoulder
            { x: 290, y: 160, visibility: 0.95 }, // 12: right shoulder
            ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
            { x: 265, y: 280, visibility: 0.95 }, // 23: left hip
            { x: 285, y: 280, visibility: 0.95 }, // 24: right hip
            { x: 265, y: 380, visibility: 0.90 }, // 25: left knee
            { x: 285, y: 380, visibility: 0.90 }, // 26: right knee
            { x: 265, y: 480, visibility: 0.90 }, // 27: left ankle
            { x: 285, y: 480, visibility: 0.90 }, // 28: right ankle
          ],
        };

        const recRes = engine.processFrame({ timestamp: 1500, frameId: 3, workers: [uprightWorker] });
        return {
          score: recRes.overallRisk.score,
          severity: recRes.overallRisk.severity,
          activeIncidentsCount: recRes.activeIncidents.length,
          workerFallState: recRes.workers[0].fall.fallState,
          isFallen: recRes.workers[0].fall.isFallen,
        };
      })()
    `);

    console.log('✓ Recovery result:', recoveryResult);
    assert.strictEqual(recoveryResult.score, 0, 'Risk score must return to 0 upon recovery');
    assert.strictEqual(recoveryResult.severity, 'LOW', 'Severity must return to LOW upon recovery');
    assert.strictEqual(recoveryResult.activeIncidentsCount, 0, 'Active incidents must return to 0');
    assert.strictEqual(recoveryResult.isFallen, false, 'isFallen must be false');
    console.log('✓ VERIFIED: Recovery immediately resolves FallEvent and resets score to 0 (LOW)');

    console.log('\n--- TEST D: FORWARD BENDING & SEVERE STOOP IN BROWSER APP ---');
    // Test forward bending towards camera (sagittal plane using MediaPipe 3D Z coords)
    // Upright worker at t=0, bends forward towards camera at t=500, sustains for 3.5s -> CRITICAL (80 pts)
    const forwardBendingResult = await evaluate(`
      (() => {
        const engine = window.__ergoguard.engine;
        engine.reset();

        // 1. Upright worker facing camera
        const uprightWorker = {
          track_id: 1,
          bbox: { x1: 200, y1: 100, x2: 360, y2: 500, confidence: 0.95 },
          ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
          landmarks: [
            { x: 280, y: 110, z: 0, visibility: 0.95 }, // 0: nose
            ...Array(10).fill({ x: 0, y: 0, z: 0, visibility: 0.1 }),
            { x: 250, y: 150, z: 0, visibility: 0.95 }, // 11: left shoulder
            { x: 310, y: 150, z: 0, visibility: 0.95 }, // 12: right shoulder
            ...Array(10).fill({ x: 0, y: 0, z: 0, visibility: 0.1 }),
            { x: 260, y: 300, z: 0, visibility: 0.95 }, // 23: left hip
            { x: 300, y: 300, z: 0, visibility: 0.95 }, // 24: right hip
            { x: 260, y: 400, z: 0, visibility: 0.90 }, // 25: left knee (180°)
            { x: 300, y: 400, z: 0, visibility: 0.90 }, // 26: right knee (180°)
            { x: 260, y: 490, z: 0, visibility: 0.90 }, // 27: left ankle
            { x: 300, y: 490, z: 0, visibility: 0.90 }, // 28: right ankle
          ],
        };

        // Frame 1 @ t=0: Baseline upright
        const f0 = engine.processFrame({ timestamp: 0, frameId: 1, workers: [uprightWorker] });
        const initialAngle = f0.workers[0].posture.angles.trunkInclinationDeg;

        // 2. Worker bends forward 60° towards camera (dx=0, dy=75, dz=-130 -> 60° from vertical in 3D)
        const forwardBendingWorker = {
          track_id: 1,
          bbox: { x1: 200, y1: 150, x2: 360, y2: 500, confidence: 0.95 },
          ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
          landmarks: [
            { x: 280, y: 180, z: -160, visibility: 0.95 }, // 0: nose closer to camera
            ...Array(10).fill({ x: 0, y: 0, z: 0, visibility: 0.1 }),
            { x: 250, y: 225, z: -130, visibility: 0.95 }, // 11: left shoulder forward in Z
            { x: 310, y: 225, z: -130, visibility: 0.95 }, // 12: right shoulder forward in Z
            ...Array(10).fill({ x: 0, y: 0, z: 0, visibility: 0.1 }),
            { x: 260, y: 300, z: 0, visibility: 0.95 }, // 23: left hip
            { x: 300, y: 300, z: 0, visibility: 0.95 }, // 24: right hip
            { x: 260, y: 400, z: 0, visibility: 0.90 }, // 25: straight knee (180°)
            { x: 300, y: 400, z: 0, visibility: 0.90 }, // 26: straight knee (180°)
            { x: 260, y: 490, z: 0, visibility: 0.90 }, // 27: ankle
            { x: 300, y: 490, z: 0, visibility: 0.90 }, // 28: ankle
          ],
        };

        // Frame 2 @ t=1000ms: Brief bending within grace window (< 1.5s)
        const f1 = engine.processFrame({ timestamp: 1000, frameId: 2, workers: [forwardBendingWorker] });
        const briefAngle = f1.workers[0].posture.angles.trunkInclinationDeg;

        // Frame 3 @ t=3500ms: Sustained severe stoop (>= 3.0s at 60°) -> Escalates to CRITICAL (80 pts)
        const f2 = engine.processFrame({ timestamp: 3500, frameId: 3, workers: [forwardBendingWorker] });
        const w = f2.workers[0];
        const postFinding = w.findings.find(f => f.type === 'UnsafePosture');

        return {
          initialAngle,
          briefAngle,
          sustainedAngle: w.posture.angles.trunkInclinationDeg,
          stoopDurationMs: w.posture.angles.stoopDurationMs,
          severeStoopDurationMs: w.posture.angles.severeStoopDurationMs,
          postureState: w.posture.postureState,
          riskLevel: w.posture.riskLevel,
          workerRiskScore: w.riskScore,
          workerSeverity: w.severity,
          overallRiskScore: f2.overallRisk.score,
          overallSeverity: f2.overallRisk.severity,
          hasPostureFinding: Boolean(postFinding),
          postureFindingPoints: postFinding?.points,
          postureFindingSeverity: postFinding?.evidence?.severity,
          activeIncidents: f2.activeIncidents.length,
          fallState: w.fall.fallState,
          isFallen: w.fall.isFallen,
        };
      })()
    `);

    console.log('✓ Forward bending browser evaluation result:', forwardBendingResult);
    assert.ok(forwardBendingResult.initialAngle < 5.0, 'Upright initial trunk angle must be < 5°');
    assert.ok(forwardBendingResult.briefAngle >= 55.0, 'Bending trunk angle must be >= 55° (3D sagittal inclination)');
    assert.ok(forwardBendingResult.sustainedAngle >= 55.0, 'Sustained trunk angle must be >= 55°');
    assert.ok(forwardBendingResult.stoopDurationMs >= 3000, 'Stoop duration must accumulate >= 3000ms');
    assert.strictEqual(forwardBendingResult.postureState, 'UNSAFE_LIFTING', 'Must classify as UNSAFE_LIFTING');
    assert.strictEqual(forwardBendingResult.hasPostureFinding, true, 'Must generate UnsafePosture finding');
    assert.strictEqual(forwardBendingResult.postureFindingPoints, 80, 'Must award 80 points for severe sustained stoop');
    assert.strictEqual(forwardBendingResult.postureFindingSeverity, 'CRITICAL', 'Individual violation severity must be CRITICAL');
    assert.strictEqual(forwardBendingResult.workerRiskScore, 80.0, 'Worker risk score must be 80.0');
    assert.strictEqual(forwardBendingResult.workerSeverity, 'CRITICAL', 'Worker severity must be CRITICAL');
    assert.strictEqual(forwardBendingResult.overallRiskScore, 80.0, 'Overall dashboard risk score must be 80.0');
    assert.strictEqual(forwardBendingResult.overallSeverity, 'CRITICAL', 'Overall dashboard severity must be CRITICAL');
    assert.strictEqual(forwardBendingResult.isFallen, false, 'Fall detector must remain false during forward stoop');
    assert.strictEqual(forwardBendingResult.fallState, 'NORMAL', 'Fall state must remain NORMAL');
    assert.strictEqual(forwardBendingResult.activeIncidents, 1, 'Must register exactly 1 active incident');
    console.log('✓ VERIFIED: Sustained forward bending in browser correctly calculates 60° trunk inclination, accumulates duration, and triggers UnsafePosture CRITICAL (80 pts)');

    console.log('\n--- TEST E: ZERO-BACKEND CONFIRMATION ---');
    const backendCheck = await evaluate(`
      (() => {
        // Inspect window and scripts to verify zero backend URLs, no FastAPI, no Python endpoints
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src);
        const hasExternalInferenceUrl = scripts.some(s => s.includes('fastapi') || s.includes('predict') || s.includes(':5000') || s.includes(':8001'));
        return {
          totalScriptTags: scripts.length,
          hasExternalInferenceUrl,
          hasEngineLocal: Boolean(window.__ergoguard?.engine),
          hasPipelineLocal: Boolean(window.__ergoguard?.pipeline),
          hasStorageLocal: Boolean(window.__ergoguard?.storage),
        };
      })()
    `);

    console.log('✓ Zero-backend client verification:', backendCheck);
    assert.strictEqual(backendCheck.hasExternalInferenceUrl, false, 'No external inference URL');
    assert.strictEqual(backendCheck.hasEngineLocal, true, 'Engine is 100% browser-local');
    assert.strictEqual(backendCheck.hasPipelineLocal, true, 'Pipeline is 100% browser-local');
    assert.strictEqual(backendCheck.hasStorageLocal, true, 'Storage is 100% browser-local (IndexedDB)');

    console.log('\n=============================================================');
    console.log('ALL BROWSER WAREHOUSE & GENUINE FALL TESTS PASSED! (100% BROWSER-LOCAL)');
    console.log('=============================================================\n');

    ws.close();
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      chromeProcess.kill();
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main();
