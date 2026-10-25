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
