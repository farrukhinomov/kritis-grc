import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { ImprintPage, PrivacyPage } from "./LegalPage";
import { operator } from "./operator";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure() {
  vi.stubEnv("VITE_LEGAL_OPERATOR_NAME", "Muster GmbH");
  vi.stubEnv("VITE_LEGAL_OPERATOR_ADDRESS", "Musterstraße 1 | 66111 Saarbrücken");
  vi.stubEnv("VITE_LEGAL_OPERATOR_EMAIL", "kontakt@example.com");
}

describe("the legal pages", () => {
  it("say plainly when the operator is not configured, instead of showing invented data", () => {
    render(<ImprintPage />, { wrapper: MemoryRouter });

    expect(screen.getByRole("heading", { level: 1, name: "Impressum" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("noch nicht hinterlegt");
    expect(operator()).toBeNull();
  });

  it("name the operator with address lines and a mail link once configured", () => {
    configure();

    render(<ImprintPage />, { wrapper: MemoryRouter });

    expect(screen.getByText(/Muster GmbH/)).toHaveTextContent("66111 Saarbrücken");
    expect(screen.getByRole("link", { name: "kontakt@example.com" })).toHaveAttribute(
      "href",
      "mailto:kontakt@example.com",
    );
  });

  it("explain cookies, logs, the demo reset and the user's rights", () => {
    configure();

    render(<PrivacyPage />, { wrapper: MemoryRouter });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Verantwortlicher",
      "Welche Daten wir verarbeiten",
      "Cookies",
      "Server-Protokolle",
      "Demo-Zugang",
      "Hosting",
      "Ihre Rechte",
    ]);
    expect(screen.getByText(/§ 25 Abs. 2 Nr. 2 TDDDG/)).toBeInTheDocument();
    expect(screen.getByText(/jede Nacht vollständig zurückgesetzt/)).toBeInTheDocument();
  });
});
