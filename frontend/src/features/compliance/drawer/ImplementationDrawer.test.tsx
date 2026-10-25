import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setMockSession } from "@/mocks/accounts";
import { setSimulation } from "@/mocks/simulation";
import { risksQuery } from "@/shared/api/risk";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PLACE = "/t/muster-stadtwerke/compliance?paragraph=§ 13&requirement=req-k-13-1";

async function openDrawer(search = PLACE) {
  const rendered = renderRoute(search);
  await userEvent.click(await screen.findByRole("button", { name: "Umsetzung bearbeiten" }));
  return { ...rendered, drawer: within(await screen.findByRole("dialog")) };
}

const statusRadio = (name: string) => screen.getByRole("radio", { name });

describe("changing the status", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("opens from the cockpit and keeps the open drawer in the URL", async () => {
    const { router, drawer } = await openDrawer();

    expect(drawer.getByText(/§ 13 Abs. 1/)).toBeInTheDocument();
    expect(statusRadio("Teilweise umgesetzt")).toBeChecked();
    expect(new URLSearchParams(router.state.location.search).get("panel")).toBe("status");
  });

  it("shows the new status at once and keeps it once saved", async () => {
    setSimulation({ latency: "short" });
    const { drawer } = await openDrawer();

    await userEvent.click(statusRadio("Umgesetzt"));

    // Before the server has answered, the cockpit already shows the change.
    expect(statusRadio("Umgesetzt")).toBeChecked();
    const requirement = screen.getByRole("button", { name: /^§ 13 Abs. 1 / });
    expect(requirement).toHaveTextContent("Umgesetzt");
    expect(await drawer.findByText("Gespeichert.")).toBeInTheDocument();
    expect(statusRadio("Umgesetzt")).toBeChecked();
  });

  it("refreshes the risks, whose Residual Rating follows the status", async () => {
    const { client, drawer } = await openDrawer();
    await client.query(risksQuery("muster-stadtwerke"));

    await userEvent.click(statusRadio("Umgesetzt"));
    await drawer.findByText("Gespeichert.");

    expect(client.getQueryState(risksQuery("muster-stadtwerke").queryKey)?.isInvalidated).toBe(
      true,
    );
  });

  it("explains a conflict and visibly returns to the saved status", async () => {
    const { drawer } = await openDrawer();
    // Slow answers, so the rollback can be seen before the reload after it arrives.
    setSimulation({ conflictOnNextWrite: true, latency: "long" });

    await userEvent.click(statusRadio("Umgesetzt"));

    // antd's id helper returns a fixed id under test, so two open dialogs share one label
    // and the conflict dialog is found by its title text instead of its accessible name.
    const title = await screen.findByText("Änderung nicht gespeichert");
    const dialog = title.closest<HTMLElement>('[role="dialog"]')!;
    expect(dialog).toHaveTextContent("zwischenzeitlich geändert");
    expect(statusRadio("Teilweise umgesetzt")).toBeChecked();
    expect(drawer.getByText("Ihre Änderung wurde zurückgenommen.")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Aktuelle Fassung ansehen" }));
    // jsdom never finishes antd's closing animation, so "closing" is as far as it gets.
    await waitFor(() => {
      expect(title.closest(".ant-modal-root")?.querySelector(".ant-modal-mask")).toHaveClass(
        "ant-fade-leave",
      );
    });
  });

  it("is read-only for an Auditor", async () => {
    setMockSession("auditor");
    renderRoute(PLACE);

    await userEvent.click(await screen.findByRole("button", { name: "Umsetzung ansehen" }));
    const drawer = within(await screen.findByRole("dialog"));

    for (const radio of drawer.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    expect(drawer.getByText(/Als Auditor können Sie den Status nicht ändern/)).toBeInTheDocument();
  });
});

describe("the drawer on a phone", () => {
  it("is a bottom sheet that the back gesture closes", async () => {
    const { router } = await openDrawer();
    expect(screen.getByRole("button", { name: "Auf volle Höhe vergrößern" })).toBeInTheDocument();

    await router.navigate(-1);

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("panel")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

describe("closing the drawer", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("stays in the cockpit after a link opened it and a tab was switched", async () => {
    const { router } = renderRoute("/t/muster-stadtwerke/dashboard");
    await screen.findByRole("heading", { level: 1, name: "Übersicht" });
    await router.navigate(`${PLACE}&panel=status`);
    await userEvent.click(await screen.findByRole("tab", { name: "Verlauf" }));

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("panel")).toBeNull();
    });
    expect(router.state.location.pathname).toBe("/t/muster-stadtwerke/compliance");
  });

  it("returns focus to the button that opened it", async () => {
    await openDrawer();

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Umsetzung bearbeiten" })).toHaveFocus();
    });
  });
});
