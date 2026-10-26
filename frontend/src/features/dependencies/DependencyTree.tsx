import { useTranslation } from "react-i18next";

import type { DependencyGraph } from "@/shared/api/types";

import { assetLabel, type OpenAsset, riskChip } from "./assetLabel";
import { asTree, type TreeEntry } from "./layout";

/**
 * The graph as nested lists, from the facility down to the suppliers. Nested lists carry
 * the levels to screen readers by themselves, and every entry opens the Asset's details.
 */
export function DependencyTree({
  graph,
  overlay,
  onOpen,
}: {
  graph: DependencyGraph;
  overlay: boolean;
  onOpen: OpenAsset;
}) {
  const { t } = useTranslation();

  return (
    <section className="grc-dependency-tree">
      <p className="grc-dependency-tree-root">
        <span className="grc-meta">{t("facilities.kinds.critical_facility")}</span>{" "}
        <strong>{graph.scope.name}</strong>
      </p>
      <Entries
        entries={asTree(graph)}
        label={t("dependencies.tree", { name: graph.scope.name })}
        overlay={overlay}
        onOpen={onOpen}
      />
    </section>
  );
}

function Entries({
  entries,
  label,
  overlay,
  onOpen,
}: {
  entries: TreeEntry[];
  label?: string;
  overlay: boolean;
  onOpen: OpenAsset;
}) {
  const { t } = useTranslation();

  return (
    <ul className="grc-plain-list grc-dependency-level" aria-label={label}>
      {entries.map(({ key, asset, repeated, children }) => {
        const category = asset.risks.highest?.category ?? "pending";
        return (
          <li key={key}>
            <button
              type="button"
              className="grc-dependency-entry"
              data-repeated={repeated}
              data-entry={key}
              aria-label={
                repeated
                  ? `${asset.name}, ${t("dependencies.repeated")}`
                  : assetLabel(t, asset, overlay)
              }
              onClick={() => {
                onOpen(asset, key);
              }}
            >
              <span className="grc-graph-node-name">{asset.name}</span>
              <span className="grc-meta">
                {repeated ? t("dependencies.repeated") : t(`facilities.assetKinds.${asset.kind}`)}
              </span>
              {!repeated && overlay && asset.risks.count > 0 && (
                <span className={`grc-risk-chip grc-risk-${category}`}>{riskChip(t, asset)}</span>
              )}
            </button>
            {children.length > 0 && (
              <Entries entries={children} overlay={overlay} onOpen={onOpen} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
