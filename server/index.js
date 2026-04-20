import http from "node:http";
import path from "node:path";

import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

import { GATE_IDS, SCENARIOS, VenueSimulationEngine, ZONES } from "./engine.js";

const app = express();
const engine = new VenueSimulationEngine();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(process.cwd()));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "venueflow-platform",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/options", (_req, res) => {
  res.json({
    scenarios: Object.keys(SCENARIOS).map((id) => ({
      id,
      label: SCENARIOS[id].label,
    })),
    gates: GATE_IDS,
    zones: ZONES,
  });
});

app.get("/api/snapshot", (_req, res) => {
  res.json(engine.getSnapshot());
});

app.get("/api/metrics", (_req, res) => {
  res.json(engine.getMetrics());
});

app.get("/api/playbook", (_req, res) => {
  res.json({
    playbook: engine.getPlaybook(),
  });
});

app.get("/api/logs", (_req, res) => {
  res.json({
    logs: engine.getCoordinationLog(),
  });
});

app.post("/api/control/scenario", (req, res) => {
  const result = engine.setScenario(req.body?.scenario);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/speed", (req, res) => {
  const result = engine.setSpeed(req.body?.speed);
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/emergency", (req, res) => {
  const result = engine.setEmergency(req.body?.enabled);
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/gate", (req, res) => {
  const result = engine.setGateMode(req.body?.gateId, req.body?.mode);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/staff/deploy", (req, res) => {
  const result = engine.deployStaff(req.body?.zoneId, req.body?.units ?? 2);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/staff/release", (req, res) => {
  const result = engine.releaseStaff(req.body?.zoneId, req.body?.units ?? 1);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/announcement", (req, res) => {
  const result = engine.triggerAnnouncement(req.body?.type);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/playbook", (req, res) => {
  const result = engine.executePlaybookAction(
    req.body?.action,
    req.body?.target ?? "",
  );
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/ingest/sensors", (req, res) => {
  const result = engine.ingestSensorReadings(req.body?.readings ?? []);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "venueflow.html"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/realtime",
});

function broadcastSnapshot(reason = "tick") {
  const payload = JSON.stringify({
    type: "snapshot",
    reason,
    data: engine.getSnapshot(),
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "snapshot",
      reason: "connect",
      data: engine.getSnapshot(),
    }),
  );

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      }
    } catch {
      ws.send(
        JSON.stringify({ type: "error", message: "Invalid JSON payload." }),
      );
    }
  });
});

setInterval(() => {
  engine.tick(1);
  broadcastSnapshot("tick");
}, 1000);

const PORT = Number(process.env.PORT) || 8080;
server.listen(PORT, () => {
  console.log(`VenueFlow platform listening on http://localhost:${PORT}`);
  console.log(`Realtime endpoint: ws://localhost:${PORT}/realtime`);
});
