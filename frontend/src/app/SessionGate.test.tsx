import { screen } from "@testing-library/react";
import { http } from "msw";

import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { sessionKey } from "@/shared/api/auth";
import { renderRoute } from "@/test/render";

describe("the session gate", () => {
  it("keeps the app when a reload of a known session fails", async () => {
    const { client } = renderRoute("/t/muster-stadtwerke/roadmap");
    await screen.findByRole("heading", { level: 1, name: "Roadmap" });
    server.use(http.get("/api/v1/me", () => problem(503, "service_unavailable", "Down.")));

    await client.refetchQueries({ queryKey: sessionKey });
    // Give the failed reload the time to reach the screen.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Roadmap" })).toBeInTheDocument();
  });

  it("offers a retry when the session can't be loaded at all", async () => {
    server.use(http.get("/api/v1/me", () => problem(503, "service_unavailable", "Down.")));

    renderRoute("/t/muster-stadtwerke/roadmap");

    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });
});
