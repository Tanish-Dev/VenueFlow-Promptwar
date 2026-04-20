import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePlaybook } from "./rulesEngine.js";

function baseContext(overrides = {}) {
  const metricsOverride = overrides.metrics || {};
  const controlsOverride = overrides.controls || {};

  return {
    metrics: {
      risk: 40,
      avgGateWait: 2,
      hotspotId: "concourse-n",
      hotspotName: "North Concourse",
      availableStaff: 5,
      ...metricsOverride,
    },
    controls: {
      emergencyCorridors: false,
      activeAnnouncements: [],
      gateMode: {
        "gate-a": "open",
        "gate-b": "open",
      },
      zoneStaff: {},
      ...controlsOverride,
    },
    zones: {
      "gate-a": { name: "Gate A", type: "gate" },
      "gate-b": { name: "Gate B", type: "gate" },
      "concourse-n": { name: "North Concourse", type: "concourse" },
      "food-n": { name: "Food N", type: "food" },
    },
    state: {
      "gate-a": { den: 0.4, wait: 2 },
      "gate-b": { den: 0.5, wait: 3 },
      "concourse-n": { den: 0.7, wait: 4 },
      "food-n": { den: 0.85, wait: 9 },
    },
    gateIds: ["gate-a", "gate-b"],
    phase: overrides.phase || "firsthalf",
    simMin: overrides.simMin ?? 30,
  };
}

test("adds emergency corridor action when risk is critical", () => {
  const items = evaluatePlaybook(
    baseContext({
      metrics: { risk: 88 },
      controls: { emergencyCorridors: false },
    }),
  );

  assert.ok(items.some((item) => item.action === "activate-emergency"));
});

test("returns max four actions sorted by priority", () => {
  const items = evaluatePlaybook(
    baseContext({
      metrics: {
        risk: 95,
        avgGateWait: 7,
        hotspotId: "concourse-n",
        availableStaff: 5,
      },
      controls: {
        gateMode: {
          "gate-a": "closed",
          "gate-b": "open",
        },
        activeAnnouncements: [],
      },
      phase: "secondhalf",
      simMin: 86,
    }),
  );

  assert.ok(items.length <= 4);
  for (let i = 1; i < items.length; i += 1) {
    assert.ok(items[i - 1].priority >= items[i].priority);
  }
});
