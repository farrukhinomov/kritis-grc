import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { apiGet } from "@/shared/api/client";
import { coverageMatrixQuery, mappingsQuery, rejectSuggestion } from "@/shared/api/compliance";
import type { MappingSuggestion, Page } from "@/shared/api/types";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/suggestions";
const DEMO = "muster-stadtwerke";
const ACCESS = /^§ 13 Abs. 3 Nr. 2 Objektschutz, Detektion und Zugangskontrolle/;
const PLAN = /^§ 13 Abs. 4 Resilienzplan/;

async function openReview(path = PAGE) {
  const rendered = renderRoute(path);
  await screen.findByRole("heading", { level: 1, name: "Mapping-Vorschläge" });
  return rendered;
}

const list = (name: RegExp) => screen.findByRole("region", { name });
const pending = () => list(/^Offen/);
const accepted = () => list(/^Angenommen/);
const rejected = () => list(/^Abgelehnt/);
const card = async (region: Promise<HTMLElement>, name: RegExp) =>
  within(await region).findByRole("article", { name });

/** The confirmation names what happens; its button repeats the decision. */
async function confirm(decision: "Annehmen" | "Ablehnen") {
  const dialog = await screen.findByText(
    decision === "Annehmen" ? "Vorschlag annehmen?" : "Vorschlag ablehnen?",
  );
  const modal = dialog.closest<HTMLElement>(".ant-modal")!;
  await userEvent.click(within(modal).getByRole("button", { name: decision }));
}

describe("the Mapping Suggestion review on a wide screen", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("shows each pending Suggestion with source, target, coverage, rationale and confidence", async () => {
    await openReview();

    const suggestion = within(await card(pending(), ACCESS));
    expect(suggestion.getByText("§ 30 Abs. 2 Nr. 9", { selector: "strong" })).toBeInTheDocument();
    expect(suggestion.getByText("NIS2 (BSIG 2025)")).toBeInTheDocument();
    expect(suggestion.getByText("Teilweise Abdeckung")).toBeInTheDocument();
    expect(suggestion.getByText(/Beide verlangen Zugangskontrollen/)).toBeInTheDocument();
    expect(suggestion.getByText(/Einschätzung des Modells: 64 %/)).toBeInTheDocument();
    expect(screen.getByText(/ein Hinweis, kein Beleg/)).toBeInTheDocument();
  });

  it("lists the pending ones in statute order", async () => {
    await openReview();

    const titles = within(await pending())
      .getAllByRole("article")
      .map((item) => item.getAttribute("aria-label") ?? item.textContent);
    expect(titles[0]).toMatch(/§ 13 Abs. 1 /);
    expect(titles.at(-1)).toMatch(/§ 18 Abs. 2/);
  });

  it("moves an approved Suggestion into the accepted list, saying who decided", async () => {
    const { client } = await openReview();
    // Mappings the cockpit has cached must not outlive the decision.
    const mappings = mappingsQuery("muster-stadtwerke", { target_requirement: "req-k-13-3-2" });
    await client.query(mappings);
    const matrix = coverageMatrixQuery("muster-stadtwerke");
    await client.query(matrix);
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Annehmen" }));
    await confirm("Annehmen");

    const moved = within(await card(accepted(), ACCESS));
    expect(moved.getByText(/Angenommen von Alex Kramer/)).toBeInTheDocument();
    expect(within(await pending()).queryByRole("article", { name: ACCESS })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/angenommen/);
    await waitFor(() => {
      expect(client.getQueryState(mappings.queryKey)?.isInvalidated).toBe(true);
    });
    // The new Tenant Mapping adds a cell to the coverage matrix.
    expect(client.getQueryState(matrix.queryKey)?.isInvalidated).toBe(true);
  });

  it("moves the card as soon as the server confirms, so it can glide, before the lists reload", async () => {
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));
    // From now on the lists don't answer, so only the confirmed decision can move the card.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/v1/tenants/:tenant/mapping-suggestions", async () => {
        await held;
        return undefined;
      }),
    );

    await userEvent.click(suggestion.getByRole("button", { name: "Annehmen" }));
    await confirm("Annehmen");

    expect(await card(accepted(), ACCESS)).toBeInTheDocument();
    expect(within(await pending()).queryByRole("article", { name: ACCESS })).toBeNull();
    // Feedback doesn't wait for the lists either.
    expect(screen.getByRole("status")).toHaveTextContent("§ 13 Abs. 3 Nr. 2");
    expect(document.activeElement).toHaveAccessibleName(PLAN);
    release();
  });

  it("moves focus to the next pending Suggestion after a decision", async () => {
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Ablehnen" }));
    await confirm("Ablehnen");

    await card(rejected(), ACCESS);
    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleName(PLAN);
    });
  });

  it("changes nothing when the confirmation is cancelled", async () => {
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Annehmen" }));
    await screen.findByText("Vorschlag annehmen?");
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(await card(pending(), ACCESS)).toBeInTheDocument();
    expect(within(await accepted()).queryAllByRole("article")).toEqual([]);
  });

  it("says so when someone else decided first, and shows the current state", async () => {
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));
    // Someone else rejects it after this page was loaded.
    await rejectSuggestion(DEMO, "sug-1");

    await userEvent.click(suggestion.getByRole("button", { name: "Annehmen" }));
    await confirm("Annehmen");

    expect(await screen.findByRole("alert")).toHaveTextContent(/bereits entschieden/);
    expect(await card(rejected(), ACCESS)).toBeInTheDocument();
    expect(within(await pending()).queryByRole("article", { name: ACCESS })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("takes one decision at a time", async () => {
    server.use(
      http.post("/api/v1/tenants/:tenant/mapping-suggestions/:id/approve", async () => {
        await delay("infinite");
      }),
    );
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Annehmen" }));
    await confirm("Annehmen");

    const other = within(await card(pending(), PLAN));
    await waitFor(() => {
      expect(other.getByRole("button", { name: "Annehmen" })).toBeDisabled();
    });
    expect(other.getByRole("button", { name: "Ablehnen" })).toBeDisabled();
  });

  it("announces every decision, also two alike in a row", async () => {
    await openReview();

    await userEvent.click(
      within(await card(pending(), ACCESS)).getByRole("button", { name: "Annehmen" }),
    );
    await confirm("Annehmen");
    await card(accepted(), ACCESS);
    await userEvent.click(
      within(await card(pending(), PLAN)).getByRole("button", { name: "Annehmen" }),
    );
    await confirm("Annehmen");

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("§ 13 Abs. 4");
    });
  });

  it("names each card by its target and its source", async () => {
    await openReview();

    expect(await card(pending(), ACCESS)).toHaveAccessibleName(/Quelle: § 30 Abs. 2 Nr. 9$/);
  });

  it("goes back a page when its last Suggestion was decided", async () => {
    const real = await apiGet<Page<MappingSuggestion>>(
      `/api/v1/tenants/${DEMO}/mapping-suggestions?status=pending`,
    );
    let items = Array.from({ length: 26 }, (_, index) => ({
      ...real.items[0]!,
      id: `many-${String(index)}`,
    }));
    server.use(
      http.get("/api/v1/tenants/:tenant/mapping-suggestions", ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("status") !== "pending") {
          return undefined;
        }
        const number = Number(params.get("page") ?? "1");
        return HttpResponse.json({
          items: items.slice((number - 1) * 25, number * 25),
          page: { number, limit: 25, total: items.length },
        });
      }),
      http.post("/api/v1/tenants/:tenant/mapping-suggestions/:id/reject", ({ params }) => {
        const decided = items.find((item) => item.id === params.id)!;
        items = items.filter((item) => item.id !== params.id);
        return HttpResponse.json({ ...decided, status: "rejected" });
      }),
    );
    await openReview();
    const list = within(await pending());
    await userEvent.click(await list.findByTitle("2"));
    await waitFor(() => {
      expect(list.getAllByRole("article")).toHaveLength(1);
    });

    await userEvent.click(list.getByRole("button", { name: "Ablehnen" }));
    await confirm("Ablehnen");

    await waitFor(() => {
      expect(list.getAllByRole("article")).toHaveLength(25);
    });
    expect(list.queryByText(/Keine offenen Vorschläge/)).not.toBeInTheDocument();
  });

  it("keeps the Suggestion pending when the decision can't be saved", async () => {
    server.use(
      http.post("/api/v1/tenants/:tenant/mapping-suggestions/:id/reject", () =>
        problem(503, "service_unavailable", "Down."),
      ),
    );
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Ablehnen" }));
    await confirm("Ablehnen");

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht gespeichert/);
    expect(await card(pending(), ACCESS)).toBeInTheDocument();
  });

  it("explains empty lists", async () => {
    await openReview("/t/wasserverband-musterland/suggestions");

    expect(await screen.findByText(/Keine offenen Vorschläge/)).toBeInTheDocument();
    expect(screen.getByText(/Noch keine angenommenen Vorschläge/)).toBeInTheDocument();
  });
});

