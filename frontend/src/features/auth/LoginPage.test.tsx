import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { notAuthenticated, problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { sessionKey } from "@/shared/api/auth";
import { renderRoute } from "@/test/render";

const loginHeading = () => screen.findByRole("heading", { level: 1, name: "Anmelden" });

async function openUserMenu() {
  await userEvent.click(screen.getByRole("button", { name: "Benutzermenü" }));
}

describe("signing in", () => {
  beforeEach(() => {
    setMockSession(null);
  });

  it("sends a visitor without a session to the login page and back afterwards", async () => {
    const { router } = renderRoute("/t/muster-stadtwerke/risks?view=matrix");

    await loginHeading();
    expect(router.state.location.pathname).toBe("/login");

    await userEvent.click(screen.getByRole("button", { name: "Als GRC-Manager ansehen" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Risiken" })).toBeVisible();
    expect(router.state.location.search).toBe("?view=matrix");
  });

  it("opens the Demo Tenant's dashboard as an Auditor, marked read-only", async () => {
    const { router } = renderRoute("/login");

    await userEvent.click(await screen.findByRole("button", { name: "Als Auditor ansehen" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/t/muster-stadtwerke/dashboard");
    expect(screen.getByText(/^Nur Lese/)).toBeVisible();
  });

  it("never follows a return address outside the app", async () => {
    const { router } = renderRoute("/login?next=//evil.example/t/x");

    await userEvent.click(await screen.findByRole("button", { name: "Als GRC-Manager ansehen" }));

    await screen.findByRole("heading", { level: 1, name: "Übersicht" });
    expect(router.state.location.pathname).toBe("/t/muster-stadtwerke/dashboard");
  });

  it("asks for both fields before submitting", async () => {
    renderRoute("/login");
    await loginHeading();

    await userEvent.click(screen.getByRole("button", { name: "Mit E-Mail anmelden" }));

    // antd fades the messages in, so they are present before they are visible.
    expect(await screen.findByText("Bitte geben Sie Ihre E-Mail-Adresse ein.")).toBeInTheDocument();
    expect(screen.getByText("Bitte geben Sie Ihr Passwort ein.")).toBeInTheDocument();
  });

  it("explains a failed password login without saying which part was wrong", async () => {
    renderRoute("/login");
    await loginHeading();

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "alex.kramer@example.com");
    await userEvent.type(screen.getByLabelText("Passwort"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Mit E-Mail anmelden" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("E-Mail-Adresse oder Passwort ist nicht korrekt.");
  });
});

describe("a signed-in session", () => {
  it("shows the role and no read-only marker for a GRC Manager", async () => {
    renderRoute("/t/muster-stadtwerke/dashboard");
    await screen.findByRole("heading", { level: 1, name: "Übersicht" });

    expect(screen.queryByText(/^Nur Lese/)).not.toBeInTheDocument();
    await openUserMenu();
    expect(await screen.findByText("GRC-Manager")).toBeInTheDocument();
  });

  it("is read-only in a Tenant where the same user is an Auditor", async () => {
    renderRoute("/t/klinikum-beispielstadt/dashboard");

    await screen.findByRole("heading", { level: 1, name: "Übersicht" });
    expect(screen.getByText(/^Nur Lese/)).toBeVisible();
  });

  it("signs out, forgets everything cached and doesn't ask to come back", async () => {
    const { router, client } = renderRoute("/t/muster-stadtwerke/dashboard");
    await screen.findByRole("heading", { level: 1, name: "Übersicht" });
    client.setQueryData(["tenants", "muster-stadtwerke", "risks"], ["cached risk"]);

    await openUserMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Abmelden" }));

    await loginHeading();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("");
    expect(client.getQueryData(["tenants", "muster-stadtwerke", "risks"])).toBeUndefined();
    expect(client.getQueryData(sessionKey) ?? null).toBeNull();
  });

  it("treats a session that already expired as signed out", async () => {
    const { router } = renderRoute("/t/muster-stadtwerke/dashboard");
    await screen.findByRole("heading", { level: 1, name: "Übersicht" });
    setMockSession(null);
    server.use(http.post("/api/v1/auth/logout", () => notAuthenticated()));

    await openUserMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Abmelden" }));

    await loginHeading();
    expect(router.state.location.search).toBe("");
    expect(screen.queryByText(/Abmelden ist fehlgeschlagen/)).not.toBeInTheDocument();
  });

  it("starts the next user from nothing", async () => {
    setMockSession(null);
    const { client } = renderRoute("/login");
    await loginHeading();
    client.setQueryData(["tenants", "muster-stadtwerke", "risks"], ["previous user's risk"]);

    await userEvent.click(screen.getByRole("button", { name: "Als Auditor ansehen" }));

    await screen.findByRole("heading", { level: 1, name: "Übersicht" });
    expect(client.getQueryData(["tenants", "muster-stadtwerke", "risks"])).toBeUndefined();
    await openUserMenu();
    expect(await screen.findByText("Tobias Wolff")).toBeInTheDocument();
  });

  it("explains the read-only badge to keyboard users", async () => {
    renderRoute("/t/klinikum-beispielstadt/dashboard");
    await screen.findByRole("heading", { level: 1, name: "Übersicht" });

    await userEvent.tab();
    while (!document.activeElement?.textContent.startsWith("Nur Lese")) {
      await userEvent.tab();
    }

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "In diesem Mandanten können Sie als Auditor alles einsehen, aber nichts ändern.",
    );
  });

  it("lets public pages open the app directly", async () => {
    renderRoute("/");
    const header = within(await screen.findByRole("banner"));

    // Tests run without the mock build flag, so the wording is the real product's.
    expect(await header.findByRole("button", { name: "Zur Anwendung" })).toBeVisible();
  });

  it("lets public pages lead a visitor to the login page", async () => {
    setMockSession(null);
    const { router } = renderRoute("/");
    const header = within(await screen.findByRole("banner"));

    await userEvent.click(await header.findByRole("button", { name: "Anmelden" }));

    await loginHeading();
    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("when the server can't answer", () => {
  it("offers a retry if the session can't be loaded", async () => {
    server.use(
      http.get("/api/v1/me", () => problem(503, "service_unavailable", "Down."), { once: true }),
    );
    renderRoute("/t/muster-stadtwerke/dashboard");

    await userEvent.click(await screen.findByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
  });

  it("shows a general error for a field the form doesn't have", async () => {
    setMockSession(null);
    server.use(
      http.post("/api/v1/auth/login", () =>
        problem(422, "validation_error", "Invalid.", [
          { field: "non_field_errors", code: "invalid" },
        ]),
      ),
    );
    renderRoute("/login");
    await loginHeading();

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Passwort"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Mit E-Mail anmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Die Anmeldung ist fehlgeschlagen.");
  });

  it("words a server field error by its code", async () => {
    setMockSession(null);
    server.use(
      http.post("/api/v1/auth/login", () =>
        problem(422, "validation_error", "Invalid.", [{ field: "email", code: "invalid" }]),
      ),
    );
    renderRoute("/login");
    await loginHeading();

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Passwort"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Mit E-Mail anmelden" }));

    expect(
      await screen.findByText("Bitte geben Sie eine gültige E-Mail-Adresse ein."),
    ).toBeInTheDocument();
  });

  it("shows the server's field errors on their fields", async () => {
    setMockSession(null);
    server.use(
      http.post("/api/v1/auth/login", () =>
        problem(422, "validation_error", "Invalid.", [{ field: "email", code: "required" }]),
      ),
    );
    renderRoute("/login");
    await loginHeading();

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Passwort"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Mit E-Mail anmelden" }));

    expect(await screen.findByText("Bitte geben Sie Ihre E-Mail-Adresse ein.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when the demo login is unavailable", async () => {
    setMockSession(null);
    server.use(http.post("/api/v1/auth/demo-login", () => problem(404, "not_found", "Disabled.")));
    renderRoute("/login");

    await userEvent.click(await screen.findByRole("button", { name: "Als Auditor ansehen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Demo-Zugang ist gerade nicht verfügbar.",
    );
  });
});
