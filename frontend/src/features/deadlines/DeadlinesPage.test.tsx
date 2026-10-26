import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/mocks/server";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/deadlines";

async function openDeadlines() {
  const rendered = renderRoute(PAGE);
  await screen.findByRole("heading", { level: 1, name: "Fristen" });
  return rendered;
}

const list = () => screen.findByRole("list", { name: "Alle Fristen nach Datum" });

describe("the deadlines", () => {
  it("list every deadline soonest first, with its legal basis and facility", async () => {
    await openDeadlines();

    const entries = within(await list()).getAllByRole("listitem");
    // Four duties per facility from the Registration, and the renewal of Süd's assessment.
    expect(entries).toHaveLength(9);
    const dates = entries.map((entry) => entry.querySelector("strong")?.textContent);
    expect(dates).toEqual([
      "15.10.2027",
      "15.11.2027",
      "15.11.2027",
      "15.11.2027",
      "01.12.2027",
      "01.01.2028",
      "01.01.2028",
      "01.01.2028",
      "03.11.2029",
    ]);
    expect(entries[0]).toHaveTextContent("§ 12 KRITIS-DachG");
    expect(entries[0]).toHaveTextContent("Risikoanalyse und Risikobewertung");
    expect(entries[0]).toHaveTextContent("Wasserwerk Nord");
    expect(entries[0]).toHaveTextContent("Berechnet aus der geplanten Registrierung");
    expect(entries.at(-1)).toHaveTextContent("Erneute Risikobewertung");
    expect(entries.at(-1)).toHaveTextContent("Berechnet aus der freigegebenen Risikobewertung");
  });

  it("says in words whether a deadline is binding or projected", async () => {
    server.use(
      http.get("/api/v1/tenants/:tenant/deadlines", () =>
        HttpResponse.json({
          items: [
            {
              scope_id: "sc-nord",
              scope_name: "Wasserwerk Nord",
              citation: "§ 12",
              obligation: "risk_analysis",
              due_date: "2027-10-15",
              binding: true,
              basis: "confirmed_registration",
            },
            {
              scope_id: "sc-sued",
              scope_name: "Wasserwerk Süd",
              citation: "§ 13",
              obligation: "resilience_measures",
              due_date: "2028-01-01",
              binding: false,
              basis: "planned_registration",
            },
          ],
        }),
      ),
    );
    await openDeadlines();

    const [binding, projected] = within(await list()).getAllByRole("listitem");
    expect(binding).toHaveTextContent("verbindlich");
    expect(projected).toHaveTextContent("prognostiziert");
    expect(screen.getByRole("note")).toHaveTextContent(/erst mit dem bestätigten Datum/);
  });

  it("shows the timeline on wide screens, and a marker leads to its entry", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    await openDeadlines();

    const timeline = await screen.findByRole("region", { name: "Zeitstrahl" });
    expect(within(timeline).getByText("Wasserwerk Nord")).toBeInTheDocument();
    expect(within(timeline).getByText("Wasserwerk Süd")).toBeInTheDocument();
    expect(within(timeline).getByText("Heute")).toBeInTheDocument();
    // Solid and hollow markers are explained in words.
    expect(within(timeline).getByText("verbindlich")).toBeInTheDocument();
    // Deadlines a month apart would overlap at this scale, so they share one marker,
    // which names each citation once and leads to the first of them.
    const nord = within(timeline).getByRole("link", {
      name: "§ 12, § 13, § 18, § 20 KRITIS-DachG, Wasserwerk Nord, 15.10.2027 bis 15.11.2027, prognostiziert",
    });
    expect(within(timeline).getAllByRole("link")).toHaveLength(3);

    await userEvent.click(nord);

    const entry = within(await list()).getAllByRole("listitem")[0]!;
    await waitFor(() => {
      expect(entry).toHaveFocus();
    });
    expect(entry).toHaveTextContent("§ 12 KRITIS-DachG");
  });

  it("leaves a modified click to the browser, which opens the link elsewhere", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    await openDeadlines();
    const timeline = await screen.findByRole("region", { name: "Zeitstrahl" });
    const marker = within(timeline).getAllByRole("link")[0]!;

    const handled = !fireEvent.click(marker, { ctrlKey: true });

    expect(handled).toBe(false);
    expect(document.activeElement).not.toBe(within(await list()).getAllByRole("listitem")[0]);
  });

  it("leaves the timeline out on phones, where the list is the view", async () => {
    await openDeadlines();
    await list();

    expect(screen.queryByRole("region", { name: "Zeitstrahl" })).not.toBeInTheDocument();
  });

  it("explains a Tenant without a Critical Facility", async () => {
    server.use(
      http.get("/api/v1/tenants/:tenant/deadlines", () => HttpResponse.json({ items: [] })),
    );
    await openDeadlines();

    expect(
      await screen.findByText(/Noch keine kritische Anlage mit Registrierung erfasst/),
    ).toBeInTheDocument();
  });
});
