import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider } from "antd";
import { useState } from "react";

import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";

import { ColumnDrillDown, type DrillColumn } from "./ColumnDrillDown";
import { ErrorBoundary } from "./ErrorBoundary";
import { ResponsiveDrawer } from "./ResponsiveDrawer";
import { ResponsiveTable, type RowAction } from "./ResponsiveTable";
import { snapSheetHeight } from "./sheetSnap";
import { settlesOpen } from "./swipe";
import { CardListSkeleton, ColumnsSkeleton, PageSkeleton, TableSkeleton } from "./Skeletons";

interface Asset {
  id: string;
  name: string;
}

const ASSETS: Asset[] = [
  { id: "a1", name: "Leitstelle Nord" },
  { id: "a2", name: "Pumpwerk Süd" },
];

function renderTable(onDelete = vi.fn(), loading = false) {
  const actions = (asset: Asset): RowAction[] => [
    {
      key: "delete",
      label: "Löschen",
      icon: "trash",
      danger: true,
      onSelect: () => {
        onDelete(asset.id);
      },
    },
  ];
  render(
    <ResponsiveTable<Asset>
      label="Assets"
      rows={ASSETS}
      rowKey={(asset) => asset.id}
      columns={[{ key: "name", title: "Name", dataIndex: "name" }]}
      renderCard={(asset) => <strong>{asset.name}</strong>}
      actions={actions}
      loading={loading}
    />,
  );
  return onDelete;
}

