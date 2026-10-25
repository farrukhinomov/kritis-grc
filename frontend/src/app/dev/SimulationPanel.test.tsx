import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { tenantData } from "@/mocks/db";
import { getSimulation } from "@/mocks/simulation";

import { SimulationControls } from "./SimulationPanel";

function renderControls() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SimulationControls />
    </QueryClientProvider>,
  );
}

describe("the simulation controls", () => {
  it("switch the mock API's scenarios", async () => {
    renderControls();

    await userEvent.click(screen.getByText("1,5 s"));
    await userEvent.click(screen.getByText("25 %"));
    await userEvent.click(screen.getByRole("switch", { name: /Konflikt/ }));
    await userEvent.click(screen.getByRole("switch", { name: /Risiko-Engine/ }));

    expect(getSimulation()).toEqual({
      latency: "long",
      failureRate: 0.25,
      conflictOnNextWrite: true,
      riskEngineDown: true,
    });
  });

  it("restore the demo data", async () => {
    tenantData("muster-stadtwerke")!.implementations.length = 0;
    renderControls();

    await userEvent.click(screen.getByRole("button", { name: /Demodaten zurücksetzen/ }));

    expect(tenantData("muster-stadtwerke")!.implementations.length).toBeGreaterThan(0);
  });
});
