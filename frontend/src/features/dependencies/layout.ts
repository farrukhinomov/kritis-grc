import type { DependencyGraph, GraphAsset } from "@/shared/api/types";

/** The facility's own node; Asset ids never take this form. */
export const FACILITY_NODE = "facility";

/** A node's horizontal and vertical slot; wide enough for a node and its Risk chip. */
export const COLUMN_PX = 270;
export const ROW_PX = 120;

export interface Placed {
  id: string;
  /** 0 is the facility, 1 the Assets it relies on directly, and so on to the suppliers. */
  layer: number;
  position: { x: number; y: number };
}

/**
 * Layers by the longest path from the facility, so every Asset sits below all that rely
 * on it and every arrow points the same way. Top-down, because a chain of seven layers
 * fits a screen's height far better than its width at a readable size. A cycle in the data would make
 * the path endless; a layer never grows beyond the number of Assets, which ends it.
 */
export function layOut(graph: DependencyGraph): Placed[] {
  const layer = new Map<string, number>(graph.roots.map((id) => [id, 1]));
  const byId = new Map(graph.assets.map((asset) => [asset.id, asset]));
  const limit = graph.assets.length;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, depth] of layer) {
      for (const next of byId.get(id)?.depends_on ?? []) {
        if (depth + 1 <= limit && (layer.get(next) ?? 0) < depth + 1) {
          layer.set(next, depth + 1);
          changed = true;
        }
      }
    }
  }
  const sorted = graph.assets
    .filter((asset) => layer.has(asset.id))
    .toSorted(
      (a, b) => (layer.get(a.id) ?? 0) - (layer.get(b.id) ?? 0) || a.name.localeCompare(b.name),
    );
  const widths = new Map<number, number>();
  for (const asset of sorted) {
    const depth = layer.get(asset.id) ?? 1;
    widths.set(depth, (widths.get(depth) ?? 0) + 1);
  }
  const slots = new Map<number, number>();
  // Each layer is centred under the facility.
  const placed = sorted.map((asset): Placed => {
    const depth = layer.get(asset.id) ?? 1;
    const slot = slots.get(depth) ?? 0;
    slots.set(depth, slot + 1);
    const x = (slot - ((widths.get(depth) ?? 1) - 1) / 2) * COLUMN_PX;
    return { id: asset.id, layer: depth, position: { x, y: depth * ROW_PX } };
  });
  return [{ id: FACILITY_NODE, layer: 0, position: { x: 0, y: 0 } }, ...placed];
}

export interface TreeEntry {
  /** The path from the facility, unique even where an Asset appears twice. */
  key: string;
  asset: GraphAsset;
  /** Shown in full further up; here it is only named, without its dependencies. */
  repeated: boolean;
  children: TreeEntry[];
}

/**
 * The graph as a tree for narrow screens: each Asset below what relies on it. An Asset
 * several others need is shown in full where it first appears and only named where it
 * appears again, or shared power and IT would repeat their whole chains on every branch.
 */
export function asTree(graph: DependencyGraph): TreeEntry[] {
  const byId = new Map(graph.assets.map((asset) => [asset.id, asset]));
  const shown = new Set<string>();
  const grow = (id: string, path: string[]): TreeEntry[] => {
    const asset = byId.get(id);
    if (!asset || path.includes(id)) {
      return [];
    }
    const here = [...path, id];
    const key = here.join("/");
    if (shown.has(id)) {
      return [{ key, asset, repeated: true, children: [] }];
    }
    shown.add(id);
    return [
      {
        key,
        asset,
        repeated: false,
        children: asset.depends_on
          .map((next) => byId.get(next))
          .filter((next) => next !== undefined)
          .toSorted((a, b) => a.name.localeCompare(b.name))
          .flatMap((next) => grow(next.id, here)),
      },
    ];
  };
  return graph.roots
    .map((id) => byId.get(id))
    .filter((asset) => asset !== undefined)
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .flatMap((asset) => grow(asset.id, []));
}
