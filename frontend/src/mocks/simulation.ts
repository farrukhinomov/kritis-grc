/**
 * Switches for the mock API that make the hard states reachable on purpose: slow
 * responses show the skeletons, failures show error states and rollbacks, a conflict
 * shows the 412 dialog, and an unreachable risk engine shows "calculation pending".
 * Kept per browser, so a reload keeps the scenario being looked at.
 */

export const LATENCIES = { off: 0, short: 400, long: 1500 } as const;
export type Latency = keyof typeof LATENCIES;

export const FAILURE_RATES = [0, 0.25, 1] as const;
export type FailureRate = (typeof FAILURE_RATES)[number];

export interface SimulationSettings {
  latency: Latency;
  failureRate: FailureRate;
  /** The next write fails with 412, as if someone else had saved first. */
  conflictOnNextWrite: boolean;
  riskEngineDown: boolean;
}

export const DEFAULT_SIMULATION: SimulationSettings = {
  latency: "off",
  failureRate: 0,
  conflictOnNextWrite: false,
  riskEngineDown: false,
};

const STORAGE_KEY = "grc.mockSimulation";

let settings: SimulationSettings = load();
const listeners = new Set<() => void>();

function load(): SimulationSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return sanitize(stored);
  } catch {
    return DEFAULT_SIMULATION;
  }
}

/** Stored values come from an older version or a hand edit; anything unknown is dropped. */
function sanitize(stored: unknown): SimulationSettings {
  if (typeof stored !== "object" || stored === null) {
    return DEFAULT_SIMULATION;
  }
  const value = stored as Partial<Record<keyof SimulationSettings, unknown>>;
  return {
    latency:
      typeof value.latency === "string" && value.latency in LATENCIES
        ? (value.latency as Latency)
        : DEFAULT_SIMULATION.latency,
    failureRate:
      FAILURE_RATES.find((rate) => rate === value.failureRate) ?? DEFAULT_SIMULATION.failureRate,
    conflictOnNextWrite: value.conflictOnNextWrite === true,
    riskEngineDown: value.riskEngineDown === true,
  };
}

export function getSimulation(): SimulationSettings {
  return settings;
}

export function setSimulation(change: Partial<SimulationSettings>): void {
  settings = { ...settings, ...change };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not remembering the scenario is acceptable.
  }
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSimulation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetSimulation(): void {
  setSimulation(DEFAULT_SIMULATION);
}
