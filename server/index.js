import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";

import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

import { GATE_IDS, SCENARIOS, VenueSimulationEngine, ZONES } from "./engine.js";

const app = express();
const engine = new VenueSimulationEngine();

const CONTROL_WINDOW_MS = 10_000;
const CONTROL_MAX_REQUESTS = 120;
const controlRateByIp = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function controlRateLimit(req, res, next) {
  const now = Date.now();
  const ip = clientIp(req);
  const entry = controlRateByIp.get(ip) || {
    count: 0,
    resetAt: now + CONTROL_WINDOW_MS,
  };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + CONTROL_WINDOW_MS;
  }

  entry.count += 1;
  controlRateByIp.set(ip, entry);

  if (entry.count > CONTROL_MAX_REQUESTS) {
    res.status(429).json({
      ok: false,
      message: "Too many control requests. Try again shortly.",
    });
    return;
  }

  next();
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function parseFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin blocked by CORS policy."));
    },
  }),
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self' ws: wss:;",
  );
  next();
});

app.use((req, res, next) => {
  res.locals.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", res.locals.requestId);
  next();
});

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

app.use("/api/control", controlRateLimit);

app.post("/api/control/scenario", (req, res) => {
  const scenario = parseString(req.body?.scenario);
  const result = engine.setScenario(scenario);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/speed", (req, res) => {
  const speed = parseFiniteNumber(req.body?.speed);
  if (speed === null) {
    res.status(400).json({ ok: false, message: "Invalid speed value." });
    return;
  }
  const result = engine.setSpeed(speed);
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/emergency", (req, res) => {
  const enabled = parseBoolean(req.body?.enabled);
  if (enabled === null) {
    res.status(400).json({ ok: false, message: "Invalid enabled value." });
    return;
  }
  const result = engine.setEmergency(enabled);
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/gate", (req, res) => {
  const gateId = parseString(req.body?.gateId);
  const mode = parseString(req.body?.mode);
  const result = engine.setGateMode(gateId, mode);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/staff/deploy", (req, res) => {
  const zoneId = parseString(req.body?.zoneId);
  const units = parseFiniteNumber(req.body?.units);
  const result = engine.deployStaff(zoneId, units ?? 2);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/staff/release", (req, res) => {
  const zoneId = parseString(req.body?.zoneId);
  const units = parseFiniteNumber(req.body?.units);
  const result = engine.releaseStaff(zoneId, units ?? 1);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/announcement", (req, res) => {
  const type = parseString(req.body?.type);
  const result = engine.triggerAnnouncement(type);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/control/playbook", (req, res) => {
  const action = parseString(req.body?.action);
  const target = parseString(req.body?.target);
  const result = engine.executePlaybookAction(action, target);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.post("/api/ingest/sensors", (req, res) => {
  const readings = Array.isArray(req.body?.readings) ? req.body.readings : [];
  const result = engine.ingestSensorReadings(readings);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, snapshot: engine.getSnapshot() });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
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
