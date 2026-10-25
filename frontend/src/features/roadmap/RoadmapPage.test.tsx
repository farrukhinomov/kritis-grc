import { screen } from "@testing-library/react";

import { renderRoute } from "@/test/render";

describe("the roadmap", () => {
  it("names the milestones and what v1 leaves out", async () => {
    renderRoute("/t/muster-stadtwerke/roadmap");

    expect(await screen.findByRole("heading", { level: 1, name: "Roadmap" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /M1/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Nach Version 1/ })).toBeInTheDocument();
    expect(screen.getByText(/Meldewesen mit Fristen-Timern/)).toBeInTheDocument();
  });
});
