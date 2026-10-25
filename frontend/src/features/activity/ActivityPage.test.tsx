import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/mocks/server";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/activity";

async function openActivity(search = "") {
  const rendered = renderRoute(`${PAGE}${search}`);
  await screen.findByRole("heading", { level: 1, name: "Aktivitätsprotokoll" });
  return rendered;
}

/** antd's Select keeps a hidden option list for screen readers; only the visible one reacts. */
async function choose(select: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: select }));
  const item = await waitFor(() => {
    const element = document.querySelector(`.ant-select-item-option[title="${option}"]`);
    expect(element).not.toBeNull();
    return element!;
  });
  await userEvent.click(item);
}

const log = () => screen.findByRole("list", { name: "Aktivitätsprotokoll" });

beforeEach(() => {
  matchMediaQueries(WIDE_SCREEN_QUERY);
});

describe("the Activity Log", () => {
  it("lists who changed what, newest first, with the changed fields", async () => {
    await openActivity();

    const entries = [...(await log()).children];
    expect(entries.length).toBeGreaterThan(5);
    expect(entries[0]).toHaveTextContent(/hat (geändert|angelegt|freigegeben|kommentiert)/);
    // Changed fields read as the interface says them, never as stored values.
    expect(
      within(await log()).getAllByText(/Status: .* → Teilweise umgesetzt/).length,
    ).toBeGreaterThan(0);
    expect(within(await log()).queryByText(/open → partial/)).not.toBeInTheDocument();
  });

  it("filters by object type and action, and keeps the filters in the URL", async () => {
    const { router } = await openActivity();
    await log();

    await choose("Objekt", "Umsetzung");
    await choose("Aktion", "geändert");

    await waitFor(() => {
      // The log's own entries, not the lists of changed fields inside them.
      const entries = [...screen.getByRole("list", { name: "Aktivitätsprotokoll" }).children];
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((entry) => entry.textContent.includes("Umsetzung"))).toBe(true);
    });
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("type")).toBe("implementation");
    expect(params.get("action")).toBe("updated");
  });

  it("loads older entries on request", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/tenants/:tenant/activity", ({ request }) => {
        calls += 1;
        const older = new URL(request.url).searchParams.has("cursor");
        const entry = (id: string) => ({
          id,
          occurred_at: "2026-10-01T10:00:00Z",
          actor_id: "u-kramer",
          actor_name: "Alex Kramer",
          action: "updated",
          object_type: "implementation",
          object_id: "im-001",
          object_label: older ? "Ältere Umsetzung" : "Neuere Umsetzung",
          changes: [],
        });
        return HttpResponse.json({
          items: [entry(older ? "a-2" : "a-1")],
          page: { next_cursor: older ? null : "next", limit: 1 },
        });
      }),
    );
    await openActivity();
    await within(await log()).findByText(/Neuere Umsetzung/);

    await userEvent.click(screen.getByRole("button", { name: "Ältere Einträge laden" }));

    expect(await within(await log()).findByText(/Ältere Umsetzung/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ältere Einträge laden" })).not.toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("explains a filter without entries", async () => {
    await openActivity("?action=deleted");

    expect(await screen.findByText(/Keine Einträge für diese Auswahl/)).toBeInTheDocument();
  });
});
