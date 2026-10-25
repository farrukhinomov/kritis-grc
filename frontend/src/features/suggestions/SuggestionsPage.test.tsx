import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { mappingsQuery } from "@/shared/api/compliance";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/suggestions";
const ACCESS = "§ 13 Abs. 3 Nr. 2 Objektschutz, Detektion und Zugangskontrolle";

async function openReview(path = PAGE) {
  const rendered = renderRoute(path);
  await screen.findByRole("heading", { level: 1, name: "Mapping-Vorschläge" });
  return rendered;
}

const list = (name: RegExp) => screen.findByRole("region", { name });
const pending = () => list(/^Offen/);
const accepted = () => list(/^Angenommen/);
const rejected = () => list(/^Abgelehnt/);
const card = async (region: Promise<HTMLElement>, name: string) =>
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
    release();
  });

  it("moves focus to the next pending Suggestion after a decision", async () => {
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Ablehnen" }));
    await confirm("Ablehnen");

    await card(rejected(), ACCESS);
    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleName(/§ 13 Abs. 4 /);
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
    server.use(
      http.post("/api/v1/tenants/:tenant/mapping-suggestions/:id/approve", () =>
        problem(409, "suggestion_already_decided", "Already decided."),
      ),
    );
    await openReview();
    const suggestion = within(await card(pending(), ACCESS));

    await userEvent.click(suggestion.getByRole("button", { name: "Annehmen" }));
    await confirm("Annehmen");

    expect(await screen.findByRole("alert")).toHaveTextContent(/bereits entschieden/);
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
  it("can be read but not decided", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    setMockSession("auditor");
    await openReview();

    const suggestion = within(await card(pending(), ACCESS));
    expect(suggestion.queryByRole("button", { name: "Annehmen" })).toBeNull();
    expect(suggestion.queryByRole("button", { name: "Aktionen" })).toBeNull();
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
});
