import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { SEED } from "@/mocks/seed";
import { server } from "@/mocks/server";
import { setSimulation } from "@/mocks/simulation";
import { renderRoute } from "@/test/render";

const widget = (name: string) => within(screen.getByRole("region", { name }));

async function openDashboard(tenant = "muster-stadtwerke") {
  const rendered = renderRoute(`/t/${tenant}/dashboard`);
  await screen.findByRole("heading", { level: 1, name: "Übersicht" });
  return rendered;
}

describe("the dashboard", () => {
  it("shows six widgets in priority order, which is also the phone order", async () => {
    await openDashboard();

    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Compliance je Framework und Anlage",
      "Fristen",
      "Restrisiko-Matrix",
      "Top-5-Risiken",
      "Meine offenen Umsetzungen",
      "Letzte Aktivitäten",
    ]);
  });

  it("counts only implemented work toward compliance", async () => {
    await openDashboard();

    const bar = await widget("Compliance je Framework und Anlage").findByRole("progressbar", {
      name: "Wasserwerk Nord · KRITIS-Dachgesetz",
    });
    const nord = SEED.implementations.filter(
      (i) => i.scope_id === "sc-nord" && i.requirement_id.startsWith("req-k-"),
    );
    const count = (status: string) => nord.filter((i) => i.status === status).length;
    const applicable = nord.length - count("not_applicable");
    expect(bar).toHaveAttribute(
      "aria-valuenow",
      String(Math.round((count("implemented") / applicable) * 100)),
    );
  });

  it("marks deadlines from a planned Registration as projected", async () => {
    await openDashboard();

    const deadlines = widget("Fristen");
    expect(await deadlines.findAllByText("prognostiziert")).toHaveLength(4);
    expect(deadlines.getAllByText(/^§ 12 KRITIS-DachG/)).not.toHaveLength(0);
    expect(deadlines.getByRole("link", { name: "Alle Fristen" })).toHaveAttribute(
      "href",
      "/t/muster-stadtwerke/deadlines",
    );
  });

  it("places every rated risk in the matrix and names each cell's category", async () => {
    await openDashboard();

    const matrix = await widget("Restrisiko-Matrix").findByRole("table");
    const total = within(matrix)
      .getAllByRole("cell")
      .reduce((sum, cell) => sum + (Number.parseInt(cell.textContent, 10) || 0), 0);
    expect(total).toBe(SEED.risks.length);
    expect(within(matrix).getAllByText("Kritisch")).toHaveLength(1);
  });

  it("explains what projected means in plain text, not only on hover", async () => {
    await openDashboard();

    expect(
      await widget("Fristen").findByText(/^Prognostiziert: berechnet aus der geplanten/),
    ).toBeVisible();
  });

  it("lists the five highest residual risks, highest first", async () => {
    await openDashboard();

    const items = await widget("Top-5-Risiken").findAllByRole("listitem");
    const scores = items.map((item) => Number(/· (\d+)/.exec(item.textContent)?.[1]));
    expect(items).toHaveLength(5);
    expect(scores).toEqual(scores.toSorted((a, b) => b - a));
  });

  it("lists only the signed-in user's open work", async () => {
    await openDashboard();

    const mine = widget("Meine offenen Umsetzungen");
    const items = await mine.findAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item).toHaveTextContent(/Offen|Teilweise umgesetzt/);
    }
    const total = SEED.implementations.filter(
      (i) => i.owner_id === "u-kramer" && (i.status === "open" || i.status === "partial"),
    ).length;
    expect(mine.getByText(`5 von ${String(total)} angezeigt`)).toBeVisible();
  });

  it("names who did what in recent activity", async () => {
    await openDashboard();

    const items = await widget("Letzte Aktivitäten").findAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent(
      "Tobias Wolff hat § 16 Abs. 3 · Wasserwerk Nord kommentiert",
    );
  });

  it("reflects a status change made elsewhere on the next visit", async () => {
    const { client } = await openDashboard();
    const bar = await screen.findByRole("progressbar", {
      name: "Wasserwerk Nord · KRITIS-Dachgesetz",
    });
    const before = Number(bar.getAttribute("aria-valuenow"));
    const open = SEED.implementations.find(
      (i) =>
        i.scope_id === "sc-nord" && i.requirement_id.startsWith("req-k-") && i.status === "open",
    )!;

    await fetch(`/api/v1/tenants/muster-stadtwerke/implementations/${open.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": `"${String(open.version)}"` },
      body: JSON.stringify({ status: "implemented" }),
    });
    await client.invalidateQueries();

    await vi.waitFor(() => {
      expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
    });
  });
});

describe("each widget on its own", () => {
  it("fails alone and recovers on retry", async () => {
    server.use(
      http.get(
        "/api/v1/tenants/:tenant/activity",
        () => problem(503, "service_unavailable", "Down."),
        {
          once: true,
        },
      ),
    );
    await openDashboard();

    const activity = widget("Letzte Aktivitäten");
    await userEvent.click(await activity.findByRole("button", { name: "Erneut versuchen" }));

    expect(await activity.findAllByRole("listitem")).toHaveLength(5);
    expect(widget("Top-5-Risiken").getAllByRole("listitem")).toHaveLength(5);
  });

  it("contains a rendering error to its own card and recovers on retry", async () => {
    // A response the widget can't render, as a broken deploy might send it once.
    server.use(
      http.get(
        "/api/v1/tenants/:tenant/compliance-summary",
        () => HttpResponse.json({ rows: [{ scope_id: "sc-nord", framework_id: "fw-x" }] }),
        { once: true },
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await openDashboard();

    const compliance = widget("Compliance je Framework und Anlage");
    expect(
      await compliance.findByText("Dieser Bereich konnte nicht angezeigt werden."),
    ).toBeVisible();
    expect(await widget("Fristen").findAllByText("prognostiziert")).toHaveLength(4);

    await userEvent.click(compliance.getByRole("button", { name: "Erneut versuchen" }));

    expect(
      await compliance.findByRole("progressbar", { name: "Wasserwerk Nord · KRITIS-Dachgesetz" }),
    ).toBeVisible();
  });

  it("keeps showing its data when a refresh fails, marked as not current", async () => {
    const { client } = await openDashboard();
    const activity = widget("Letzte Aktivitäten");
    await activity.findAllByRole("listitem");
    server.use(
      http.get("/api/v1/tenants/:tenant/activity", () =>
        problem(503, "service_unavailable", "Down."),
      ),
    );

    await client.invalidateQueries();

    expect(await activity.findByText(/Nicht aktuell/)).toBeVisible();
    expect(activity.getAllByRole("listitem")).toHaveLength(5);
  });

  it("says when the risk engine hasn't rated the risks yet", async () => {
    setSimulation({ riskEngineDown: true });
    await openDashboard();

    expect(await widget("Top-5-Risiken").findAllByText("Berechnung ausstehend")).toHaveLength(5);
    expect(
      widget("Restrisiko-Matrix").getByText(
        `${String(SEED.risks.length)} Risiken warten noch auf die Berechnung des Restrisikos.`,
      ),
    ).toBeVisible();
  });

  it("explains empty widgets in a Tenant without data", async () => {
    await openDashboard("wasserverband-musterland");

    expect(await screen.findByText("Noch keine Umsetzungen erfasst.")).toBeVisible();
    expect(screen.getByText("Keine kritische Anlage mit Registrierung erfasst.")).toBeVisible();
    expect(screen.getAllByText("Noch keine Risiken erfasst.")).toHaveLength(2);
    expect(screen.getByText("Ihnen sind keine offenen Umsetzungen zugewiesen.")).toBeVisible();
    expect(screen.getByText("Noch keine Aktivitäten.")).toBeVisible();
  });

  it("shows an Auditor their own assignments", async () => {
    setMockSession("auditor");
    await openDashboard();

    const items = await widget("Meine offenen Umsetzungen").findAllByRole("listitem");
    const own = SEED.implementations.filter(
      (i) => i.owner_id === "u-wolff" && (i.status === "open" || i.status === "partial"),
    );
    expect(items).toHaveLength(Math.min(own.length, 5));
  });
});
