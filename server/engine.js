import {
  GATE_IDS,
  GATE_POP,
  NON_SEATING_IDS,
  PHASES,
  SCENARIOS,
  TARGETS,
  ZONES,
} from "./config.js";
import { evaluatePlaybook } from "./rulesEngine.js";

const HISTORY_SIZE = 90;
const ALERT_COOLDOWN_SEC = 22;
const ANNOUNCE_TTL_SEC = 90;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function pseudoNoise(seed) {
  return Math.sin(seed * 0.73) * 0.62 + Math.cos(seed * 1.17) * 0.38;
}

function currentPhase(minute) {
  for (const p of PHASES) {
    if (minute >= p.s && minute < p.e) return p.id;
  }
  return "fulltime";
}

function clockLabel(minute) {
  if (minute < 0) {
    const abs = Math.abs(minute);
    const mm = Math.floor(abs);
    const ss = Math.round((abs - mm) * 60) % 60;
    return `T-${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  const mm = Math.floor(minute);
  const ss = Math.round((minute - mm) * 60) % 60;
  return `T+${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function copyObject(value) {
  return JSON.parse(JSON.stringify(value));
}

export class VenueSimulationEngine {
  constructor() {
    this.state = {};
    Object.keys(ZONES).forEach((id) => {
      this.state[id] = {
        occ: 0,
        den: 0,
        vel: 0,
        mom: 0,
        prevDen: 0,
        trend: "stable",
        wait: 0,
        conf: 85,
      };
    });

    this.gateHist = {
      "gate-a": [],
      "gate-b": [],
      "gate-c": [],
      "gate-e": [],
    };

    this.controls = {
      scenario: "standard",
      emergencyCorridors: false,
      gateMode: {},
      zoneStaff: {},
      staffPool: {
        available: 64,
        deployed: 0,
        medics: 8,
      },
      announcements: [],
      coordinationLog: [],
    };

    GATE_IDS.forEach((id) => {
      this.controls.gateMode[id] = "open";
    });

    this.sensorOverrides = {};
    this.cooldowns = {};

    this.speed = 1.5;
    this.elapsed = 0;
    this.simMin = -90;
    this.phase = "pregame";
    this.prevPhase = "pregame";
    this.pulse = 12;
    this.pulseTarget = 12;

    this.log("Control desk online. Monitoring all zones.", "info");
  }

  log(message, level = "info") {
    this.controls.coordinationLog.unshift({
      time: clockLabel(this.simMin),
      message,
      level,
    });
    if (this.controls.coordinationLog.length > 24) {
      this.controls.coordinationLog.pop();
    }
  }

  resetCycle() {
    this.elapsed = 0;
    this.simMin = -90;
    this.phase = "pregame";
    this.prevPhase = "pregame";

    Object.keys(this.state).forEach((id) => {
      this.state[id].occ = 0;
      this.state[id].den = 0;
      this.state[id].vel = 0;
      this.state[id].mom = 0;
      this.state[id].prevDen = 0;
      this.state[id].trend = "stable";
      this.state[id].wait = 0;
      this.state[id].conf = 85;
    });

    Object.keys(this.gateHist).forEach((id) => {
      this.gateHist[id] = [];
    });

    this.log("Simulation cycle restarted at pre-game state.", "info");
  }

  hasAnnouncement(type) {
    return this.controls.announcements.some((item) => item.type === type);
  }

  decayAnnouncements(dt) {
    if (!this.controls.announcements.length) return;
    this.controls.announcements.forEach((item) => {
      item.ttl -= dt;
    });
    this.controls.announcements = this.controls.announcements.filter(
      (item) => item.ttl > 0,
    );
  }

  decaySensorOverrides(dt) {
    Object.keys(this.sensorOverrides).forEach((zoneId) => {
      this.sensorOverrides[zoneId].ttl -= dt;
      if (this.sensorOverrides[zoneId].ttl <= 0) {
        delete this.sensorOverrides[zoneId];
      }
    });
  }

  setSpeed(multiplier) {
    this.speed = clamp(Number(multiplier) || 1.5, 0.5, 3);
    return { ok: true, speed: this.speed };
  }

  setScenario(name) {
    if (!SCENARIOS[name]) {
      return { ok: false, message: "Unknown scenario value." };
    }
    if (this.controls.scenario !== name) {
      this.controls.scenario = name;
      this.log(`Scenario set to ${SCENARIOS[name].label}.`, "success");
    }
    return { ok: true, scenario: this.controls.scenario };
  }

  setEmergency(enabled) {
    const next = Boolean(enabled);
    if (this.controls.emergencyCorridors !== next) {
      this.controls.emergencyCorridors = next;
      this.log(
        `Emergency corridors ${next ? "activated" : "deactivated"}.`,
        next ? "warn" : "info",
      );
    }
    return { ok: true, emergencyCorridors: this.controls.emergencyCorridors };
  }

  setGateMode(gateId, mode) {
    if (!GATE_IDS.includes(gateId)) {
      return { ok: false, message: "Unknown gate ID." };
    }
    if (!["open", "restricted", "closed"].includes(mode)) {
      return { ok: false, message: "Invalid gate mode." };
    }

    if (this.controls.gateMode[gateId] !== mode) {
      this.controls.gateMode[gateId] = mode;
      const verb =
        mode === "open"
          ? "opened"
          : mode === "restricted"
            ? "restricted"
            : "closed";
      const level = mode === "closed" ? "warn" : "success";
      this.log(`${ZONES[gateId].name} ${verb} by command desk.`, level);
    }

    return { ok: true, gateId, mode: this.controls.gateMode[gateId] };
  }

  deployStaff(zoneId, units = 2) {
    if (!ZONES[zoneId]) {
      return { ok: false, message: "Unknown zone ID." };
    }

    const count = Math.max(1, Math.floor(units));
    if (this.controls.staffPool.available < count) {
      return { ok: false, message: "No available response units." };
    }

    this.controls.zoneStaff[zoneId] =
      (this.controls.zoneStaff[zoneId] || 0) + count;
    this.controls.staffPool.available -= count;
    this.controls.staffPool.deployed += count;

    this.log(
      `${count} staff unit${count > 1 ? "s" : ""} deployed to ${ZONES[zoneId].name}.`,
      "success",
    );
    return {
      ok: true,
      message: `${count} units dispatched to ${ZONES[zoneId].name}.`,
      available: this.controls.staffPool.available,
      deployed: this.controls.staffPool.deployed,
    };
  }

  releaseStaff(zoneId, units = 1) {
    if (!ZONES[zoneId]) {
      return { ok: false, message: "Unknown zone ID." };
    }

    const assigned = this.controls.zoneStaff[zoneId] || 0;
    if (!assigned) {
      return { ok: false, message: "No staff assigned to this zone." };
    }

    const count = Math.max(1, Math.floor(units));
    const released = Math.min(count, assigned);

    this.controls.zoneStaff[zoneId] = assigned - released;
    this.controls.staffPool.available += released;
    this.controls.staffPool.deployed = Math.max(
      0,
      this.controls.staffPool.deployed - released,
    );

    this.log(
      `${released} staff unit${released > 1 ? "s" : ""} released from ${ZONES[zoneId].name}.`,
      "info",
    );
    return {
      ok: true,
      message: `${released} units returned to pool.`,
      available: this.controls.staffPool.available,
      deployed: this.controls.staffPool.deployed,
    };
  }

  triggerAnnouncement(type) {
    const catalog = {
      "reroute-lowest-gate": {
        title: "Gate reroute broadcast",
        message: "Attendees are guided to the lowest-wait gate.",
      },
      "pause-food-promos": {
        title: "Food promo pause",
        message: "Promotions paused to flatten concession queues.",
      },
      "stagger-exit": {
        title: "Staggered exit message",
        message: "Sections receive timed egress prompts to reduce bottlenecks.",
      },
    };

    const entry = catalog[type];
    if (!entry) {
      return { ok: false, message: "Unknown announcement type." };
    }
    if (this.hasAnnouncement(type)) {
      return { ok: false, message: "Announcement already active." };
    }

    this.controls.announcements.push({
      type,
      ttl: ANNOUNCE_TTL_SEC,
    });

    this.log(`Broadcast sent: ${entry.title}.`, "info");
    return {
      ok: true,
      type,
      title: entry.title,
      message: entry.message,
      activeAnnouncements: this.controls.announcements.length,
    };
  }

  executePlaybookAction(action, target = "") {
    switch (action) {
      case "activate-emergency":
        return this.setEmergency(true);
      case "deactivate-emergency":
        return this.setEmergency(false);
      case "announcement-reroute":
        return this.triggerAnnouncement("reroute-lowest-gate");
      case "announcement-food":
        return this.triggerAnnouncement("pause-food-promos");
      case "announcement-stagger":
        return this.triggerAnnouncement("stagger-exit");
      case "open-gate":
        return this.setGateMode(target, "open");
      case "restrict-gate":
        return this.setGateMode(target, "restricted");
      case "dispatch-staff":
        return this.deployStaff(target, 2);
      default:
        return { ok: false, message: "Unknown playbook action." };
    }
  }

  ingestSensorReadings(readings = []) {
    if (!Array.isArray(readings)) {
      return { ok: false, message: "readings must be an array." };
    }

    let accepted = 0;
    readings.forEach((reading) => {
      if (!reading || !ZONES[reading.zoneId]) return;

      const zone = ZONES[reading.zoneId];
      let density = null;

      if (
        typeof reading.density === "number" &&
        Number.isFinite(reading.density)
      ) {
        density = clamp(reading.density, 0, 1);
      } else if (
        typeof reading.count === "number" &&
        Number.isFinite(reading.count)
      ) {
        density = clamp(reading.count / zone.cap, 0, 1);
      }

      if (density === null) return;

      this.sensorOverrides[reading.zoneId] = {
        density,
        confidence: clamp(Number(reading.confidence) || 0.75, 0.1, 0.99),
        ttl: clamp(Number(reading.ttlSec) || 40, 10, 180),
      };
      accepted += 1;
    });

    if (accepted > 0) {
      this.log(
        `Ingested ${accepted} sensor update${accepted > 1 ? "s" : ""}.`,
        "info",
      );
    }

    return {
      ok: true,
      accepted,
      total: readings.length,
    };
  }

  gateContext() {
    const openIds = [];
    const restrictedIds = [];
    const closedIds = [];
    let closedWeight = 0;

    GATE_IDS.forEach((id) => {
      const mode = this.controls.gateMode[id] || "open";
      if (mode === "closed") {
        closedIds.push(id);
        closedWeight += GATE_POP[id] || 1;
      } else if (mode === "restricted") {
        restrictedIds.push(id);
        openIds.push(id);
      } else {
        openIds.push(id);
      }
    });

    const redistributionPerOpen = openIds.length
      ? (closedWeight * 0.08 + restrictedIds.length * 0.03) / openIds.length
      : 0;

    return {
      openIds,
      restrictedIds,
      closedIds,
      redistributionPerOpen,
    };
  }

  pickBestGate(section = 1) {
    const secGates = {
      1: ["gate-a", "gate-b", "gate-h"],
      2: ["gate-b", "gate-c"],
      3: ["gate-c", "gate-d"],
      4: ["gate-d", "gate-e", "gate-f"],
      5: ["gate-f", "gate-g"],
      6: ["gate-g", "gate-h"],
    };

    const sectionGates = secGates[section] || secGates[1];
    const openCandidates = sectionGates.filter(
      (id) => this.controls.gateMode[id] !== "closed",
    );
    const candidates = openCandidates.length ? openCandidates : sectionGates;

    let bestGate = candidates[0];
    let bestWait = Number.POSITIVE_INFINITY;

    candidates.forEach((id) => {
      const wait = this.state[id]?.wait ?? 999;
      if (wait < bestWait) {
        bestWait = wait;
        bestGate = id;
      }
    });

    return bestGate;
  }

  applyModifiers(id, zone, baseTarget, gateCtx) {
    const profile =
      SCENARIOS[this.controls.scenario]?.multipliers ||
      SCENARIOS.standard.multipliers;
    let target = baseTarget * (profile[zone.type] || 1);

    if (zone.type === "gate") {
      const mode = this.controls.gateMode[id] || "open";
      if (mode === "closed") target *= 0.12;
      else if (mode === "restricted") target *= 0.58;

      if (mode !== "closed" && gateCtx.openIds.length) {
        target *= 1 + gateCtx.redistributionPerOpen * (GATE_POP[id] || 1);
      }
    }

    if (
      this.controls.emergencyCorridors &&
      ["concourse", "gate"].includes(zone.type)
    ) {
      target *= 0.86;
    }

    if (this.hasAnnouncement("reroute-lowest-gate") && zone.type === "gate") {
      const preferred = this.pickBestGate(1);
      target *= id === preferred ? 1.16 : 0.88;
    }

    if (this.hasAnnouncement("pause-food-promos") && zone.type === "food") {
      target *= 0.82;
    }

    if (
      this.hasAnnouncement("stagger-exit") &&
      this.phase === "fulltime" &&
      ["gate", "concourse"].includes(zone.type)
    ) {
      target *= 0.9;
    }

    const staffUnits = this.controls.zoneStaff[id] || 0;
    if (staffUnits > 0) {
      target *= Math.max(0.68, 1 - staffUnits * 0.035);
    }

    const sensor = this.sensorOverrides[id];
    if (sensor) {
      target =
        target * (1 - sensor.confidence * 0.45) +
        sensor.density * (sensor.confidence * 0.45);
    }

    return clamp(target, 0, 1);
  }

  computePulse() {
    const weights = {
      gate: 2.2,
      concourse: 3,
      food: 2.4,
      restroom: 2.1,
      seating: 0.5,
      merch: 1,
    };

    let totalDensity = 0;
    let totalWeight = 0;
    Object.keys(ZONES).forEach((id) => {
      const w = weights[ZONES[id].type] || 1;
      totalDensity += this.state[id].den * w;
      totalWeight += w;
    });

    const gateCtx = this.gateContext();
    const structuralPenalty =
      gateCtx.closedIds.length * 3 + gateCtx.restrictedIds.length * 1.2;

    this.pulseTarget = Math.round(
      clamp((totalDensity / totalWeight) * 100 + structuralPenalty, 0, 100),
    );
    this.pulse += (this.pulseTarget - this.pulse) * 0.14;
    this.pulse = Math.round(clamp(this.pulse, 0, 100));
  }

  getMetrics() {
    const gateWaits = GATE_IDS.map((id) => this.state[id].wait || 0);
    const avgGateWait =
      gateWaits.reduce((sum, value) => sum + value, 0) /
      Math.max(1, gateWaits.length);

    let hotspotId = NON_SEATING_IDS[0];
    NON_SEATING_IDS.forEach((id) => {
      if ((this.state[id]?.den || 0) > (this.state[hotspotId]?.den || 0)) {
        hotspotId = id;
      }
    });

    const maxDen = this.state[hotspotId]?.den || 0;
    const gateCtx = this.gateContext();

    const risk = Math.round(
      clamp(
        this.pulse * 0.52 +
          avgGateWait * 4 +
          maxDen * 30 +
          gateCtx.closedIds.length * 7 +
          (this.controls.emergencyCorridors ? -5 : 0) -
          Math.min(4, this.controls.staffPool.available * 0.04),
        0,
        100,
      ),
    );

    return {
      risk,
      avgGateWait,
      maxDensityPct: Math.round(maxDen * 100),
      hotspotId,
      hotspotName: ZONES[hotspotId]?.name || "-",
      deployedStaff: this.controls.staffPool.deployed,
      availableStaff: this.controls.staffPool.available,
      closedGates: gateCtx.closedIds.length,
      activeAnnouncements: this.controls.announcements.length,
      emergencyCorridors: this.controls.emergencyCorridors,
    };
  }

  getControlState() {
    return {
      scenario: this.controls.scenario,
      emergencyCorridors: this.controls.emergencyCorridors,
      speed: this.speed,
      gateMode: { ...this.controls.gateMode },
      zoneStaff: { ...this.controls.zoneStaff },
      staffPool: { ...this.controls.staffPool },
      activeAnnouncements: this.controls.announcements.map((item) => item.type),
    };
  }

  getCoordinationLog() {
    return this.controls.coordinationLog.slice(0, 16);
  }

  getPlaybook() {
    return evaluatePlaybook({
      metrics: this.getMetrics(),
      controls: this.getControlState(),
      zones: ZONES,
      state: this.state,
      gateIds: GATE_IDS,
      phase: this.phase,
      simMin: this.simMin,
    });
  }

  getWavePrediction() {
    let topId = null;
    let topScore = 0;

    NON_SEATING_IDS.forEach((id) => {
      const zone = ZONES[id];
      const s = this.state[id];
      const score =
        s.den +
        (Math.max(0, s.vel) / zone.cap) * 4 +
        (s.trend === "rising" ? 0.09 : 0);
      if (score > topScore) {
        topScore = score;
        topId = id;
      }
    });

    if (!topId) return null;

    const zone = ZONES[topId];
    const s = this.state[topId];
    return {
      zone: zone.name,
      id: topId,
      pct: Math.min(
        100,
        Math.round((s.den + (Math.max(0, s.vel) / zone.cap) * 4) * 100),
      ),
      eta: clamp(Math.round((1 - s.den) * 7 + 2), 2, 8),
    };
  }

  getSmartPath(section = 1) {
    const sec = parseInt(section, 10) || 1;
    const bestGateId = this.pickBestGate(sec);

    const foods = Object.keys(ZONES).filter((id) => ZONES[id].type === "food");
    const rests = Object.keys(ZONES).filter(
      (id) => ZONES[id].type === "restroom",
    );

    let bestFood = foods[0];
    let bestFoodScore = Number.POSITIVE_INFINITY;
    foods.forEach((id) => {
      const score = this.state[id].wait + this.state[id].den * 4;
      if (score < bestFoodScore) {
        bestFood = id;
        bestFoodScore = score;
      }
    });

    let bestRest = rests[0];
    let bestRestScore = Number.POSITIVE_INFINITY;
    rests.forEach((id) => {
      const score = this.state[id].wait + this.state[id].den * 4;
      if (score < bestRestScore) {
        bestRest = id;
        bestRestScore = score;
      }
    });

    const parkMap = {
      "gate-a": "Lot A - North",
      "gate-b": "Lot B - NE",
      "gate-c": "Lot C - East",
      "gate-d": "Lot D - SE",
      "gate-e": "Lot E - South",
      "gate-f": "Lot F - SW",
      "gate-g": "Lot G - West",
      "gate-h": "Lot H - NW",
    };

    return {
      gate: {
        id: bestGateId,
        name: ZONES[bestGateId].name,
        wait: this.state[bestGateId].wait,
      },
      food: {
        id: bestFood,
        name: ZONES[bestFood].name,
        wait: this.state[bestFood].wait,
      },
      rest: {
        id: bestRest,
        name: ZONES[bestRest].name,
        wait: this.state[bestRest].wait,
      },
      park: parkMap[bestGateId] || "Lot A - North",
    };
  }

  getGroupMeetup(sections = []) {
    const opts = [
      "concourse-n",
      "concourse-e",
      "concourse-s",
      "concourse-w",
      "food-n",
      "food-e",
      "food-s",
      "food-w",
    ];
    const prox = {
      "concourse-n": [1, 2, 4, 5, 4, 2],
      "concourse-e": [2, 1, 1, 4, 5, 4],
      "concourse-s": [5, 4, 2, 1, 2, 4],
      "concourse-w": [2, 4, 5, 4, 1, 1],
      "food-n": [1, 2, 4, 5, 4, 2],
      "food-e": [3, 1, 1, 3, 5, 4],
      "food-s": [5, 4, 2, 1, 2, 4],
      "food-w": [2, 4, 5, 4, 1, 1],
    };

    const cleaned = sections.length ? sections : ["1", "3", "5"];

    let best = opts[0];
    let bestScore = Number.POSITIVE_INFINITY;

    opts.forEach((zoneId) => {
      let totalWalk = 0;
      cleaned.forEach((entry) => {
        const sec = (parseInt(entry, 10) || 1) - 1;
        totalWalk += (prox[zoneId]?.[sec] || 3) * 2;
      });
      totalWalk += (this.state[zoneId]?.den || 0) * 5;
      if (totalWalk < bestScore) {
        best = zoneId;
        bestScore = totalWalk;
      }
    });

    return {
      zone: ZONES[best]?.name || best,
      id: best,
      avgWalk: Math.round(bestScore / Math.max(1, cleaned.length)),
      congestion: Math.round((this.state[best]?.den || 0) * 100),
    };
  }

  getOptimalArrival(section = 1) {
    const route = this.getSmartPath(section);
    const scenarioPenalty =
      this.controls.scenario === "weather-delay"
        ? 10
        : this.controls.scenario === "transit-delay"
          ? 7
          : 0;
    const mins = Math.round(
      clamp(68 + route.gate.wait * 4 + scenarioPenalty, 52, 105),
    );
    return {
      mins,
      gate: route.gate.name,
      wait: Math.max(1, Math.round(route.gate.wait)),
    };
  }

  allowAlert(key, now, coolDownSec = ALERT_COOLDOWN_SEC) {
    if (!this.cooldowns[key] || now - this.cooldowns[key] > coolDownSec) {
      this.cooldowns[key] = now;
      return true;
    }
    return false;
  }

  checkAlerts() {
    const alerts = [];
    const now = this.elapsed;

    GATE_IDS.forEach((id) => {
      const s = this.state[id];
      const z = ZONES[id];
      if (
        s.den > 0.74 &&
        s.trend === "rising" &&
        this.allowAlert(`gate-${id}`, now)
      ) {
        const alt = this.pickBestGate(1);
        if (alt && alt !== id) {
          const saved = Math.round(Math.max(0, s.wait - this.state[alt].wait));
          if (saved > 1) {
            alerts.push({
              type: "warn",
              title: `${z.name} building pressure`,
              msg: `Reroute to ${ZONES[alt].name} to save about ${saved} minutes.`,
              icon: "warning",
            });
          }
        }
      }
    });

    if (
      this.phase === "firsthalf" &&
      this.simMin > 39 &&
      this.simMin < 44 &&
      this.allowAlert("halftime-food", now, 30)
    ) {
      alerts.push({
        type: "info",
        title: "Halftime queue wave",
        msg: "Food and restroom demand spikes in about 4 minutes.",
        icon: "info",
      });
    }

    if (
      this.phase === "secondhalf" &&
      this.simMin > 84 &&
      this.simMin < 89 &&
      this.allowAlert("exit-early", now, 30)
    ) {
      const best = this.pickBestGate(1);
      alerts.push({
        type: "info",
        title: "Egress advisory",
        msg: `Early staggered exit recommended via ${ZONES[best].name}.`,
        icon: "run",
      });
    }

    const metrics = this.getMetrics();
    if (
      metrics.risk > 82 &&
      !this.controls.emergencyCorridors &&
      this.allowAlert("risk-critical", now, 36)
    ) {
      alerts.push({
        type: "danger",
        title: "Risk threshold exceeded",
        msg: "Activate emergency corridors and dispatch staff to the hotspot.",
        icon: "critical",
      });
    }

    return alerts;
  }

  tick(dt = 1) {
    this.elapsed += dt;
    this.decayAnnouncements(dt);
    this.decaySensorOverrides(dt);

    this.simMin = -90 + this.elapsed * this.speed;
    this.prevPhase = this.phase;
    this.phase = currentPhase(this.simMin);

    if (this.simMin >= 120) {
      this.resetCycle();
    }

    const targets = TARGETS[this.phase] || TARGETS.pregame;
    const gateCtx = this.gateContext();

    Object.keys(ZONES).forEach((id) => {
      const zone = ZONES[id];
      const s = this.state[id];

      let target = targets[zone.type] || 0.1;
      if (GATE_POP[id]) target *= GATE_POP[id];

      const wave = pseudoNoise(this.simMin * 0.12 + id.length * 2.17) * 0.06;
      target = this.applyModifiers(id, zone, target + wave, gateCtx);

      const targetOcc = target * zone.cap;
      const gap = targetOcc - s.occ;

      const staffUnits = this.controls.zoneStaff[id] || 0;
      const staffBoost = 1 + Math.min(0.45, staffUnits * 0.04);
      const emergencyBoost =
        this.controls.emergencyCorridors &&
        ["concourse", "gate"].includes(zone.type)
          ? 1.2
          : 1;
      const inertia = (0.11 + zone.flow * 0.17) * staffBoost * emergencyBoost;

      s.mom = s.mom * 0.68 + gap * inertia * 0.32;
      const drift =
        pseudoNoise(this.elapsed * 0.72 + id.charCodeAt(id.length - 1) * 0.31) *
        zone.cap *
        0.014;
      s.vel = s.mom + drift;

      s.prevDen = s.den;
      s.occ = clamp(s.occ + s.vel, 0, zone.cap);
      s.den = s.occ / zone.cap;

      const deltaDensity = s.den - s.prevDen;
      s.trend =
        deltaDensity > 0.01
          ? "rising"
          : deltaDensity < -0.01
            ? "falling"
            : "stable";

      const trendMul =
        s.trend === "rising" ? 1.18 : s.trend === "falling" ? 0.86 : 1;
      const phaseMul =
        this.phase === "halftime" ? 1.35 : this.phase === "fulltime" ? 1.2 : 1;
      const jitter = pseudoNoise(this.elapsed * 0.9 + id.length) * 0.25;
      const waitStaffFactor = Math.max(0.55, 1 - staffUnits * 0.05);

      if (["food", "restroom", "merch"].includes(zone.type)) {
        const baseWait = s.den * 14.5 * trendMul * phaseMul;
        s.wait = Math.max(0, (baseWait + jitter) * waitStaffFactor);
        s.conf = Math.round(
          clamp(
            92 -
              s.den * 22 +
              staffUnits * 1.2 +
              pseudoNoise(this.elapsed * 0.4 + id.length) * 3,
            56,
            99,
          ),
        );
      } else if (zone.type === "gate") {
        const mode = this.controls.gateMode[id] || "open";
        const modePenalty =
          mode === "closed" ? 2.4 : mode === "restricted" ? 1.45 : 1;
        const baseWait = s.den * 11.5 * trendMul * modePenalty;
        s.wait = Math.max(0, (baseWait + jitter) * waitStaffFactor);
        s.conf = Math.round(
          clamp(
            90 -
              s.den * 16 +
              staffUnits +
              (mode === "closed" ? -8 : 0) +
              pseudoNoise(this.elapsed * 0.52 + id.length) * 2,
            45,
            99,
          ),
        );
      } else if (zone.type === "concourse") {
        s.wait = Math.max(0, s.den * 4.5 * trendMul + jitter);
        s.conf = Math.round(clamp(88 - s.den * 14 + staffUnits * 0.8, 50, 99));
      } else {
        s.wait = 0;
        s.conf = Math.round(clamp(94 - s.den * 10, 70, 99));
      }
    });

    if (Math.floor(this.simMin) !== Math.floor(this.simMin - dt * this.speed)) {
      Object.keys(this.gateHist).forEach((gateId) => {
        this.gateHist[gateId].push(Math.round(this.state[gateId].occ));
        if (this.gateHist[gateId].length > HISTORY_SIZE) {
          this.gateHist[gateId].shift();
        }
      });
    }

    this.computePulse();

    const changed = this.phase !== this.prevPhase;
    if (changed) {
      this.log(`Phase changed to ${this.phase}.`, "info");
    }

    return {
      simMin: this.simMin,
      phase: this.phase,
      phaseChanged: changed,
      pulse: this.pulse,
      state: this.exportState(),
    };
  }

  exportState() {
    const out = {};
    Object.keys(this.state).forEach((id) => {
      out[id] = { ...this.state[id] };
    });
    return out;
  }

  getSnapshot() {
    return {
      simMin: this.simMin,
      phase: this.phase,
      pulse: this.pulse,
      state: this.exportState(),
      gateHist: copyObject(this.gateHist),
      controls: this.getControlState(),
      metrics: this.getMetrics(),
      playbook: this.getPlaybook(),
      logs: this.getCoordinationLog(),
      wavePrediction: this.getWavePrediction(),
      smartPathDefault: this.getSmartPath(1),
      alerts: this.checkAlerts(),
    };
  }
}

export { GATE_IDS, NON_SEATING_IDS, SCENARIOS, ZONES };
