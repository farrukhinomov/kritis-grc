import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import * as complianceApi from "@/shared/api/compliance";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const MB = 1024 * 1024;

/** A file that really starts like a PDF, as the server checks the content. */
function pdfFile(name: string, bytes: number) {
  const content = new Uint8Array(bytes);
  content.set(new TextEncoder().encode("%PDF-1.7"));
  return new File([content], name, { type: "application/pdf" });
}
const place = (requirement: string, scope = "sc-nord") =>
  `/t/muster-stadtwerke/compliance?scope=${scope}&paragraph=§ 13&requirement=${requirement}&panel=evidence`;

async function openEvidence(requirement: string) {
  const { client } = renderRoute(place(requirement));
  const element = await screen.findByRole("dialog");
  const drawer = within(element);
  await drawer.findByRole("tab", { name: "Nachweise", selected: true });
  return Object.assign(drawer, { element, client });
}

/** antd's Segmented keeps its native radios under the labels, out of pointer reach. */
const chooseKind = (drawer: HTMLElement, name: string) =>
  userEvent.setup({ pointerEventsCheck: 0 }).click(within(drawer).getByRole("radio", { name }));

const evidenceList = () => screen.findByRole("list", { name: "Nachweise" });

beforeEach(() => {
  matchMediaQueries(WIDE_SCREEN_QUERY);
});

describe("the Evidence of an Implementation", () => {
  it("lists files, links and references with their details", async () => {
    await openEvidence("req-k-13-3-1");

    const list = within(await evidenceList());
    expect(list.getByText("Notfallhandbuch Wasserwerk Nord")).toBeInTheDocument();
    expect(list.getByText(/notfallhandbuch-ww-nord-2026-09\.pdf · 1,8 MB/)).toBeInTheDocument();
  });

  it("adds a link", async () => {
    const drawer = await openEvidence("req-k-13-3-1");
    await chooseKind(drawer.element, "Link");

    await userEvent.type(drawer.getByLabelText("Titel"), "Wartungsvertrag");
    await userEvent.type(drawer.getByLabelText("Adresse"), "https://example.com/vertrag");
    await userEvent.click(drawer.getByRole("button", { name: "Nachweis hinzufügen" }));

    expect(await within(await evidenceList()).findByText("Wartungsvertrag")).toBeVisible();
  });

  it("uploads a file with progress and adds it", async () => {
    const drawer = await openEvidence("req-k-13-3-1");
    const file = pdfFile("pruefbericht.pdf", 3 * 1024);

    await userEvent.upload(drawer.getByLabelText(/Datei auswählen/), file);

    expect(await drawer.findByRole("progressbar")).toBeInTheDocument();
    const title = await drawer.findByLabelText("Titel");
    await waitFor(() => {
      expect(title).toHaveValue("pruefbericht");
    });
    await userEvent.click(drawer.getByRole("button", { name: "Nachweis hinzufügen" }));

    const list = within(await evidenceList());
    expect(await list.findByText(/pruefbericht\.pdf · 3 KB/)).toBeInTheDocument();
  });

  it.each([
    [
      "larger than 20 MB",
      new File([new Uint8Array(20 * MB + 1)], "gross.pdf", { type: "application/pdf" }),
      "höchstens 20 MB",
    ],
    [
      "of a type that isn't allowed",
      new File(["<p>"], "seite.html", { type: "text/html" }),
      "PDF, PNG, JPG, DOCX oder XLSX",
    ],
  ])("refuses a file %s before sending anything", async (_, file, message) => {
    const user = userEvent.setup({ applyAccept: false });
    const drawer = await openEvidence("req-k-13-3-1");
    const uploads: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.url.includes("/uploads")) {
        uploads.push(request.url);
      }
    };
    server.events.on("request:start", listener);

    await user.upload(drawer.getByLabelText(/Datei auswählen/), file);

    expect(await drawer.findByRole("alert")).toHaveTextContent(message);
    server.events.removeListener("request:start", listener);
    expect(uploads).toEqual([]);
  });

  it("asks people not to upload personal data", async () => {
    const drawer = await openEvidence("req-k-13-3-1");

    expect(drawer.getByText(/keine personenbezogenen Daten/)).toBeInTheDocument();
  });

  it("removes Evidence after a confirmation", async () => {
    await openEvidence("req-k-13-3-1");
    const list = within(await evidenceList());

    await userEvent.click(
      list.getByRole("button", { name: "Notfallhandbuch Wasserwerk Nord entfernen" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Entfernen" }));

    await waitFor(() => {
      expect(list.queryByText("Notfallhandbuch Wasserwerk Nord")).not.toBeInTheDocument();
    });
  });
});

describe("Reference Evidence", () => {
  it("suggests the NIS2 Implementation a full Mapping covers, added in one click", async () => {
    const drawer = await openEvidence("req-k-13-3-5");
    const matrix = complianceApi.coverageMatrixQuery("muster-stadtwerke");
    await drawer.client.query(matrix);
    await chooseKind(drawer.element, "Verweis");

    const suggestion = within(
      await drawer.findByRole("region", { name: "Vorschlag: BSIG § 30 Abs. 2 Nr. 9" }),
    );
    expect(suggestion.getByText(/Personalsicherheit, Zugriffskontrolle/)).toBeInTheDocument();
    expect(
      suggestion.getByText(/Personalsicherheitskonzept gilt für alle Beschäftigten/),
    ).toBeInTheDocument();

    await userEvent.click(suggestion.getByRole("button", { name: "Als Nachweis verweisen" }));

    const list = within(await evidenceList());
    expect(
      await list.findByText(
        "Personalsicherheit, Zugriffskontrolle und Asset-Management (BSIG § 30 Abs. 2 Nr. 9)",
      ),
    ).toBeInTheDocument();
    expect(await suggestion.findByText("Bereits als Nachweis verwiesen.")).toBeInTheDocument();
    // Now one Implementation counts for both, which the coverage matrix shows.
    expect(drawer.client.getQueryState(matrix.queryKey)?.isInvalidated).toBe(true);
  });

  it("explains when no full Mapping exists", async () => {
    const drawer = await openEvidence("req-k-13-1");
    await chooseKind(drawer.element, "Verweis");

    expect(await drawer.findByText(/Kein vollständiges Mapping/)).toBeInTheDocument();
  });
});

describe("Evidence for an Auditor", () => {
  it("can be read but not changed", async () => {
    setMockSession("auditor");
    const drawer = await openEvidence("req-k-13-3-1");

    expect(
      await within(await evidenceList()).findByText("Notfallhandbuch Wasserwerk Nord"),
    ).toBeVisible();
    expect(drawer.queryByRole("button", { name: /entfernen/ })).not.toBeInTheDocument();
    expect(drawer.queryByRole("button", { name: "Nachweis hinzufügen" })).not.toBeInTheDocument();
  });
});

describe("uploads that overlap or are abandoned", () => {
  it("shows the real progress while the file travels", async () => {
    let finish: () => void = () => undefined;
    vi.spyOn(complianceApi, "uploadFile").mockImplementation(
      (_slot, _file, onProgress) =>
        new Promise<void>((resolve) => {
          onProgress(0.4);
          finish = resolve;
        }),
    );
    const drawer = await openEvidence("req-k-13-3-1");

    await userEvent.upload(drawer.getByLabelText(/Datei auswählen/), pdfFile("plan.pdf", 1024));

    await waitFor(() => {
      expect(drawer.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    });
    finish();
    expect(await drawer.findByRole("button", { name: "Nachweis hinzufügen" })).toBeVisible();
  });

  it("keeps the newer file when a second one is picked during an upload", async () => {
    let first = true;
    server.use(
      http.post("/api/v1/tenants/:tenant/uploads", async () => {
        if (first) {
          first = false;
          await delay(400);
        }
        return undefined;
      }),
    );
    const drawer = await openEvidence("req-k-13-3-1");
    const input = drawer.getByLabelText(/Datei auswählen/);

    await userEvent.upload(input, pdfFile("erste.pdf", 1024));
    await userEvent.upload(input, pdfFile("zweite.pdf", 2048));
    const title = await drawer.findByLabelText("Titel");
    // Long enough for the first, slower upload to have reported back if it still could.
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(title).toHaveValue("zweite");
    // The cancelled first upload must not report a failure either.
    expect(drawer.queryByRole("alert")).not.toBeInTheDocument();
    expect(drawer.getByText(/zweite\.pdf · 2 KB/)).toBeInTheDocument();
    expect(drawer.queryByText(/erste\.pdf/)).not.toBeInTheDocument();
  });

  it("sends nothing to storage once the drawer is closed", async () => {
    // The upload URL arrives only after the drawer is closed, however slow the run is.
    let release: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("/api/v1/tenants/:tenant/uploads", async () => {
        await closed;
        return undefined;
      }),
    );
    const puts: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.method === "PUT") {
        puts.push(request.url);
      }
    };
    server.events.on("request:start", listener);
    const drawer = await openEvidence("req-k-13-3-1");

    await userEvent.upload(drawer.getByLabelText(/Datei auswählen/), pdfFile("plan.pdf", 1024));
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    release();
    await new Promise((resolve) => setTimeout(resolve, 300));
    server.events.removeListener("request:start", listener);

    expect(puts).toEqual([]);
  });
});

