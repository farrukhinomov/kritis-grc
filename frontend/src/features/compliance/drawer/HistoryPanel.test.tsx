import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const COCKPIT = "/t/muster-stadtwerke/compliance?scope=sc-nord";

beforeEach(() => {
  matchMediaQueries(WIDE_SCREEN_QUERY);
});

describe("the history of an Implementation", () => {
  it("shows who changed which field from what to what", async () => {
    renderRoute(`${COCKPIT}&paragraph=§ 12&requirement=req-k-12-1&panel=history`);

    const history = within(await screen.findByRole("list", { name: "Verlauf" }));
    const [entry] = await history.findAllByRole("listitem");
    expect(entry).toHaveTextContent("Jana Becker");
    expect(entry).toHaveTextContent("Status: Offen → Teilweise umgesetzt");
    expect(entry).toHaveTextContent("Verantwortlich: Alex Kramer → Jana Becker");
  });

  it("includes a change made in the drawer", async () => {
    renderRoute(`${COCKPIT}&paragraph=§ 13&requirement=req-k-13-1&panel=status`);
    await userEvent.click(await screen.findByRole("radio", { name: "Umgesetzt" }));
    await screen.findByText("Gespeichert.");

    await userEvent.click(screen.getByRole("tab", { name: "Verlauf" }));

    const history = within(await screen.findByRole("list", { name: "Verlauf" }));
    expect(await history.findByText("Status: Teilweise umgesetzt → Umgesetzt")).toBeInTheDocument();
    expect(history.getAllByRole("listitem")[0]).toHaveTextContent("Alex Kramer");
  });

  it("says when nothing has changed yet", async () => {
    renderRoute(`${COCKPIT}&paragraph=§ 13&requirement=req-k-13-3-6&panel=history`);

    expect(await screen.findByText("Noch keine Änderungen.")).toBeInTheDocument();
  });
});
