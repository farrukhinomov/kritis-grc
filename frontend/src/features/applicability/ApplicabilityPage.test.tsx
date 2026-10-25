import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { scopesQuery } from "@/shared/api/organization";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const TENANT = "wasserverband-musterland";
const PAGE = `/t/${TENANT}/applicability`;

async function openCheck() {
  const rendered = renderRoute(PAGE);
  await screen.findByRole("heading", { level: 1, name: "Betroffenheit" });
  return rendered;
}

const next = () => userEvent.click(screen.getByRole("button", { name: "Weiter" }));

/** Sector, Critical Service and the number of people supplied, as a user answers them. */
async function answer(people: string) {
  await userEvent.click(await screen.findByRole("radio", { name: /^Wasser/ }));
  await next();
  await userEvent.click(await screen.findByRole("radio", { name: /^Trinkwasserversorgung/ }));
  await next();
  await userEvent.type(await screen.findByLabelText("Anzahl versorgter Personen"), people);
  await userEvent.click(screen.getByRole("button", { name: "Prüfen" }));
}

const result = () => screen.findByRole("region", { name: /^Ergebnis/ });

describe("the Applicability Check", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("offers only the sectors it has thresholds for, and says why", async () => {
    await openCheck();

    expect(await screen.findByRole("radio", { name: /^Wasser/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /^Energie/ })).toBeDisabled();
    expect(screen.getByText(/nur für den Sektor Wasser hinterlegt/)).toBeInTheDocument();
  });

  it("explains a positive result with the legal citations", async () => {
    await openCheck();

    await answer("620000");

    const explained = within(await result());
    expect(
      explained.getByRole("heading", { name: /Voraussichtlich betroffen/ }),
    ).toBeInTheDocument();
    expect(explained.getByText(/Regelschwellenwert von 500\.000 Personen/)).toBeInTheDocument();
    expect(explained.getByText(/§\s5\sAbs\.\s2\sKRITIS-DachG/)).toBeInTheDocument();
    expect(explained.getByText(/§\s2\sNr\.\s3\sKRITIS-DachG/)).toBeInTheDocument();
    expect(explained.getByText(/Vorläufiges Ergebnis/)).toBeInTheDocument();
    expect(
      explained.getByText(/innerhalb von 3 Monaten .*§\s8\sAbs\.\s1\sKRITIS-DachG/),
    ).toBeInTheDocument();
  });

  it("explains a negative result and offers no Critical Facility", async () => {
    await openCheck();

    await answer("120000");

    const explained = within(await result());
    expect(
      explained.getByRole("heading", { name: /Voraussichtlich nicht betroffen/ }),
    ).toBeInTheDocument();
    expect(explained.getByText(/unter dem Regelschwellenwert/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Als kritische Anlage anlegen" }),
    ).not.toBeInTheDocument();
  });

  it("checks only a whole number of people", async () => {
    await openCheck();
    await userEvent.click(await screen.findByRole("radio", { name: /^Wasser/ }));
    await next();
    await userEvent.click(await screen.findByRole("radio", { name: /^Trinkwasserversorgung/ }));
    await next();

    expect(screen.getByRole("button", { name: "Prüfen" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Anzahl versorgter Personen"), "0");
    expect(screen.getByRole("button", { name: "Prüfen" })).toBeDisabled();
  });

  it("keeps the answers when going back a step", async () => {
    await openCheck();
    await userEvent.click(await screen.findByRole("radio", { name: /^Wasser/ }));
    await next();

    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(await screen.findByRole("radio", { name: /^Wasser/ })).toBeChecked();
  });

  it("creates a Critical Facility with a planned Registration and shows its projected deadlines", async () => {
    const { client } = await openCheck();
    const scopes = scopesQuery(TENANT);
    await client.query(scopes);
    await answer("620000");

    await userEvent.type(await screen.findByLabelText("Name der Anlage"), "Wasserwerk Ost");
    await userEvent.type(screen.getByLabelText("Standort"), "Musterland-Ost");
    await userEvent.click(screen.getByRole("button", { name: "Als kritische Anlage anlegen" }));

    const region = await screen.findByRole("region", { name: /Wasserwerk Ost angelegt/ });
    const created = within(region);
    // The form is gone; focus moved to what replaced it.
    expect(created.getByRole("heading", { name: /Wasserwerk Ost angelegt/ })).toHaveFocus();
    expect(created.getByText(/Geplante Registrierung/)).toBeInTheDocument();
    const deadlines = created.getAllByRole("listitem");
    expect(deadlines).toHaveLength(4);
    expect(deadlines[0]).toHaveTextContent(/§ 12 KRITIS-DachG/);
    expect(deadlines[0]).toHaveTextContent(/prognostiziert/);
    expect(created.getByText(/erst mit dem bestätigten Datum/)).toBeInTheDocument();
    // The dashboard and cockpit list the Scopes, so they must learn about the new one.
    await waitFor(() => {
      expect(client.getQueryState(scopes.queryKey)?.isInvalidated).toBe(true);
    });
  });

  it("asks for a name before creating the facility", async () => {
    await openCheck();
    await answer("620000");

    await userEvent.click(
      await screen.findByRole("button", { name: "Als kritische Anlage anlegen" }),
    );

    expect(await screen.findByText("Bitte geben Sie einen Namen an.")).toBeInTheDocument();
  });

  it("says so when the facility can't be saved", async () => {
    server.use(
      http.post("/api/v1/tenants/:tenant/scopes", () =>
        problem(503, "service_unavailable", "Down."),
      ),
    );
    await openCheck();
    await answer("620000");

    await userEvent.type(await screen.findByLabelText("Name der Anlage"), "Wasserwerk Ost");
    await userEvent.type(screen.getByLabelText("Standort"), "Musterland-Ost");
    await userEvent.click(screen.getByRole("button", { name: "Als kritische Anlage anlegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht angelegt werden/);
  });
});

describe("the Applicability Check on a phone", () => {
  it("says which step of four it is on instead of drawing all four", async () => {
    await openCheck();

    expect(await screen.findByText("Schritt 1 von 4: Sektor")).toBeInTheDocument();
  });
});

describe("the Applicability Check for an Auditor", () => {
  it("explains the result but doesn't create a facility", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    setMockSession("auditor");
    await openCheck();

    await answer("620000");

    await result();
    expect(
      screen.queryByRole("button", { name: "Als kritische Anlage anlegen" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Nur GRC-Manager können/)).toBeInTheDocument();
  });
});