describe("the Mapping Suggestion review for an Auditor", () => {
  it("can be read but not decided on a wide screen", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    setMockSession("auditor");
    await openReview();

    const suggestion = within(await card(pending(), ACCESS));
    expect(suggestion.queryByRole("button", { name: "Annehmen" })).toBeNull();
  });

  it("can be read but not decided on a phone", async () => {
    setMockSession("auditor");
    await openReview();

    const suggestion = within(await card(pending(), ACCESS));
    expect(suggestion.queryByRole("button", { name: "Aktionen" })).toBeNull();
    expect(suggestion.queryByRole("button", { name: "Annehmen" })).toBeNull();
  });
});

describe("the Mapping Suggestion review on a phone", () => {
  it("offers the decisions behind each card's actions, as the swipe does", async () => {
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Aktionen" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Annehmen/ }));
    await confirm("Annehmen");

    expect(await card(accepted(), ACCESS)).toBeInTheDocument();
  });

  it("locks the other cards' actions while a decision is being saved", async () => {
    server.use(
      http.post("/api/v1/tenants/:tenant/mapping-suggestions/:id/approve", async () => {
        await delay("infinite");
      }),
    );
    await openReview();

    await userEvent.click(
      within(await card(pending(), ACCESS)).getByRole("button", { name: "Aktionen" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: /Annehmen/ }));
    await confirm("Annehmen");
    await userEvent.click(
      within(await card(pending(), PLAN)).getByRole("button", { name: "Aktionen" }),
    );

    const items = await screen.findAllByRole("menuitem", { name: /Annehmen/ });
    expect(items.at(-1)).toHaveAttribute("aria-disabled", "true");
  });
});
