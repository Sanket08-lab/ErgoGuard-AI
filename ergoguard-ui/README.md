# ErgoGuard React UI

The React dashboard from `ErgoGuard_React_Frontend.zip` is integrated here with its overview, monitoring, incidents, analytics, workers/zones, and settings pages.

## Start the UI

```powershell
npm install
npm run dev
```

To connect live detections, start the existing API from `project aithon` in a second terminal:

```powershell
python api_server.py
```

The frontend requests `GET http://localhost:8000/api/detections/latest`. It polls the dashboard snapshot every eight seconds and falls back to `demo-data.json` if the API is unavailable. Copy `.env.example` to `.env` to configure the API base URL or force demo mode; restart Vite after changing environment values.

## Build

```powershell
npm run build
npm run preview
```

## Integration notes

- `src/services/api.js` adapts the detection contract fields (`summary`, `workers`, `violations`, `critical_alerts`, and `danger_zones`) to the supplied UI pages.
- The current API provides latest-frame detections, not historical analytics. Live analytics therefore show the latest frame; the hourly chart is labeled as sample data when demo mode is active.
- The detection schema does not provide an overall safety score or incident risk score, so the live UI does not fabricate those values.
- The monitoring page can preview a browser camera stream. The stream is separate from the server-side AI detections; enabling it does not run the ErgoGuard detectors in the browser.
- `src/pages/` contains the integrated page views, `src/components/` has shared UI components, and `src/styles.css` contains the supplied responsive design.
