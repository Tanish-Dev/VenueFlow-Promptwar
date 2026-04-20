import test from "node:test";
import assert from "node:assert/strict";

import { VenueSimulationEngine } from "./engine.js";

test("engine starts with a valid snapshot", () => {
  const engine = new VenueSimulationEngine();
  const snapshot = engine.getSnapshot();

  assert.equal(snapshot.phase, "pregame");
  assert.equal(typeof snapshot.simMin, "number");
  assert.equal(typeof snapshot.metrics.risk, "number");
  assert.ok(snapshot.state["gate-a"]);
});

test("setScenario rejects unknown scenario", () => {
  const engine = new VenueSimulationEngine();
  const result = engine.setScenario("not-a-scenario");

  assert.equal(result.ok, false);
  assert.match(result.message, /Unknown scenario/i);
});

test("sensor ingestion accepts valid readings and clamps values", () => {
  const engine = new VenueSimulationEngine();
  const result = engine.ingestSensorReadings([
    { zoneId: "gate-a", density: 2, confidence: 5, ttlSec: 1000 },
    { zoneId: "food-n", count: 100, confidence: 0.7, ttlSec: 30 },
    { zoneId: "unknown", density: 0.3 },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.accepted, 2);
  assert.equal(result.total, 3);
});

test("deploy and release staff updates pool counts", () => {
  const engine = new VenueSimulationEngine();

  const deploy = engine.deployStaff("concourse-n", 3);
  assert.equal(deploy.ok, true);
  assert.equal(deploy.available, 61);
  assert.equal(deploy.deployed, 3);

  const release = engine.releaseStaff("concourse-n", 2);
  assert.equal(release.ok, true);
  assert.equal(release.available, 63);
  assert.equal(release.deployed, 1);
});
