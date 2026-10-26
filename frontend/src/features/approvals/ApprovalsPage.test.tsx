import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { http, HttpResponse } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { server } from "@/mocks/server";
import { rejectRiskAssessment } from "@/shared/api/approvals";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";
import { coverageMatrixQuery } from "@/shared/api/compliance";
import { deadlinesQuery } from "@/shared/api/organization";

const DEMO = "muster-stadtwerke";
const PAGE = `/t/${DEMO}/approvals`;
const ASSESSMENT = /^Risikobewertung Wasserwerk Nord 2026/;

async function openInbox() {
  const rendered = renderRoute(PAGE);
  await screen.findByRole("heading", { level: 1, name: "Freigaben" });
  return rendered;
}

const inbox = () => screen.findByRole("list", { name: "Offene Freigaben" });
const item = async (name: RegExp) => within(await inbox()).findByRole("article", { name });
const navLink = () =>
  within(screen.getByRole("navigation", { name: "Hauptnavigation" })).getByRole("link", {
    name: /^Freigaben/,
  });

async function confirmIn(title: string, button: string) {
  const heading = await screen.findByText(title);
  const modal = heading.closest<HTMLElement>(".ant-modal")!;
  await userEvent.click(within(modal).getByRole("button", { name: button }));
}

describe("the approvals inbox", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("lists everything waiting for my approval, oldest first, with who submitted it", async () => {
    await openInbox();

    const entries = within(await inbox()).getAllByRole("article");
    expect(entries.length).toBe(5);
    const assessment = within(await item(ASSESSMENT));
    expect(assessment.getByText("Risikobewertung")).toBeInTheDocument();
    expect(assessment.getByText(/eingereicht von Deniz Yılmaz/)).toBeInTheDocument();
    expect(entries.some((entry) => entry.textContent.includes("Mapping-Vorschlag"))).toBe(true);
  });

  it("counts them in the navigation", async () => {
    await openInbox();

    await waitFor(() => {
      expect(navLink()).toHaveAccessibleName("Freigaben, 5 offen");
    });
  });

  it("approves a Risk Assessment after a confirmation, and the count follows", async () => {
    const { client } = await openInbox();
    const timeline = deadlinesQuery(DEMO);
    await client.query(timeline);

    await userEvent.click(
      within(await item(ASSESSMENT)).getByRole("button", { name: "Freigeben" }),
    );
    await confirmIn("Risikobewertung freigeben?", "Freigeben");

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Offene Freigaben" })).queryByRole("article", {
          name: ASSESSMENT,
        }),
      ).toBeNull();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/freigegeben/);
    await waitFor(() => {
      expect(navLink()).toHaveAccessibleName("Freigaben, 4 offen");
    });
    // An approved assessment sets the date of the next one on the timeline.
    expect(client.getQueryState(timeline.queryKey)?.isInvalidated).toBe(true);
  });

  it("rejects a Risk Assessment only with a reason", async () => {
    await openInbox();

    await userEvent.click(within(await item(ASSESSMENT)).getByRole("button", { name: "Ablehnen" }));
    await confirmIn("Risikobewertung ablehnen?", "Ablehnen");
    expect(await screen.findByText("Bitte geben Sie eine Begründung an.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Begründung"), "Die Lieferkette fehlt.");
    await confirmIn("Risikobewertung ablehnen?", "Ablehnen");

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Offene Freigaben" })).queryByRole("article", {
          name: ASSESSMENT,
        }),
      ).toBeNull();
    });
  });

  it("approves a Mapping Suggestion from the inbox", async () => {
    const { client } = await openInbox();
    const matrix = coverageMatrixQuery(DEMO);
    await client.query(matrix);
    const suggestion = within(await item(/^§ 13 Abs\. 3 Nr\. 2/));

    await userEvent.click(suggestion.getByRole("button", { name: "Annehmen" }));
    await confirmIn("Mapping-Vorschlag annehmen?", "Annehmen");

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Offene Freigaben" })).queryByRole("article", {
          name: /^§ 13 Abs\. 3 Nr\. 2/,
        }),
      ).toBeNull();
    });
    // The new Tenant Mapping adds a cell to the coverage matrix.
    expect(client.getQueryState(matrix.queryKey)?.isInvalidated).toBe(true);
  });

  it("moves focus to the next item after a decision", async () => {
    await openInbox();

    await userEvent.click(
      within(await item(ASSESSMENT)).getByRole("button", { name: "Freigeben" }),
    );
    await confirmIn("Risikobewertung freigeben?", "Freigeben");

    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleName(/^§ 13 Abs\. 1 /);
    });
  });

  it("takes the decided item out at once, so it can't be decided twice", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openInbox();
    await item(ASSESSMENT);
    // From now on the inbox doesn't answer, so only the confirmed decision can remove it.
    server.use(
      http.get("/api/v1/tenants/:tenant/approvals", async () => {
        await held;
        return undefined;
      }),
    );

    await userEvent.click(
      within(await item(ASSESSMENT)).getByRole("button", { name: "Freigeben" }),
    );
    await confirmIn("Risikobewertung freigeben?", "Freigeben");

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Offene Freigaben" })).queryByRole("article", {
          name: ASSESSMENT,
        }),
      ).toBeNull();
    });
    expect(navLink()).toHaveAccessibleName("Freigaben, 4 offen");
    release();
  });

  it("links each item to where it is reviewed in full", async () => {
    await openInbox();

    expect(
      within(await item(ASSESSMENT)).getByRole("link", { name: "Risiken ansehen" }),
    ).toHaveAttribute("href", `/t/${DEMO}/risks?scope=sc-nord`);
  });

  it("says so when someone else decided first", async () => {
    await openInbox();
    await item(ASSESSMENT);
    await rejectRiskAssessment(DEMO, "ra-n-2026", "Schon erledigt.");

    await userEvent.click(
      within(await item(ASSESSMENT)).getByRole("button", { name: "Freigeben" }),
    );
    await confirmIn("Risikobewertung freigeben?", "Freigeben");

    expect(await screen.findByRole("alert")).toHaveTextContent(/bereits entschieden/);
    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Offene Freigaben" })).queryByRole("article", {
          name: ASSESSMENT,
        }),
      ).toBeNull();
    });
  });
});

