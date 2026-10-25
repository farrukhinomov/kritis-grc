import { screen, within } from "@testing-library/react";

import { renderRoute } from "@/test/render";

// Any page will do; it fails as a page can fail at runtime, in its own render.
vi.mock("@/features/roadmap/RoadmapPage", () => ({
  RoadmapPage: () => {
    throw new Error("page failed");
  },
}));

describe("a page that fails to render", () => {
  it("shows the error inside the shell, so the user can navigate away", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderRoute("/t/muster-stadtwerke/roadmap");

    expect(await screen.findByText("Dieser Bereich konnte nicht angezeigt werden.")).toBeVisible();
    const navigation = screen.getByRole("navigation", { name: "Hauptnavigation" });
    expect(within(navigation).getByRole("link", { name: "Übersicht" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  });
});
