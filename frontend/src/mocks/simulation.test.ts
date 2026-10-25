// The module reads storage when it loads, so each case loads a fresh copy.
async function loadWith(stored: string | null) {
  vi.resetModules();
  if (stored === null) {
    localStorage.removeItem("grc.mockSimulation");
  } else {
    localStorage.setItem("grc.mockSimulation", stored);
  }
  return import("./simulation");
}

describe("the simulation settings", () => {
  it("survive a reload", async () => {
    const first = await loadWith(null);
    first.setSimulation({ latency: "short", riskEngineDown: true });

    const reloaded = await loadWith(localStorage.getItem("grc.mockSimulation"));

    expect(reloaded.getSimulation()).toMatchObject({ latency: "short", riskEngineDown: true });
  });

  it.each([
    ["broken JSON", "{"],
    ["a non-object", "42"],
    [
      "unknown values",
      JSON.stringify({ latency: "glacial", failureRate: 0.5, riskEngineDown: "yes" }),
    ],
  ])("fall back to the defaults for %s", async (_, stored) => {
    const simulation = await loadWith(stored);

    expect(simulation.getSimulation()).toEqual(simulation.DEFAULT_SIMULATION);
  });

  it("notify subscribers until they unsubscribe", async () => {
    const simulation = await loadWith(null);
    const listener = vi.fn();
    const unsubscribe = simulation.subscribeSimulation(listener);

    simulation.setSimulation({ failureRate: 1 });
    unsubscribe();
    simulation.setSimulation({ failureRate: 0 });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