describe("the count in the navigation", () => {
  it("follows decisions made on the suggestions page too", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    renderRoute(`/t/${DEMO}/suggestions`);
    await waitFor(() => {
      expect(navLink()).toHaveAccessibleName("Freigaben, 5 offen");
    });
    const card = within(await screen.findByRole("article", { name: /^§ 13 Abs\. 3 Nr\. 2/ }));

    await userEvent.click(card.getByRole("button", { name: "Annehmen" }));
    const heading = await screen.findByText("Vorschlag annehmen?");
    await userEvent.click(
      within(heading.closest<HTMLElement>(".ant-modal")!).getByRole("button", { name: "Annehmen" }),
    );

    await waitFor(() => {
      expect(navLink()).toHaveAccessibleName("Freigaben, 4 offen");
    });
  });

  it("isn't shown to an Auditor, whatever the server counts", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    setMockSession("auditor");
    server.use(
      http.get("/api/v1/tenants/:tenant/approvals", () =>
        HttpResponse.json({ items: [], total: 3 }),
      ),
    );
    renderRoute(`/t/${DEMO}/dashboard`);
    await screen.findByRole("heading", { level: 1, name: "Übersicht" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(navLink()).toHaveAccessibleName("Freigaben");
  });
});

describe("the approvals inbox for an Auditor", () => {
  it("explains that an Auditor approves nothing, and shows no count", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    setMockSession("auditor");
    await openInbox();

    expect(await screen.findByText(/Als Auditor geben Sie nichts frei/)).toBeInTheDocument();
    expect(navLink()).toHaveAccessibleName("Freigaben");
  });
});

describe("the approvals inbox on a phone", () => {
  it("offers the decisions in each card's actions menu", async () => {
    await openInbox();

    await userEvent.click(within(await item(ASSESSMENT)).getByRole("button", { name: "Aktionen" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Freigeben/ }));
    await confirmIn("Risikobewertung freigeben?", "Freigeben");

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Offene Freigaben" })).queryByRole("article", {
          name: ASSESSMENT,
        }),
      ).toBeNull();
    });
  });
});
