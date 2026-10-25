import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { activityQuery } from "@/shared/api/activity";
import * as organizationApi from "@/shared/api/organization";
import { scopesQuery } from "@/shared/api/organization";
import { addMonths, localToday } from "@/shared/lib/dates";
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
      explained.getByText(
        /nach Inkrafttreten der Rechtsverordnung .*innerhalb von 3 Monaten .*§\s8\sAbs\.\s1\sKRITIS-DachG/,
      ),
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
    const activity = activityQuery(TENANT);
    await client.query(scopes);
    await client.infiniteQuery(activity);
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
    expect(client.getQueryState(activity.queryKey)?.isInvalidated).toBe(true);
    // A second facility from the same answers would be a duplicate; only a new check starts one.
    expect(screen.queryByRole("button", { name: "Angaben ändern" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Weitere Anlage prüfen" }));
    expect(await screen.findByRole("radio", { name: /^Wasser/ })).not.toBeChecked();
  });

  it("assumes a Registration three months from today, as a plan, not as a running period", async () => {
    await openCheck();
    await answer("620000");

    const date = await screen.findByLabelText("Angenommene Registrierung");
    expect(date).toHaveValue(addMonths(localToday(), 3));
    expect(
      screen.getByText(/beginnt erst, wenn die Anlage nach der Rechtsverordnung/),
    ).toBeInTheDocument();
  });

  it("refuses a Registration in the past", async () => {
    await openCheck();
    await answer("620000");
    await userEvent.type(await screen.findByLabelText("Name der Anlage"), "Wasserwerk Ost");
    await userEvent.type(screen.getByLabelText("Standort"), "Musterland-Ost");

    fireEvent.change(screen.getByLabelText("Angenommene Registrierung"), {
      target: { value: "2025-01-01" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Als kritische Anlage anlegen" }));

    expect(
      await screen.findByText("Das Datum darf nicht in der Vergangenheit liegen."),
    ).toBeInTheDocument();
  });

  it("shows the server's objections at their fields", async () => {
    server.use(
      http.post("/api/v1/tenants/:tenant/scopes", () =>
        problem(422, "validation_error", "Invalid.", [{ field: "name", code: "too_long" }]),
      ),
    );
    await openCheck();
    await answer("620000");
    await userEvent.type(await screen.findByLabelText("Name der Anlage"), "Wasserwerk Ost");
    await userEvent.type(screen.getByLabelText("Standort"), "Musterland-Ost");

    await userEvent.click(screen.getByRole("button", { name: "Als kritische Anlage anlegen" }));

    expect(await screen.findByText("Dieser Text ist zu lang.")).toBeInTheDocument();
  });

  it("retries a lost answer with the same key, and a changed facility with a new one", async () => {
    const keys: string[] = [];
    vi.spyOn(organizationApi, "createCriticalFacility").mockImplementation((_t, _f, key) => {
      keys.push(key);
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    await openCheck();
    await answer("620000");
    await userEvent.type(await screen.findByLabelText("Name der Anlage"), "Wasserwerk Ost");
    await userEvent.type(screen.getByLabelText("Standort"), "Musterland-Ost");
    const submit = () =>
      userEvent.click(screen.getByRole("button", { name: "Als kritische Anlage anlegen" }));

    await submit();
    await screen.findByRole("alert");
    await userEvent.type(screen.getByLabelText("Standort"), " ");
    await submit();
    await waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    await userEvent.type(screen.getByLabelText("Name der Anlage"), " Nord");
    await submit();

    await waitFor(() => {
      expect(keys).toHaveLength(3);
    });
    // Trailing spaces don't change what is sent, so the retry keeps its key.
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("moves focus to each new step, and to the verdict", async () => {
    await openCheck();
    await userEvent.click(await screen.findByRole("radio", { name: /^Wasser/ }));

    await next();

    expect(document.activeElement).toBe(
      screen.getByText("Welche kritische Dienstleistung erbringt die Anlage?"),
    );
    await userEvent.click(await screen.findByRole("radio", { name: /^Trinkwasserversorgung/ }));
    await next();
    await userEvent.type(screen.getByLabelText("Anzahl versorgter Personen"), "620000");
    await userEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Voraussichtlich betroffen" }),
      );
    });
  });

  it("says when the sectors can't be loaded, and offers a retry", async () => {
    server.use(
      http.get("/api/v1/tenants/:tenant/critical-services", () =>
        problem(503, "service_unavailable", "Down."),
      ),
    );
    await openCheck();

    expect(
      await screen.findByText("Dieser Bereich konnte nicht geladen werden."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
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
