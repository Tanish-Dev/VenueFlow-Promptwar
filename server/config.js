export const ZONES = {
  "concourse-n": {
    name: "North Concourse",
    type: "concourse",
    cap: 3000,
    flow: 0.5,
  },
  "concourse-e": {
    name: "East Concourse",
    type: "concourse",
    cap: 2500,
    flow: 0.4,
  },
  "concourse-s": {
    name: "South Concourse",
    type: "concourse",
    cap: 3000,
    flow: 0.5,
  },
  "concourse-w": {
    name: "West Concourse",
    type: "concourse",
    cap: 2500,
    flow: 0.4,
  },
  "gate-a": { name: "Gate A", type: "gate", cap: 800, flow: 0.6 },
  "gate-b": { name: "Gate B", type: "gate", cap: 600, flow: 0.5 },
  "gate-c": { name: "Gate C", type: "gate", cap: 700, flow: 0.5 },
  "gate-d": { name: "Gate D", type: "gate", cap: 600, flow: 0.4 },
  "gate-e": { name: "Gate E", type: "gate", cap: 800, flow: 0.6 },
  "gate-f": { name: "Gate F", type: "gate", cap: 500, flow: 0.3 },
  "gate-g": { name: "Gate G", type: "gate", cap: 700, flow: 0.4 },
  "gate-h": { name: "Gate H", type: "gate", cap: 500, flow: 0.3 },
  "section-1": { name: "Section 1 (N)", type: "seating", cap: 5000, flow: 0.3 },
  "section-2": {
    name: "Section 2 (NE)",
    type: "seating",
    cap: 4000,
    flow: 0.3,
  },
  "section-3": {
    name: "Section 3 (SE)",
    type: "seating",
    cap: 4000,
    flow: 0.3,
  },
  "section-4": { name: "Section 4 (S)", type: "seating", cap: 5000, flow: 0.3 },
  "section-5": {
    name: "Section 5 (SW)",
    type: "seating",
    cap: 4000,
    flow: 0.3,
  },
  "section-6": {
    name: "Section 6 (NW)",
    type: "seating",
    cap: 4000,
    flow: 0.3,
  },
  "food-n": { name: "Food Stand North", type: "food", cap: 200, flow: 0.3 },
  "food-e": { name: "Food Stand East", type: "food", cap: 180, flow: 0.3 },
  "food-s": { name: "Food Stand South", type: "food", cap: 200, flow: 0.3 },
  "food-w": { name: "Food Stand West", type: "food", cap: 150, flow: 0.2 },
  "restroom-ne": { name: "Restroom NE", type: "restroom", cap: 100, flow: 0.2 },
  "restroom-se": { name: "Restroom SE", type: "restroom", cap: 100, flow: 0.2 },
  "restroom-sw": { name: "Restroom SW", type: "restroom", cap: 100, flow: 0.2 },
  "restroom-nw": { name: "Restroom NW", type: "restroom", cap: 100, flow: 0.2 },
  "merch-1": { name: "Merch Stand N", type: "merch", cap: 120, flow: 0.15 },
  "merch-2": { name: "Merch Stand S", type: "merch", cap: 120, flow: 0.15 },
};

export const GATE_IDS = Object.keys(ZONES).filter(
  (id) => ZONES[id].type === "gate",
);
export const NON_SEATING_IDS = Object.keys(ZONES).filter(
  (id) => ZONES[id].type !== "seating",
);

export const GATE_POP = {
  "gate-a": 1.3,
  "gate-b": 0.9,
  "gate-c": 1.0,
  "gate-d": 0.7,
  "gate-e": 1.2,
  "gate-f": 0.6,
  "gate-g": 0.8,
  "gate-h": 0.5,
};

export const PHASES = [
  { id: "pregame", s: -90, e: -30 },
  { id: "entry", s: -30, e: 0 },
  { id: "kickoff", s: 0, e: 5 },
  { id: "firsthalf", s: 5, e: 45 },
  { id: "halftime", s: 45, e: 60 },
  { id: "secondhalf", s: 60, e: 90 },
  { id: "fulltime", s: 90, e: 120 },
];

export const TARGETS = {
  pregame: {
    gate: 0.15,
    concourse: 0.1,
    seating: 0.05,
    food: 0.08,
    restroom: 0.05,
    merch: 0.1,
  },
  entry: {
    gate: 0.85,
    concourse: 0.6,
    seating: 0.4,
    food: 0.2,
    restroom: 0.15,
    merch: 0.25,
  },
  kickoff: {
    gate: 0.3,
    concourse: 0.35,
    seating: 0.85,
    food: 0.1,
    restroom: 0.08,
    merch: 0.1,
  },
  firsthalf: {
    gate: 0.08,
    concourse: 0.2,
    seating: 0.9,
    food: 0.15,
    restroom: 0.12,
    merch: 0.08,
  },
  halftime: {
    gate: 0.05,
    concourse: 0.75,
    seating: 0.5,
    food: 0.92,
    restroom: 0.88,
    merch: 0.65,
  },
  secondhalf: {
    gate: 0.05,
    concourse: 0.18,
    seating: 0.88,
    food: 0.12,
    restroom: 0.1,
    merch: 0.06,
  },
  fulltime: {
    gate: 0.9,
    concourse: 0.7,
    seating: 0.25,
    food: 0.05,
    restroom: 0.15,
    merch: 0.08,
  },
};

export const SCENARIOS = {
  standard: {
    label: "Standard Match Day",
    multipliers: {
      gate: 1,
      concourse: 1,
      seating: 1,
      food: 1,
      restroom: 1,
      merch: 1,
    },
  },
  "halftime-surge": {
    label: "Halftime Surge",
    multipliers: {
      gate: 1.04,
      concourse: 1.12,
      seating: 0.92,
      food: 1.28,
      restroom: 1.24,
      merch: 1.1,
    },
  },
  "weather-delay": {
    label: "Weather Delay",
    multipliers: {
      gate: 1.2,
      concourse: 1.14,
      seating: 0.82,
      food: 1.06,
      restroom: 1.05,
      merch: 0.95,
    },
  },
  "transit-delay": {
    label: "Transit Delay Arrival",
    multipliers: {
      gate: 1.26,
      concourse: 1.18,
      seating: 0.84,
      food: 1.04,
      restroom: 1.02,
      merch: 0.92,
    },
  },
  "controlled-egress": {
    label: "Controlled Egress",
    multipliers: {
      gate: 1.16,
      concourse: 1.08,
      seating: 0.72,
      food: 0.95,
      restroom: 1,
      merch: 0.85,
    },
  },
};
