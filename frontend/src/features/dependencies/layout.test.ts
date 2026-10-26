import type { DependencyGraph, GraphAsset } from "@/shared/api/types";

import { asTree, COLUMN_PX, FACILITY_NODE, layOut, ROW_PX } from "./layout";

const asset = (id: string, depends_on: string[] = []): GraphAsset => ({
  id,
  scope_id: "sc-1",
  scope_name: "Anlage",
  name: id.toUpperCase(),
  kind: "technical_system",
  criticality: "high",
  depends_on,
  description: "",
  risks: { count: 0, highest: null },
});

const graph = (assets: GraphAsset[], roots: string[]): DependencyGraph => ({
  scope: { id: "sc-1", name: "Anlage" },
  roots,
  assets,
});

describe("the layout", () => {
  it("puts every Asset below all that rely on it", () => {
    // a relies on b and c; b relies on c. c must be below b, not beside it.
    const placed = layOut(graph([asset("a", ["b", "c"]), asset("b", ["c"]), asset("c")], ["a"]));

    const layer = Object.fromEntries(placed.map((item) => [item.id, item.layer]));
    expect(layer).toEqual({ [FACILITY_NODE]: 0, a: 1, b: 2, c: 3 });
    // Top-down: each layer one row lower; one Asset per layer sits in the middle.
    expect(placed.find((item) => item.id === "c")?.position).toEqual({ x: 0, y: 3 * ROW_PX });
  });

  it("sets the Assets of one layer side by side, by name", () => {
    const placed = layOut(graph([asset("z"), asset("y")], ["z", "y"]));

    const layer = placed.filter((item) => item.layer === 1);
    expect(layer.map((item) => item.id)).toEqual(["y", "z"]);
    // Centred under the facility, side by side.
    expect(layer.map((item) => item.position.x)).toEqual([-COLUMN_PX / 2, COLUMN_PX / 2]);
  });

  it("ends on a cycle", () => {
    const placed = layOut(graph([asset("a", ["b"]), asset("b", ["a"])], ["a"]));

    expect(placed.map((item) => item.id).toSorted()).toEqual(["a", "b", FACILITY_NODE]);
  });
});

describe("the tree", () => {
  it("shows a shared Asset in full once, and refers to it where it appears again", () => {
    const tree = asTree(
      graph([asset("a", ["c"]), asset("b", ["c"]), asset("c", ["d"]), asset("d")], ["a", "b"]),
    );

    const [first, second] = tree.map((entry) => entry.children[0]!);
    expect(first).toMatchObject({ key: "a/c", repeated: false });
    expect(first?.children.map((child) => child.key)).toEqual(["a/c/d"]);
    expect(second).toMatchObject({ key: "b/c", repeated: true, children: [] });
  });

  it("stops a cycle where it would return to the path", () => {
    const tree = asTree(graph([asset("a", ["b"]), asset("b", ["a"])], ["a"]));

    expect(tree[0]?.children[0]?.children).toEqual([]);
  });
});