describe("ResponsiveTable", () => {
  it("is a table with an actions menu per row on wide screens", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    const onDelete = renderTable();

    const table = within(screen.getByRole("region", { name: "Assets" }));
    expect(table.getAllByRole("row")).toHaveLength(ASSETS.length + 1);

    await userEvent.click(table.getAllByRole("button", { name: "Aktionen" })[1]!);
    await userEvent.click(await screen.findByRole("menuitem", { name: /Löschen/ }));

    expect(onDelete).toHaveBeenCalledWith("a2");
  });

  it("is a card list on phones, with every action reachable without swiping", async () => {
    const onDelete = renderTable();

    const list = screen.getByRole("list", { name: "Assets" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(ASSETS.length);
    expect(within(list).getByText("Leitstelle Nord")).toBeVisible();

    await userEvent.click(within(list).getAllByRole("button", { name: "Aktionen" })[0]!);
    await userEvent.click(await screen.findByRole("menuitem", { name: /Löschen/ }));

    expect(onDelete).toHaveBeenCalledWith("a1");
  });

  it("keeps the swipe-revealed buttons out of the tab order while the card is closed", () => {
    renderTable();

    const hiddenAction = screen.getAllByText("Löschen")[0]!.closest(".grc-swipe-actions");
    expect(hiddenAction).toHaveAttribute("inert");
  });

  it("shows a skeleton shaped like the layout while loading", () => {
    renderTable(vi.fn(), true);

    expect(screen.getByRole("status")).toHaveTextContent("Wird geladen");
    expect(screen.queryByText("Leitstelle Nord")).not.toBeInTheDocument();
  });
});

const COLUMNS: DrillColumn[] = [
  { key: "p", title: "§ 13 Resilienzmaßnahmen", content: "Paragraf" },
  { key: "r", title: "Notfallvorsorge", content: "Anforderung" },
];

describe("ColumnDrillDown", () => {
  it("shows every open level side by side on wide screens", () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    render(<ColumnDrillDown label="Cockpit" columns={COLUMNS} onBack={vi.fn()} />);

    const group = within(screen.getByRole("group", { name: "Cockpit" }));
    expect(group.getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(group.getByRole("region", { name: "Notfallvorsorge" })).toBeVisible();
    expect(group.queryByRole("button", { name: "Zurück" })).not.toBeInTheDocument();
  });

  it("holds the place of a level that isn't open, and swaps content in its place", () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    const open: DrillColumn = { key: "a", slot: "second", title: "Zweite", content: "Inhalt A" };
    const held: DrillColumn = { ...open, key: "none", placeholder: true, content: "Wählen Sie" };
    const { rerender } = render(
      <ColumnDrillDown label="Cockpit" columns={[COLUMNS[0]!, held]} onBack={vi.fn()} />,
    );
    const column = screen.getByRole("heading", { name: "Zweite" }).closest("section");

    rerender(<ColumnDrillDown label="Cockpit" columns={[COLUMNS[0]!, open]} onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Zweite" }).closest("section")).toBe(column);
    expect(screen.getByText("Inhalt A")).toBeInTheDocument();
    expect(screen.queryByText("Wählen Sie")).not.toBeInTheDocument();
  });

  it("shows no held places on phones, one level at a time", () => {
    const held: DrillColumn = { key: "none", placeholder: true, title: "Leer", content: "Hinweis" };
    render(<ColumnDrillDown label="Cockpit" columns={[COLUMNS[0]!, held]} onBack={vi.fn()} />);

    expect(screen.queryByText("Hinweis")).not.toBeInTheDocument();
  });

  it("stacks the levels on phones and goes back one level at a time", async () => {
    function Harness() {
      const [columns, setColumns] = useState(COLUMNS);
      return (
        <ColumnDrillDown
          label="Cockpit"
          columns={columns}
          onBack={() => {
            setColumns((open) => open.slice(0, -1));
          }}
        />
      );
    }
    render(<Harness />);

    expect(screen.getByRole("heading", { level: 2, name: "Notfallvorsorge" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "§ 13 Resilienzmaßnahmen" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    const outermost = await screen.findByRole("region", { name: "§ 13 Resilienzmaßnahmen" });
    expect(within(outermost).getByRole("heading", { level: 2 })).toHaveFocus();
    // The previous level may still be animating out; only the new one counts.
    expect(within(outermost).queryByRole("button", { name: "Zurück" })).not.toBeInTheDocument();
  });
});

describe("ColumnDrillDown without user action", () => {
  it("leaves focus alone when levels appear by themselves, e.g. a deep link loading", () => {
    const { rerender } = render(
      <ColumnDrillDown label="Cockpit" columns={COLUMNS.slice(0, 1)} onBack={vi.fn()} />,
    );

    rerender(<ColumnDrillDown label="Cockpit" columns={COLUMNS} onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Notfallvorsorge" })).not.toHaveFocus();
  });
});

describe("ResponsiveDrawer", () => {
  function renderDrawer() {
    render(
      <ResponsiveDrawer open onClose={vi.fn()} title="Umsetzung">
        Inhalt
      </ResponsiveDrawer>,
    );
  }

  it("is a side drawer without sheet controls on wide screens", async () => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
    renderDrawer();

    expect(await screen.findByText("Inhalt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /volle Höhe/ })).not.toBeInTheDocument();
  });

  it("is a bottom sheet on phones that can be expanded without dragging", async () => {
    renderDrawer();

    await userEvent.click(await screen.findByRole("button", { name: "Auf volle Höhe vergrößern" }));

    expect(screen.getByRole("button", { name: "Auf halbe Höhe verkleinern" })).toBeVisible();
  });
});

describe("snapSheetHeight", () => {
  const VIEWPORT = 800;

  it.each([
    { height: 700, expected: "full" },
    { height: 560, expected: "full" },
    { height: 400, expected: "half" },
    { height: 200, expected: "half" },
    { height: 120, expected: "closed" },
  ])("settles a sheet let go at $height px on $expected", ({ height, expected }) => {
    expect(snapSheetHeight(height, VIEWPORT)).toBe(expected);
  });
});

describe("settlesOpen", () => {
  const REVEALED = 160;

  it.each([
    { position: -100, velocity: 0, expected: true, scenario: "dragged past half" },
    { position: -60, velocity: 0, expected: false, scenario: "dragged less than half" },
    { position: -20, velocity: -900, expected: true, scenario: "flicked open" },
    { position: -150, velocity: 900, expected: false, scenario: "flicked closed" },
  ])("$scenario settles open: $expected", ({ position, velocity, expected }) => {
    expect(settlesOpen(position, velocity, REVEALED)).toBe(expected);
  });
});

describe("ErrorBoundary", () => {
  it("contains a failure to its area and recovers on retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let broken = true;
    function Widget() {
      if (broken) {
        throw new Error("widget failed");
      }
      return <p>Widget</p>;
    }
    render(
      <ConfigProvider>
        <p>Nachbar</p>
        <ErrorBoundary>
          <Widget />
        </ErrorBoundary>
      </ConfigProvider>,
    );

    expect(screen.getByText("Dieser Bereich konnte nicht angezeigt werden.")).toBeVisible();
    expect(screen.getByText("Nachbar")).toBeVisible();

    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(screen.getByText("Widget")).toBeVisible();
  });
});

describe("skeletons", () => {
  it.each([
    { name: "page", element: <PageSkeleton /> },
    { name: "table", element: <TableSkeleton rows={3} columns={4} /> },
    { name: "card list", element: <CardListSkeleton cards={2} /> },
    { name: "columns", element: <ColumnsSkeleton columns={3} /> },
  ])("announces the $name skeleton once as loading", ({ element }) => {
    render(element);

    expect(screen.getByRole("status")).toHaveAccessibleName("");
    expect(screen.getByRole("status")).toHaveTextContent("Wird geladen …");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
