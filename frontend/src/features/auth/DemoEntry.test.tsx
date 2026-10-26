import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { sessionKey } from "@/shared/api/auth";
import type { Session } from "@/shared/session/session";
import { renderRoute } from "@/test/render";

afterEach(() => {
  vi.unstubAllEnvs();
});

const asDemoBuild = () => {
  vi.stubEnv("VITE_API_MOCKING", "enabled");
};

describe("the entry address of the prototype", () => {
  it("opens the demo dashboard straight away, signed in as GRC Manager", async () => {
    asDemoBuild();
    setMockSession(null);

    const { router, client } = renderRoute("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/t/muster-stadtwerke/dashboard");
    expect(client.getQueryData<Session>(sessionKey)?.memberships[0]?.role).toBe("grc_manager");
  });

  it("keeps whoever is already signed in", async () => {
    asDemoBuild();
    setMockSession("auditor");

    const { router, client } = renderRoute("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/t/muster-stadtwerke/dashboard");
    expect(client.getQueryData<Session>(sessionKey)?.memberships[0]?.role).toBe("auditor");
  });

  it("replaces the address in the history, so Back doesn't lead into a redirect loop", async () => {
    asDemoBuild();
    setMockSession(null);

    const { router } = renderRoute("/");
    await screen.findByRole("heading", { level: 1, name: "Übersicht" });

    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("signs in once even when it opens with the signed-out session already known", async () => {
    asDemoBuild();
    setMockSession(null);
    let signIns = 0;
    server.use(
      http.post("/api/v1/auth/demo-login", () => {
        signIns += 1;
        return problem(503, "service_unavailable", "Down.");
      }),
    );
    // As in development, where every effect runs twice. Arriving from the login page, the
    // session is cached as "nobody" already, so the first run has something to act on.
    const { router } = renderRoute("/login", { strict: true });
    await screen.findByRole("heading", { level: 1, name: "Anmelden" });

    await act(() => router.navigate("/"));

    await waitFor(() => {
      expect(signIns).toBeGreaterThan(0);
    });
    await screen.findByRole("heading", { level: 1, name: "Anmelden" });
    expect(signIns).toBe(1);
  });

  it("falls back to the login page when the demo account can't be opened", async () => {
    asDemoBuild();
    setMockSession(null);
    server.use(
      http.post("/api/v1/auth/demo-login", () => problem(503, "service_unavailable", "Down.")),
    );

    const { router } = renderRoute("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Anmelden" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("falls back to the login page when the session can't be read at all", async () => {
    asDemoBuild();
    server.use(http.get("/api/v1/me", () => HttpResponse.error()));

    renderRoute("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Anmelden" })).toBeVisible();
  });

  it("is not there in a build without demo data: the start page stays the system status", async () => {
    setMockSession(null);
    let signIns = 0;
    server.use(
      http.post("/api/v1/auth/demo-login", () => {
        signIns += 1;
        return problem(503, "service_unavailable", "Down.");
      }),
    );

    const { router, client } = renderRoute("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Systemstatus" })).toBeVisible();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    // Nobody is signed in on the visitor's behalf in the real product.
    expect(signIns).toBe(0);
    await waitFor(() => {
      expect(client.getQueryData(sessionKey)).toBeNull();
    });
  });

  it("drops the previous user's cached data but not the session when it signs in", async () => {
    asDemoBuild();
    setMockSession(null);
    const { client } = renderRoute("/");
    client.setQueryData(["tenants", "muster-stadtwerke", "risks"], { items: ["left over"] });

    await screen.findByRole("heading", { level: 1, name: "Übersicht" });

    expect(client.getQueryData(["tenants", "muster-stadtwerke", "risks"])).toBeUndefined();
    expect(client.getQueryData<Session>(sessionKey)?.memberships[0]?.role).toBe("grc_manager");
  });

  it.each([true, false])("keeps the system status at /status (demo build: %s)", async (demo) => {
    if (demo) {
      asDemoBuild();
    }

    const { router } = renderRoute("/status");

    expect(await screen.findByRole("heading", { level: 1, name: "Systemstatus" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/status");
  });
});
