# VenueFlow Platform

VenueFlow now runs as a realtime full-stack prototype instead of a static mock page.

## What Changed

- Added a backend crowd simulation and rules engine.
- Added control APIs for gate modes, staffing, scenarios, emergency corridors, and announcements.
- Added a sensor ingestion API to stream crowd observations into the model.
- Added a WebSocket realtime channel for live state streaming.

## Architecture

- `server/engine.js`: Core simulation, control state, KPI calculations, alerts.
- `server/rulesEngine.js`: Playbook recommendation logic.
- `server/index.js`: REST API, WebSocket hub, static hosting.
- `venueflow.html`: Existing UI frontend.

## Run

1. Install dependencies:

```bash
npm install
```

2. Start the platform:

```bash
npm run dev
```

3. Open:

- Main UI: `http://localhost:8080/`
- API health: `http://localhost:8080/api/health`
- Realtime stream: `ws://localhost:8080/realtime`

## Deploy on Netlify

This repo includes `netlify.toml`, so root traffic is served from `venueflow.html` automatically.

### Option 1: Static Deploy (fastest)

Use this if you want quick hosting of the full UI and local simulation mode.

1. Push this folder to GitHub.
2. In Netlify, choose **Add new site** -> **Import an existing project**.
3. Select this repository.
4. Build settings:

- Build command: _(leave empty)_
- Publish directory: `.`

5. Deploy.

Your site runs immediately in local simulation mode.

### Option 2: Netlify Frontend + Remote Backend (full realtime control)

Netlify is great for the frontend. For persistent simulation APIs + WebSocket realtime stream, run the backend on a Node host (Render, Railway, Fly.io, etc.), then point the frontend to it.

1. Deploy backend (`server/index.js`) to a Node host.
2. Open your Netlify URL with query params:

`https://your-site.netlify.app/?mode=backend&api=https://your-backend.example.com`

3. Optional: if your WebSocket endpoint differs, add:

`&ws=wss://your-backend.example.com/realtime`

The frontend will then pull `/api` data and sync realtime snapshots from that backend.

## Key APIs

### Read APIs

- `GET /api/snapshot`
- `GET /api/metrics`
- `GET /api/playbook`
- `GET /api/logs`
- `GET /api/options`

### Control APIs

- `POST /api/control/scenario`
- `POST /api/control/speed`
- `POST /api/control/emergency`
- `POST /api/control/gate`
- `POST /api/control/staff/deploy`
- `POST /api/control/staff/release`
- `POST /api/control/announcement`
- `POST /api/control/playbook`

### Sensor Ingestion

- `POST /api/ingest/sensors`

Example payload:

```json
{
  "readings": [
    {
      "zoneId": "concourse-n",
      "density": 0.82,
      "confidence": 0.91,
      "ttlSec": 45
    },
    {
      "zoneId": "gate-a",
      "count": 610,
      "confidence": 0.88
    }
  ]
}
```
