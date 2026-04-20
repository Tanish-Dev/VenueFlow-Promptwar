export function evaluatePlaybook(context) {
  const { metrics, controls, zones, state, gateIds, phase, simMin } = context;

  const items = [];

  if (metrics.risk >= 80 && !controls.emergencyCorridors) {
    items.push({
      id: "activate-emergency",
      title: "Activate emergency corridors",
      detail: "Risk index is critical. Open directional corridors now.",
      action: "activate-emergency",
      target: "",
      priority: 100,
    });
  }

  if (
    metrics.avgGateWait >= 6 &&
    !controls.activeAnnouncements.includes("reroute-lowest-gate")
  ) {
    items.push({
      id: "announce-reroute",
      title: "Broadcast gate reroute",
      detail: "Average gate wait is elevated. Redirect incoming attendees.",
      action: "announcement-reroute",
      target: "",
      priority: 90,
    });
  }

  const closedGate = gateIds.find(
    (id) => controls.gateMode[id] === "closed" && (state[id]?.den || 0) < 0.55,
  );
  if (closedGate && metrics.avgGateWait >= 5) {
    items.push({
      id: `open-${closedGate}`,
      title: `Open ${zones[closedGate].name}`,
      detail: "Re-open a low-pressure gate to absorb queue spillover.",
      action: "open-gate",
      target: closedGate,
      priority: 84,
    });
  }

  if (
    metrics.hotspotId &&
    (controls.zoneStaff[metrics.hotspotId] || 0) < 2 &&
    metrics.availableStaff >= 2
  ) {
    items.push({
      id: `dispatch-${metrics.hotspotId}`,
      title: `Dispatch to ${metrics.hotspotName}`,
      detail: "Staff presence can lower wait times and improve confidence.",
      action: "dispatch-staff",
      target: metrics.hotspotId,
      priority: 74,
    });
  }

  const foodZones = Object.keys(zones).filter(
    (id) => zones[id].type === "food",
  );
  const avgFoodWait = foodZones.length
    ? foodZones.reduce((sum, id) => sum + (state[id]?.wait || 0), 0) /
      foodZones.length
    : 0;

  if (
    avgFoodWait >= 8 &&
    !controls.activeAnnouncements.includes("pause-food-promos")
  ) {
    items.push({
      id: "pause-food-promos",
      title: "Pause concession promotions",
      detail: "Concession queues are high. Remove demand-inducing promotions.",
      action: "announcement-food",
      target: "",
      priority: 70,
    });
  }

  if (
    phase === "secondhalf" &&
    simMin > 83 &&
    !controls.activeAnnouncements.includes("stagger-exit")
  ) {
    items.push({
      id: "staggered-exit",
      title: "Prepare staggered exit broadcast",
      detail: "Pre-empt full-time surge with phased egress messaging.",
      action: "announcement-stagger",
      target: "",
      priority: 66,
    });
  }

  return items.sort((a, b) => b.priority - a.priority).slice(0, 4);
}
