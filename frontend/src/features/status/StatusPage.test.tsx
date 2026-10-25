import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { server } from "@/mocks/server";
import { renderRoute } from "@/test/render";

describe("StatusPage", () => {
  it("lists every check of the system status", async () => {
    renderRoute("/");

    expect(await screen.findByText("Datenbank")).toBeInTheDocument();
    expect(screen.getByText("Risiko-Engine")).toBeInTheDocument();
    expect(screen.getByText("Dateispeicher")).toBeInTheDocument();
    expect(screen.getByText("Alle Dienste sind betriebsbereit.")).toBeInTheDocument();
  });

  it("reports unavailable checks", async () => {
    server.use(
      http.get("/api/v1/status", () =>
        HttpResponse.json({
          status: "degraded",
          checks: { database: "ok", risk_engine: "unavailable" },
        }),
      ),
    );

    renderRoute("/");

    expect(await screen.findByText("Nicht erreichbar")).toBeInTheDocument();
    expect(screen.getByText("Einige Dienste sind eingeschränkt.")).toBeInTheDocument();
  });

  it("marks checks the server did not report instead of hiding them", async () => {
    server.use(
      http.get("/api/v1/status", () => HttpResponse.json({ status: "degraded", checks: {} })),
    );

    renderRoute("/");

    expect(await screen.findAllByText("Keine Angabe")).toHaveLength(3);
  });

  it("explains when the status cannot be loaded at all", async () => {
    server.use(http.get("/api/v1/status", () => HttpResponse.error()));

    renderRoute("/");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Status konnte nicht geladen werden",
    );
  });
});
