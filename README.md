# VenueFlow Platform

VenueFlow is a realtime venue operations dashboard and simulation system for major sports events.

## Chosen Vertical

Sports and live-event venue operations intelligence.

The product focuses on stadium flow management, gate throughput, crowd safety, staffing allocation, and attendee navigation during high-density match days.

## Approach and Logic

The redesign follows a light dashboard language inspired by the provided reference while preserving VenueFlow's unique information architecture.

Design and product logic used:

- Keep all existing simulation content and controls instead of rebuilding from scratch.
- Shift visual direction to bright surfaces, soft neutral grays, and limited green accents.
- Improve scanability through card grouping, rounded pill controls, and clear metric emphasis.
- Preserve all existing DOM ids and interaction hooks so realtime logic and backend APIs remain unchanged.
- Avoid direct imitation of the reference layout by keeping VenueFlow-specific modules: heatmap, smart path, queue advisor, ops controls, and fan hub.

## How the Solution Works

### Frontend

- Single-page interface in [index.html](index.html).
- Three views: Attendee, Operations, and Fan Hub.
- Live rendering loop updates map density, KPIs, route recommendations, queue status, weather strip, and alerts.

### Simulation and Rules

- Local simulation model computes zone occupancy, velocity, density, wait times, and phase transitions.
- Rules engine generates playbook actions and coordination events from live conditions.

### Realtime Backend (Optional)

- REST + WebSocket backend in [server/index.js](server/index.js).
- Backend mode syncs UI with server snapshots and control commands.

Core files:

- [server/engine.js](server/engine.js): simulation state + control state
- [server/rulesEngine.js](server/rulesEngine.js): recommended actions
- [server/index.js](server/index.js): API + websocket endpoint
- [index.html](index.html): interactive dashboard frontend

## Assumptions Made

- Users need a web-based control surface that can run in local simulation mode without backend dependencies.
- A single accent family (green) is enough for the primary visual hierarchy; warning and critical states still use amber/red semantics.
- Existing feature depth is more valuable than a full structural rewrite, so interaction logic was retained and only visual language was modernized.
- The attached reference is a direction for tone and aesthetics, not a template to clone component-by-component.

## Run Locally

1. Install dependencies.

```bash
npm install
```

2. Start development server.

```bash
npm run dev
```

3. Open these endpoints.

- UI: http://localhost:8080/
- Health: http://localhost:8080/api/health
- Realtime: ws://localhost:8080/realtime

## Backend Mode URL Pattern

Use backend mode from any hosted frontend URL:

```text
?mode=backend&api=https://your-backend.example.com
```

Optional websocket override:

```text
&ws=wss://your-backend.example.com/realtime
```
