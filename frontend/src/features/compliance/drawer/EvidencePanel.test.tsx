import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setMockSession } from "@/mocks/accounts";
import { server } from "@/mocks/server";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const MB = 1024 * 1024;
const place = (requirement: string, scope = "sc-nord") =>
  `/t/muster-stadtwerke/compliance?scope=${scope}&paragraph=§ 13&requirement=${requirement}&panel=evidence`;

async function openEvidence(requirement: string) {
  renderRoute(place(requirement));
  const element = await screen.findByRole("dialog");
  const drawer = within(element);
  await drawer.findByRole("tab", { name: "Nachweise", selected: true });
  return Object.assign(drawer, { element });
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
    const file = new File([new Uint8Array(3 * 1024)], "pruefbericht.pdf", {
      type: "application/pdf",
    });

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
