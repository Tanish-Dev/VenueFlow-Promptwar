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

## Challenge Coverage

This submission is designed to meet the challenge expectations and review rubric:

- Smart, dynamic assistant behavior: live recommendations, risk-driven playbook actions, smart routing, and scenario-aware simulation.
- Logical decision making: realtime decisions are generated from venue state (density, wait, staffing, risk, phase).
- Google Services integration:
  - Google Calendar integration from Arrival Advisor (adds match-day plan).
  - Google Maps integration from Smart Path (opens recommended parking + gate route).
- Practical usability: attendee, operations, and fan views with realtime updates and command controls.
- Clean maintainable code: modular backend engine/rules separation and documented architecture.

Rubric implementation status:

- Code Quality: improved API validation and clearer rendering helpers.
- Security: CSP + security headers, CORS allowlist support, and control endpoint rate limiting.
- Efficiency: websocket-first sync with timed fetch fallback and request timeouts.
- Testing: Node test suite for simulation engine and rules engine.
- Accessibility: skip link, stronger focus states, keyboard-accessible actionable controls, modal close labeling.
- Google Services: actionable integrations for Maps and Calendar from the live UI.

## Submission Checklist (Evidence Map)

Use this checklist during review to quickly trace each rubric requirement to concrete implementation evidence.

| Requirement                 | Implemented Feature                                                                    | File Evidence                                                         | Verification Proof                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Smart, dynamic assistant    | Live playbook recommendations + smart routing + predictive wave updates                | `server/rulesEngine.js`, `server/engine.js`, `index.html`             | Open app and observe action playbook and smart path updating as simulation phase changes                     |
| Logical decision making     | Decisions based on density, wait time, risk index, staffing, and phase                 | `server/engine.js`, `server/rulesEngine.js`                           | Change scenario / gate mode in Operations view and confirm recommendations and KPIs react accordingly        |
| Code Quality                | Modular engine/rules/server split with explicit APIs and helper functions              | `server/engine.js`, `server/rulesEngine.js`, `server/index.js`        | Codebase separated by concern: simulation, rules, transport/API                                              |
| Security                    | Input validation, CORS allowlist, control endpoint rate limiting, and security headers | `server/index.js`                                                     | Hit invalid control payloads to receive 400 errors; inspect response headers for CSP/X-Frame-Options/nosniff |
| Efficiency                  | WebSocket-first realtime sync with fallback polling and request timeouts               | `server/index.js`, `index.html`                                       | Backend mode uses realtime snapshots; fallback polling kicks in on disconnect                                |
| Testing                     | Automated tests for engine behavior and playbook logic                                 | `server/engine.test.js`, `server/rulesEngine.test.js`, `package.json` | Run `npm test` (currently passing: 6/6)                                                                      |
| Accessibility               | Skip link, visible focus states, keyboard-accessible controls, modal close labeling    | `index.html`                                                          | Navigate via keyboard (Tab/Shift+Tab/Escape) and verify controls/modal are fully operable                    |
| Google Services integration | Google Calendar event creation + Google Maps route handoff                             | `index.html`                                                          | Use "Add to Google Calendar" and "Open Route in Google Maps" buttons from the Attendee view                  |
| Practical usability         | Three role-oriented views (Attendee, Operations, Fan Hub) with actionable UI           | `index.html`, `server/engine.js`                                      | Validate end-to-end flow: arrival advice -> live operations control -> fan engagement updates                |

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

4. Run automated tests.

```bash
npm test
```

## Backend Mode URL Pattern

Use backend mode from any hosted frontend URL:

```text
?mode=backend&api=https://your-backend.example.com
```

Optional websocket override:

```text
&ws=wss://your-backend.example.com/realtime
```
