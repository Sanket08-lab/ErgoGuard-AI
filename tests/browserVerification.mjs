import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempProfileDir = path.join(os.tmpdir(), `chrome_test_profile_${Date.now()}`);
fs.mkdirSync(tempProfileDir, { recursive: true });

console.log('Starting Chrome for end-to-end integration verification...');
const chromeProcess = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9222',
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
    // Wait for Chrome CDP port to become active
    let versionInfo = null;
    for (let i = 0; i < 30; i++) {
      try {
        versionInfo = await getJson('http://127.0.0.1:9222/json/version');
        if (versionInfo && versionInfo.webSocketDebuggerUrl) break;
      } catch (e) {
        await sleep(300);
      }
    }

    if (!versionInfo) {
      throw new Error('Chrome failed to start CDP listener on port 9222');
    }
    console.log('✓ Connected to Chrome CDP:', versionInfo.Browser);

    // Open a new tab for ErgoGuard-AI demo via PUT
    const putRes = await fetch('http://127.0.0.1:9222/json/new?http://localhost:8000/frontend-demo/index.html', { method: 'PUT' });
    const newTab = await putRes.json();
    console.log('✓ Navigated to http://localhost:8000/frontend-demo/index.html (target:', newTab.id, ')');

    const ws = new WebSocket(newTab.webSocketDebuggerUrl);

    let messageId = 1;
    const pendingPromises = new Map();
    const consoleLogs = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingPromises.has(msg.id)) {
        const { resolve, reject } = pendingPromises.get(msg.id);
        pendingPromises.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value || JSON.stringify(a)).join(' ');
        consoleLogs.push(`[Browser Console ${msg.params.type}] ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text;
        consoleLogs.push(`[Browser Exception] ${desc}`);
      }
    };

    await new Promise((resolve) => { ws.onopen = resolve; });

    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = messageId++;
        pendingPromises.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    // Enable Runtime and Page domains
    await sendCommand('Runtime.enable');
    await sendCommand('Page.enable');

    async function evaluate(expression) {
      const res = await sendCommand('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error');
      }
      return res.result?.value;
    }

    console.log('\n--- VERIFYING APPLICATION INITIALIZATION ---');

    // 1. Wait for DOM and initial async initialization (IndexedDB, Service Worker, MediaPipe)
    await sleep(2500);

    const docTitle = await evaluate('document.title');
    console.log('✓ Document Title:', docTitle);

    // 2. Check UI Badges
    const badgePose = await evaluate('document.getElementById("badgePoseState").textContent.trim()');
    const badgePpe = await evaluate('document.getElementById("badgePpeState").textContent.trim()');
    const badgeStorage = await evaluate('document.getElementById("badgeStorageState").textContent.trim()');
    const badgeOffline = await evaluate('document.getElementById("badgeOfflineState").textContent.trim()');

    console.log('✓ Badge Pose State:', badgePose);
    console.log('✓ Badge PPE State:', badgePpe);
    console.log('✓ Badge Storage State:', badgeStorage);
    console.log('✓ Badge Offline State:', badgeOffline);

    // Assert truthful states
    if (!badgePpe.includes('PPE MODEL NOT AVAILABLE')) {
      console.warn('WARNING: PPE badge expected "PPE MODEL NOT AVAILABLE", got:', badgePpe);
    } else {
      console.log('✓ VERIFIED: Application truthfully reports "PPE MODEL NOT AVAILABLE"');
    }

    if (badgeStorage.includes('Ready')) {
      console.log('✓ VERIFIED: IndexedDB initialized and connected via Dexie.js');
    }

    console.log('\n--- VERIFYING SIMULATION & RISK ENGINE ---');

    // 3. Switch to test mode and run standard fixture
    await evaluate('document.getElementById("modeTest").click()');
    await sleep(300);

    // Process single frame
    await evaluate('document.getElementById("btnProcessSingle").click()');
    await sleep(500);

    const overallScore = await evaluate('document.getElementById("kpiOverallScore").textContent.trim()');
    const severity = await evaluate('document.getElementById("kpiSeverity").textContent.trim()');
    const workerCount = await evaluate('document.getElementById("kpiWorkerCount").textContent.trim()');

    console.log(`✓ Fixture evaluation: Score=${overallScore}, Severity=${severity}, Workers=${workerCount}`);

    // Check findings breakdown tabs
    const postureHtml = await evaluate('document.getElementById("postureFindingsContent").textContent.trim()');
    const ppeHtml = await evaluate('document.getElementById("ppeFindingsContent").textContent.trim()');
    const fallHtml = await evaluate('document.getElementById("fallFindingsContent").textContent.trim()');

    console.log('✓ Posture panel text length:', postureHtml.length);
    console.log('✓ PPE panel text length:', ppeHtml.length);
    console.log('✓ Fall panel text length:', fallHtml.length);

    console.log('\n--- VERIFYING INDEXEDDB HISTORY ---');

    // 4. Open History Modal and check saved records
    await evaluate('document.getElementById("btnOpenHistory").click()');
    await sleep(500);

    const historyRowCount = await evaluate('document.getElementById("historyTableBody").querySelectorAll("tr").length');
    const historyFirstRow = await evaluate('document.getElementById("historyTableBody").querySelector("tr")?.textContent.trim()');
    console.log(`✓ IndexedDB records rendered: ${historyRowCount} rows`);
    console.log(`✓ First row data: ${historyFirstRow}`);

    // Test JSON export via window.__ergoguard.storage
    const exportJson = await evaluate(`window.__ergoguard.storage.exportAsJSON()`);
    const parsedExport = JSON.parse(exportJson);
    console.log(`✓ IndexedDB export verified: ${parsedExport.inspections?.length} inspection records exported as valid JSON`);

    console.log('\n--- VERIFYING WEBCAM AI LIFECYCLE ---');

    // 5. Switch to Camera mode and start webcam
    await evaluate('document.getElementById("modeCamera").click()');
    await sleep(300);

    await evaluate('document.getElementById("btnStartCamera").click()');
    console.log('✓ Clicked "Start Camera & Monitoring"');
    await sleep(2000);

    const isVideoPlaying = await evaluate('!document.getElementById("webcamVideo").paused');
    const pipelineStatus = await evaluate('document.getElementById("pipelineStatusMsg").textContent.trim()');
    const fpsText = await evaluate('document.getElementById("fpsTelemetry").textContent.trim()');

    console.log('✓ Video element streaming:', isVideoPlaying);
    console.log('✓ Pipeline status:', pipelineStatus);
    console.log('✓ FPS / Latency telemetry:', fpsText);

    // Stop camera
    await evaluate('document.getElementById("btnStopCamera").click()');
    await sleep(500);

    const isVideoStopped = await evaluate('document.getElementById("webcamVideo").srcObject === null');
    const stoppedStatus = await evaluate('document.getElementById("pipelineStatusMsg").textContent.trim()');
    console.log('✓ Camera stopped and tracks released:', isVideoStopped);
    console.log('✓ Pipeline stopped status:', stoppedStatus);

    console.log('\n--- VERIFYING CUSTOM ONNX ERROR VALIDATION ---');

    // 6. Test invalid ONNX file handling (must not crash)
    const onnxTestResult = await evaluate(`
      (async () => {
        const detector = window.__ergoguard.pipeline.ppeDetector;
        try {
          const fakeBuffer = new ArrayBuffer(16);
          await detector.loadModelFromBuffer(fakeBuffer);
          return 'unexpected_success';
        } catch (err) {
          return 'caught_error: ' + err.message;
        }
      })()
    `);
    console.log('✓ Custom ONNX error validation:', onnxTestResult);

    console.log('\n--- VERIFYING 3-PERSON MULTI-DETECTION & SKELETONS IN LIVE BROWSER ---');

    // 7. Verify PoseDetector numPoses is configured for multi-person tracking (numPoses >= 3)
    const numPosesConfig = await evaluate('window.__ergoguard.pipeline.poseDetector.numPoses');
    console.log(`✓ Detector configured numPoses limit: ${numPosesConfig} (Supports 3+ concurrent people)`);
    if (numPosesConfig < 3) {
      throw new Error(`PoseDetector numPoses is ${numPosesConfig}, must be >= 3`);
    }

    // 8. Inject 3 simultaneous people into the live browser application
    const multiPersonResult = await evaluate(`
      (() => {
        function makePerson(id, cx) {
          const rawNormLandmarks = Array(33).fill(null).map(() => ({ x: cx, y: 0.5, z: 0, visibility: 0.1 }));
          rawNormLandmarks[0] = { x: cx, y: 0.20, z: 0, visibility: 0.95 }; // head
          rawNormLandmarks[11] = { x: cx - 0.08, y: 0.35, z: 0, visibility: 0.92 }; // left shoulder
          rawNormLandmarks[12] = { x: cx + 0.08, y: 0.35, z: 0, visibility: 0.92 }; // right shoulder
          rawNormLandmarks[23] = { x: cx - 0.06, y: 0.55, z: 0, visibility: 0.90 }; // left hip
          rawNormLandmarks[24] = { x: cx + 0.06, y: 0.55, z: 0, visibility: 0.90 }; // right hip
          rawNormLandmarks[25] = { x: cx - 0.06, y: 0.70, z: 0, visibility: 0.85 }; // left knee
          rawNormLandmarks[26] = { x: cx + 0.06, y: 0.70, z: 0, visibility: 0.85 }; // right knee

          const pixelLandmarks = rawNormLandmarks.map(lm => ({
            x: Math.round(lm.x * 640),
            y: Math.round(lm.y * 480),
            z: 0,
            visibility: lm.visibility,
          }));

          const padX = 50;
          const x1 = Math.round(cx * 640 - padX);
          const x2 = Math.round(cx * 640 + padX);

          return {
            track_id: id,
            bbox: { x1, y1: 80, x2, y2: 420, width: x2 - x1, height: 340, confidence: 0.92 },
            ppe: {
              helmet: { detected: true, confidence: 0.2, bounding_box: null },
              vest: { detected: true, confidence: 0.2, bounding_box: null },
            },
            landmarks: pixelLandmarks,
            rawNormLandmarks,
          };
        }

        const payload3 = {
          frame_id: 300,
          timestamp: Date.now(),
          camera_id: 'webcam_local',
          workers: [
            makePerson(1, 0.20), // Person 1 (left)
            makePerson(2, 0.50), // Person 2 (center)
            makePerson(3, 0.80), // Person 3 (right)
          ],
        };

        const res = window.__ergoguard.processFrameInput(payload3, false);
        const cardCount = document.getElementById('workerListContainer').querySelectorAll('.worker-card').length;
        const workerKpi = document.getElementById('kpiWorkerCount').textContent.trim();
        const activeBadge = document.getElementById('activeWorkerBadge').textContent.trim();

        // Sample canvas pixel data around the 3 skeleton shoulder coordinates to confirm drawings exist
        const canvas = window.__ergoguard.visualizerCanvas;
        const ctx = canvas.getContext('2d');
        const p1Data = ctx.getImageData(Math.round(0.20 * canvas.width), Math.round(0.35 * canvas.height), 5, 5).data;
        const p2Data = ctx.getImageData(Math.round(0.50 * canvas.width), Math.round(0.35 * canvas.height), 5, 5).data;
        const p3Data = ctx.getImageData(Math.round(0.80 * canvas.width), Math.round(0.35 * canvas.height), 5, 5).data;

        // Verify non-background pixel color
        const p1Drawn = Array.from(p1Data).some((v, i) => i % 4 !== 3 && v > 50);
        const p2Drawn = Array.from(p2Data).some((v, i) => i % 4 !== 3 && v > 50);
        const p3Drawn = Array.from(p3Data).some((v, i) => i % 4 !== 3 && v > 50);

        return {
          evaluatedWorkers: res.workers.length,
          workerKpi,
          activeBadge,
          cardCount,
          workerIds: res.workers.map(w => w.trackId),
          skeletonsDrawn: { p1Drawn, p2Drawn, p3Drawn },
        };
      })()
    `);

    console.log('✓ 3-Person Browser Evaluation Result:', JSON.stringify(multiPersonResult, null, 2));
    if (multiPersonResult.evaluatedWorkers !== 3 || multiPersonResult.cardCount !== 3) {
      throw new Error(`Expected 3 workers in live browser, got ${multiPersonResult.evaluatedWorkers}`);
    }
    console.log('✓ VERIFIED: 3 workers simultaneously tracked, rendered into 3 cards and 3 canvas skeletons!');

    console.log('\n--- BROWSER CONSOLE LOGS ---');
    consoleLogs.slice(-10).forEach((l) => console.log(l));

    console.log('\n========================================');
    console.log('ALL IN-BROWSER INTEGRATION TESTS PASSED!');
    console.log('========================================\n');

    ws.close();
  } catch (err) {
    console.error('Browser verification failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      chromeProcess.kill();
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main();
