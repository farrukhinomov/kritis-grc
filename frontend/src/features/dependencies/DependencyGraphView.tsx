import "@xyflow/react/dist/base.css";

import {
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { DependencyGraph, GraphAsset } from "@/shared/api/types";

import { assetLabel, type OpenAsset, riskChip } from "./assetLabel";
import { FACILITY_NODE, layOut } from "./layout";

interface AssetData extends Record<string, unknown> {
  asset: GraphAsset;
  overlay: boolean;
  onOpen: OpenAsset;
}

/** A node's slot, for centring it; the node's own width and a typical height. */
const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;

interface FacilityData extends Record<string, unknown> {
  name: string;
}

type AssetNode = Node<AssetData, "asset">;
type FacilityNode = Node<FacilityData, "facility">;

/** One Asset; the button is the node's only stop for the keyboard and opens its details. */
function AssetNodeView({ data, positionAbsoluteX, positionAbsoluteY }: NodeProps<AssetNode>) {
  const { t } = useTranslation();
  const { asset, overlay } = data;
  const category = overlay ? asset.risks.highest?.category : undefined;
  const flow = useReactFlow();
  const reducedMotion = useReducedMotion() ?? false;
  const entry = `graph:${asset.id}`;

  // Tab may reach a node that panning or zooming moved out of view; the graph follows it.
  const reveal = (button: HTMLElement) => {
    const pane = button.closest(".react-flow")?.getBoundingClientRect();
    const own = button.getBoundingClientRect();
    if (
      pane &&
      (own.left < pane.left ||
        own.right > pane.right ||
        own.top < pane.top ||
        own.bottom > pane.bottom)
    ) {
      void flow.setCenter(positionAbsoluteX + NODE_WIDTH / 2, positionAbsoluteY + NODE_HEIGHT / 2, {
        zoom: flow.getZoom(),
        duration: reducedMotion ? 0 : 200,
      });
    }
  };

  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <button
        type="button"
        // A press on the button opens the Asset; it must not start panning the graph.
        className="grc-graph-node nopan nodrag"
        data-kind={asset.kind}
        data-risk={category ?? (overlay && asset.risks.count > 0 ? "pending" : undefined)}
        data-entry={entry}
        aria-label={assetLabel(t, asset, overlay)}
        onFocus={(event) => {
          reveal(event.currentTarget);
        }}
        onClick={() => {
          data.onOpen(asset, entry);
        }}
      >
        <span className="grc-graph-node-name">{asset.name}</span>
        <span className="grc-meta">{t(`facilities.assetKinds.${asset.kind}`)}</span>
        {overlay && asset.risks.count > 0 && (
          <span className={`grc-risk-chip grc-risk-${category ?? "pending"}`}>
            {riskChip(t, asset)}
          </span>
        )}
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function FacilityNodeView({ data }: NodeProps<FacilityNode>) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grc-graph-node grc-graph-facility">
        <span className="grc-meta">{t("facilities.kinds.critical_facility")}</span>
        <span className="grc-graph-node-name">{data.name}</span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

const NODE_TYPES = { asset: AssetNodeView, facility: FacilityNodeView };

/**
 * The facility at the top, then what it relies on, layer by layer, down to the suppliers;
 * an arrow reads "depends on". The graph only shows: nothing can be dragged,
 * connected or deleted, as the Assets are maintained elsewhere.
 */
export function DependencyGraphView({
  graph,
  overlay,
  onOpen,
}: {
  graph: DependencyGraph;
  overlay: boolean;
  onOpen: OpenAsset;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion() ?? false;

  const { nodes, edges } = useMemo(() => {
    const placed = layOut(graph);
    const byId = new Map(graph.assets.map((asset) => [asset.id, asset]));
    const nodes: (AssetNode | FacilityNode)[] = placed.map((item) => {
      const asset = byId.get(item.id);
      // The graph library's own focus and selection would add a second stop per node and
      // English instructions; the button inside is the stop, and it names itself.
      const shared = {
        id: item.id,
        position: item.position,
        focusable: false,
        domAttributes: { "aria-roledescription": undefined },
      };
      return asset
        ? // Without handlers of its own the library lets clicks through the node; the
          // button inside must receive them.
          {
            ...shared,
            type: "asset",
            style: { pointerEvents: "all" },
            data: { asset, overlay, onOpen },
          }
        : { ...shared, type: "facility", data: { name: graph.scope.name } };
    });
    // Drawn by the library with an inline color, which only a value of the Theme's beats.
    const arrow = {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: "var(--grc-text-secondary)",
    };
    const edges: Edge[] = [
      ...graph.roots.map((id) => ({
        id: `${FACILITY_NODE}-${id}`,
        source: FACILITY_NODE,
        target: id,
      })),
      ...graph.assets.flatMap((asset) =>
        asset.depends_on.map((id) => ({ id: `${asset.id}-${id}`, source: asset.id, target: id })),
      ),
      // The nodes' names and the list view say what the arrows show; read one by one with
      // internal ids, they would only be noise.
    ].map((edge) => ({
      ...edge,
      markerEnd: arrow,
      focusable: false,
      domAttributes: { "aria-hidden": true, "aria-roledescription": undefined },
    }));
    return { nodes, edges };
  }, [graph, overlay, onOpen]);

  return (
    <section className="grc-graph" aria-label={t("dependencies.graph", { name: graph.scope.name })}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1, duration: reducedMotion ? 0 : 200 }}
        minZoom={0.3}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        disableKeyboardA11y
        proOptions={{ hideAttribution: true }}
        ariaLabelConfig={{
          "controls.ariaLabel": t("dependencies.controls.label"),
          "controls.zoomIn.ariaLabel": t("dependencies.controls.zoomIn"),
          "controls.zoomOut.ariaLabel": t("dependencies.controls.zoomOut"),
          "controls.fitView.ariaLabel": t("dependencies.controls.fitView"),
          // Instructions for moving and selecting nodes, which can't be done here.
          "node.a11yDescription.default": "",
          "node.a11yDescription.keyboardDisabled": "",
          "edge.a11yDescription.default": "",
        }}
      >
        <Controls showInteractive={false} fitViewOptions={{ duration: reducedMotion ? 0 : 200 }} />
      </ReactFlow>
    </section>
  );
}
