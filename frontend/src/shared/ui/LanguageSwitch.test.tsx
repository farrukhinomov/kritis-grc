import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderRoute } from "@/test/render";

describe("LanguageSwitch", () => {
  it("switches the interface and the document language to English", async () => {
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Systemstatus" })).toBeInTheDocument();

    await userEvent.click(screen.getByText("EN"));

    expect(await screen.findByRole("heading", { name: "System status" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("grc.language")).toBe("en");
  });
});

describe("LanguageSwitch when English can't be loaded", () => {
  it("says so and stays in German", async () => {
    const i18nModule = await import("@/shared/i18n");
    vi.spyOn(i18nModule, "selectLanguage").mockResolvedValue(false);
    renderRoute("/");
    await screen.findByRole("heading", { name: "Systemstatus" });

    await userEvent.click(screen.getByText("EN"));

    expect(
      await screen.findByText(
        "Englisch konnte gerade nicht geladen werden. Bitte versuchen Sie es erneut.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Systemstatus" })).toBeInTheDocument();
  });
});