describe("Evidence forms on their own", () => {
  it("don't show another form's error", async () => {
    server.use(
      http.post("/api/v1/tenants/:tenant/implementations/:id/evidence", () =>
        problem(503, "service_unavailable", "Down."),
      ),
    );
    const drawer = await openEvidence("req-k-13-3-1");
    await chooseKind(drawer.element, "Link");
    await userEvent.type(drawer.getByLabelText("Titel"), "Vertrag");
    await userEvent.type(drawer.getByLabelText("Adresse"), "https://example.com");
    await userEvent.click(drawer.getByRole("button", { name: "Nachweis hinzufügen" }));
    expect(await drawer.findByText(/konnte nicht gespeichert werden/)).toBeInTheDocument();

    await chooseKind(drawer.element, "Datei");

    expect(drawer.queryByText(/konnte nicht gespeichert werden/)).not.toBeInTheDocument();
  });

  it("show a stored address that isn't a web address as text, never as a link", async () => {
    server.use(
      http.get("/api/v1/tenants/:tenant/implementations/:id/evidence", () =>
        HttpResponse.json({
          items: [
            {
              id: "e1",
              implementation_id: "im-009",
              kind: "link",
              title: "Skript",
              url: "javascript:alert(1)",
              file: null,
              referenced_implementation_id: null,
              added_by_id: "u-kramer",
              added_at: "2026-10-01T10:00:00Z",
            },
            {
              id: "e2",
              implementation_id: "im-009",
              kind: "link",
              title: "Kaputt",
              url: "nicht eine adresse",
              file: null,
              referenced_implementation_id: null,
              added_by_id: "u-kramer",
              added_at: "2026-10-01T10:00:00Z",
            },
          ],
          page: { number: 1, limit: 25, total: 2 },
        }),
      ),
    );
    await openEvidence("req-k-13-3-1");

    const list = within(await evidenceList());
    expect(list.getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(list.getByText("nicht eine adresse")).toBeInTheDocument();
    expect(list.queryAllByRole("link")).toEqual([]);
  });
});
