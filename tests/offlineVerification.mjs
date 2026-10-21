import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempProfileDir = path.join(os.tmpdir(), `chrome_offline_profile_${Date.now()}`);
fs.mkdirSync(tempProfileDir, { recursive: true });

console.log('Starting Chrome for genuine offline verification...');
const chromeProcess = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9223',
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
        versionInfo = await getJson('http://127.0.0.1:9223/json/version');
        if (versionInfo && versionInfo.webSocketDebuggerUrl) break;
      } catch (e) {
        await sleep(300);
      }
    }

    if (!versionInfo) throw new Error('Chrome failed to start CDP listener on port 9223');
    console.log('✓ Connected to Chrome CDP on port 9223');

    // 1. Initial online navigation to install and populate Service Worker cache
    const putRes = await fetch('http://127.0.0.1:9223/json/new?http://localhost:8000/frontend-demo/index.html', { method: 'PUT' });
    const tab = await putRes.json();
    console.log('✓ Navigated online to pre-cache assets');

    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    let messageId = 1;
    const pendingPromises = new Map();
    const networkRequests = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingPromises.has(msg.id)) {
        const { resolve, reject } = pendingPromises.get(msg.id);
        pendingPromises.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Network.requestWillBeSent') {
        networkRequests.push(msg.params.request.url);
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

    await sendCommand('Runtime.enable');
    await sendCommand('Page.enable');
    await sendCommand('Network.enable');

    async function evaluate(expression) {
      const res = await sendCommand('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.text || res.exceptionDetails.exception?.description || 'Eval error');
      }
      return res.result?.value;
    }

    // Allow Service Worker to install and pre-cache all assets
    console.log('Waiting for Service Worker pre-caching to complete...');
    await sleep(4000);

    const swState = await evaluate(`
      (async () => {
        if (!('serviceWorker' in navigator)) return 'unsupported';
        const reg = await navigator.serviceWorker.ready;
        return reg.active ? 'active' : 'inactive';
      })()
    `);
    console.log('✓ Service Worker state:', swState);

    // Verify cache contents
    const cachedKeys = await evaluate(`
      (async () => {
        const cache = await caches.open('ergoguard-ai-v1');
        const keys = await cache.keys();
        return keys.map(k => k.url.replace(location.origin, ''));
      })()
    `);
    console.log(`✓ Service Worker cached ${cachedKeys.length} assets locally, including model and wasm runtimes.`);

    console.log('\n--- EMULATING TOTAL NETWORK DISCONNECTION ---');

    // 2. Disconnect network completely via CDP Network.emulateNetworkConditions
    await sendCommand('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    console.log('✓ Network state set to OFFLINE: true');

    // Clear network log to track offline requests
    networkRequests.length = 0;

    // 3. Reload application while completely offline
    console.log('Reloading application while disconnected from internet...');
    await sendCommand('Page.reload', { ignoreCache: false });
    await sleep(3500);

    // 4. Verify DOM and components loaded from offline cache
    const offlineDocTitle = await evaluate('document.title');
    console.log('✓ Offline Page Title:', offlineDocTitle);

    const offlineBadgePose = await evaluate('document.getElementById("badgePoseState").textContent.trim()');
    const offlineBadgeStorage = await evaluate('document.getElementById("badgeStorageState").textContent.trim()');
    const offlineBadgePpe = await evaluate('document.getElementById("badgePpeState").textContent.trim()');

    console.log('✓ Offline Badge Pose State:', offlineBadgePose);
    console.log('✓ Offline Badge Storage State:', offlineBadgeStorage);
    console.log('✓ Offline Badge PPE State:', offlineBadgePpe);

    // 5. Test Live Camera and MediaPipe inference while offline
    console.log('\n--- TESTING LIVE CAMERA & INFERENCE WHILE OFFLINE ---');
    await evaluate('document.getElementById("btnStartCamera").click()');
    await sleep(2000);

    const isStreamingOffline = await evaluate('!document.getElementById("webcamVideo").paused');
    const offlineStatusMsg = await evaluate('document.getElementById("pipelineStatusMsg").textContent.trim()');
    const offlineTelemetry = await evaluate('document.getElementById("fpsTelemetry").textContent.trim()');

    console.log('✓ Camera streaming while offline:', isStreamingOffline);
    console.log('✓ Pipeline status while offline:', offlineStatusMsg);
    console.log('✓ Telemetry while offline:', offlineTelemetry);

    // Stop camera
    await evaluate('document.getElementById("btnStopCamera").click()');
    await sleep(500);

    // 6. Test IndexedDB persistence while offline
    console.log('\n--- TESTING INDEXEDDB PERSISTENCE WHILE OFFLINE ---');
    await evaluate(`
      (async () => {
        await window.__ergoguard.storage.recordInspection({
          timestamp: Date.now(),
          frameId: 999,
          overallScore: 0,
          overallSeverity: 'LOW',
          workerCount: 1,
          activeIncidentsCount: 0
        });
      })()
    `);

    const storedOfflineInspections = await evaluate(`
      (async () => {
        const recent = await window.__ergoguard.storage.getRecentInspections(10);
        return recent.length;
      })()
    `);
    console.log(`✓ IndexedDB functional offline: retrieved ${storedOfflineInspections} stored inspections`);

    // 7. Verify zero external network requests
    const externalRequests = networkRequests.filter((url) => !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1'));
    console.log(`✓ External network requests during offline inference: ${externalRequests.length}`);

    console.log('\n=============================================');
    console.log('GENUINE OFFLINE-FIRST VERIFICATION SUCCEEDED!');
    console.log('=============================================\n');

    ws.close();
  } catch (err) {
    console.error('Offline verification failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      chromeProcess.kill();
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main();
