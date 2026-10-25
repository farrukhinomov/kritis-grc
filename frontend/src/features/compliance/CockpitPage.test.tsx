import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { setSimulation } from "@/mocks/simulation";

import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const COCKPIT = "/t/muster-stadtwerke/compliance";
const column = async (name: string) => within(await screen.findByRole("region", { name }));
const list = (name: string) => screen.findByRole("list", { name });

/**
 * antd's Select keeps a hidden option list for screen readers next to the visible one;
 * only a click on the visible option changes the value.
 */
async function choose(select: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: select }));
  const item = await waitFor(() => {
    const element = document.querySelector(`.ant-select-item-option[title="${option}"]`);
    expect(element).not.toBeNull();
    return element!;
  });
  await userEvent.click(item);
}

async function openCockpit(search = "") {
  const rendered = renderRoute(`${COCKPIT}${search}`);
  await screen.findByRole("heading", { level: 1, name: "Compliance" });
  return rendered;
}

describe("the compliance cockpit on a wide screen", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("starts on the first Framework and the first Critical Facility", async () => {
    await openCockpit();

    expect(await screen.findByRole("combobox", { name: "Framework" })).toBeInTheDocument();
    expect(await screen.findByText("KRITIS-Dachgesetz")).toBeInTheDocument();
    expect(screen.getByText("Wasserwerk Nord")).toBeInTheDocument();
    const paragraphs = within(await list("Paragraphen"));
    expect(paragraphs.getAllByRole("button").map((b) => b.dataset.key)).toEqual([
      "§ 8",
      "§ 12",
      "§ 13",
      "§ 16",
      "§ 18",
      "§ 20",
    ]);
    expect(paragraphs.getByRole("button", { name: /§ 13/ })).toHaveTextContent("2 von 8 umgesetzt");
  });

  it("drills from a paragraph to one Implementation, keeping the path in the URL", async () => {
    const { router } = await openCockpit();

    await userEvent.click(within(await list("Paragraphen")).getByRole("button", { name: /§ 13/ }));
    const requirements = within(await list("Anforderungen"));
    await userEvent.click(requirements.getByRole("button", { name: /§ 13 Abs. 1\b/ }));

    const detail = await column("Umsetzung");
    expect(await detail.findByText("Deniz Yılmaz")).toBeInTheDocument();
    expect(detail.getByText("Teilweise umgesetzt")).toBeInTheDocument();
    expect(detail.getByText(/Der Betreiber kritischer Anlagen ist verpflichtet/)).toHaveAttribute(
      "lang",
      "de",
    );
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("paragraph")).toBe("§ 13");
    expect(params.get("requirement")).toBe("req-k-13-1");
    expect(requirements.getByRole("button", { name: /§ 13 Abs. 1\b/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("marks Requirements with Pending Legal Detail and explains why", async () => {
    await openCockpit("?paragraph=§ 13&requirement=req-k-13-4");

    const requirement = within(await list("Anforderungen")).getByRole("button", {
      name: /§ 13 Abs. 4/,
    });
    expect(requirement).toHaveTextContent("Rechtsdetail ausstehend");
    expect(await (await column("Umsetzung")).findByText(/BBK-Vorlagen und -Muster/)).toBeVisible();
  });

  it("restores the place from a shared link", async () => {
    await openCockpit(
      "?framework=fw-kritisdachg&scope=sc-sued&paragraph=§ 13&requirement=req-k-13-1",
    );

    expect(await (await column("Umsetzung")).findByText("Offen")).toBeInTheDocument();
    expect(screen.getByText("Wasserwerk Süd")).toBeInTheDocument();
  });

  it("keeps the place when switching facility, so the two can be compared", async () => {
    const { router } = await openCockpit("?paragraph=§ 13&requirement=req-k-13-1");
    await (await column("Umsetzung")).findByText("Teilweise umgesetzt");

    await choose("Geltungsbereich", "Wasserwerk Süd");

    expect(await (await column("Umsetzung")).findByText("Offen")).toBeInTheDocument();
    const params = new URLSearchParams(router.state.location.search);
    expect([params.get("scope"), params.get("paragraph")]).toEqual(["sc-sued", "§ 13"]);
  });

  it("starts over when switching Framework, as its paragraphs are different", async () => {
    const { router } = await openCockpit("?paragraph=§ 13&requirement=req-k-13-1");
    await (await column("Umsetzung")).findByText("Teilweise umgesetzt");

    await choose("Framework", "NIS2 (BSIG 2025)");

    expect(
      await within(await list("Paragraphen")).findByRole("button", { name: /§ 30/ }),
    ).toBeVisible();
    // The organization is the only Scope with NIS2 Implementations, so it is chosen.
    expect(screen.getByText("Muster-Stadtwerke Saar GmbH")).toBeInTheDocument();
    const params = new URLSearchParams(router.state.location.search);
    expect([params.get("framework"), params.get("scope"), params.get("paragraph")]).toEqual([
      "fw-bsig",
      null,
      null,
    ]);
  });

  it("moves with the arrow keys within and between columns", async () => {
    await openCockpit();
    const paragraphs = within(await list("Paragraphen"));
    paragraphs.getByRole("button", { name: /§ 8/ }).focus();

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(paragraphs.getByRole("button", { name: /§ 13/ })).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    const requirements = within(await list("Anforderungen"));
    await waitFor(() => {
      expect(requirements.getByRole("button", { name: /§ 13 Abs. 1\b/ })).toHaveFocus();
    });

    await userEvent.keyboard("{End}");
    expect(requirements.getByRole("button", { name: /§ 13 Abs. 4/ })).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    expect(paragraphs.getByRole("button", { name: /§ 13/ })).toHaveFocus();
  });
});

describe("the compliance cockpit on a phone", () => {
  it("shows one level at a time, and the browser's back gesture returns a level", async () => {
    const { router } = await openCockpit();

    await userEvent.click(within(await list("Paragraphen")).getByRole("button", { name: /§ 13/ }));
    expect(await list("Anforderungen")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Paragraphen" })).not.toBeInTheDocument();
    });

    await router.navigate(-1);

    const paragraphs = await list("Paragraphen");
    await waitFor(() => {
      expect(paragraphs).toBeVisible();
    });
  });

  it("goes back a level with the back button", async () => {
    await openCockpit("?paragraph=§ 13");
    await list("Anforderungen");

    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(await list("Paragraphen")).toBeVisible();
  });
});

describe("a Tenant without Implementations", () => {
  it("says so instead of showing empty columns", async () => {
    renderRoute("/t/wasserverband-musterland/compliance");

    expect(await screen.findByText("Noch keine Umsetzungen erfasst.")).toBeVisible();
  });
});

describe("the cockpit's history and focus", () => {
  it("leaves no duplicate history entry behind the in-app back button", async () => {
    const { router } = await openCockpit();
    await userEvent.click(within(await list("Paragraphen")).getByRole("button", { name: /§ 13/ }));
    await userEvent.click(
      within(await list("Anforderungen")).getByRole("button", { name: /§ 13 Abs. 1 / }),
    );
    await (await column("Umsetzung")).findByText("Deniz Yılmaz");
    // The level before may still be animating out with its own back button.
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Zurück" })).toHaveLength(1);
    });

    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    await list("Anforderungen");
    await router.navigate(-1);

    expect(await list("Paragraphen")).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("paragraph")).toBeNull();
  });

  it("drops a link's levels that don't exist, so one back press is enough", async () => {
    const { router } = await openCockpit("?paragraph=§ 13&requirement=gibt-es-nicht");
    await list("Anforderungen");

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("requirement")).toBeNull();
    });
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(await list("Paragraphen")).toBeInTheDocument();
  });

  it("keeps the columns while another facility loads", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    await openCockpit("?paragraph=§ 13&requirement=req-k-13-1");
    await (await column("Umsetzung")).findByText("Teilweise umgesetzt");
    // Slow answers, so the moment between choosing and the new numbers is visible.
    setSimulation({ latency: "short" });

    await choose("Geltungsbereich", "Wasserwerk Süd");

    expect(screen.getByRole("list", { name: "Anforderungen" })).toBeInTheDocument();
    expect(await (await column("Umsetzung")).findByText("Offen")).toBeInTheDocument();
  });

  it("forgets a keyboard move that led nowhere, so a later click keeps its focus", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    server.use(
      http.get("/api/v1/tenants/:tenant/requirements", ({ request }) =>
        new URL(request.url).searchParams.get("paragraph") === "§ 12"
          ? problem(503, "service_unavailable", "Down.")
          : undefined,
      ),
    );
    await openCockpit();
    const paragraphs = within(await list("Paragraphen"));
    paragraphs.getByRole("button", { name: /§ 12/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await screen.findByText("Dieser Bereich konnte nicht geladen werden.");

    await userEvent.click(paragraphs.getByRole("button", { name: /§ 16/ }));
    await list("Anforderungen");

    expect(paragraphs.getByRole("button", { name: /§ 16/ })).toHaveFocus();
  });

  it("keeps focus on the facility picker on a phone after moving in a list", async () => {
    await openCockpit("?paragraph=§ 13");
    within(await list("Anforderungen"))
      .getAllByRole("button")[0]!
      .focus();
    await userEvent.keyboard("{ArrowDown}");

    await choose("Geltungsbereich", "Wasserwerk Süd");
    await list("Anforderungen");

    expect(document.activeElement).not.toBe(document.body);
  });
});
