import "@/shared/ui/RiskChip/riskChip.css";
import "./dependencies.css";

import { useQuery } from "@tanstack/react-query";
import { Segmented, Switch } from "antd";
import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { dependencyGraphQuery, scopesQuery } from "@/shared/api/organization";
import type { GraphAsset } from "@/shared/api/types";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { AssetDetail } from "@/shared/ui/assets/AssetDetail";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { DependencyGraphView } from "./DependencyGraphView";
import { DependencyTree } from "./DependencyTree";

type View = "graph" | "list";

/**
 * What a Critical Facility relies on: its Assets and, across Scopes, their dependencies up
 * to the suppliers, with the facility's Risks on request. Wide screens show a graph and can
 * switch to the list; phones show the list, which says the same in nested entries. The
 * chosen facility and an open Asset are part of the URL, so the back gesture closes it.
 */
export function DependenciesPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const wide = useIsWideScreen();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const opened =
    (useLocation().state as { dependencies?: string } | null)?.dependencies === "asset";
  const [view, setView] = useState<View>("graph");
  const [overlay, setOverlay] = useState(false);
  const overlayId = useId();
  const scopes = combine([
    useQuery(scopesQuery(tenant, { kind: "critical_facility", limit: 100 })),
  ] as const);
  const facilities = scopes.data?.[0].items ?? [];
  const scope = facilities.find((item) => item.id === params.get("scope")) ?? facilities[0];
  const graph = combine([
    useQuery({ ...dependencyGraphQuery(tenant, scope?.id ?? ""), enabled: Boolean(scope) }),
  ] as const);
  const assetId = params.get("asset");
  const asset = graph.data?.[0].assets.find((item) => item.id === assetId);

  const set = useCallback(
    (change: Record<string, string | null>, push = false) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(change)) {
            if (value) {
              next.set(key, value);
            } else {
              next.delete(key);
            }
          }
          return next;
        },
        push ? { state: { dependencies: "asset" } } : { replace: true },
      );
    },
    [setParams],
  );
  const open = useCallback(
    (item: GraphAsset) => {
      set({ asset: item.id }, true);
    },
    [set],
  );

  return (
    <>
      <PageHeader title={t("nav.dependencies")} description={t("dependencies.description")} />
      <QueryContent
        query={scopes}
        rows={6}
        isEmpty={([page]) => page.items.length === 0}
        empty={t("dependencies.empty")}
      >
        {() => (
          <div className="grc-dependencies">
            <div className="grc-dependencies-controls">
              <Segmented
                name="dependencies-scope"
                aria-label={t("facilities.kinds.critical_facility")}
                value={scope?.id}
                options={facilities.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(value) => {
                  // The first facility is the default and stays out of the URL.
                  set({ scope: value === facilities[0]?.id ? null : (value ?? null), asset: null });
                }}
              />
              {wide && (
                <Segmented
                  name="dependencies-view"
                  aria-label={t("dependencies.view.label")}
                  value={view}
                  options={[
                    { value: "graph", label: t("dependencies.view.graph") },
                    { value: "list", label: t("dependencies.view.list") },
                  ]}
                  onChange={setView}
                />
              )}
              <span className="grc-dependencies-overlay">
                <Switch id={overlayId} checked={overlay} onChange={setOverlay} />
                <label htmlFor={overlayId}>{t("dependencies.overlay")}</label>
              </span>
            </div>
            {overlay && <p className="grc-meta">{t("dependencies.overlayHint")}</p>}
            <QueryContent query={graph} rows={8} isEmpty={() => false} empty="">
              {([data]) =>
                wide && view === "graph" ? (
                  <DependencyGraphView graph={data} overlay={overlay} onOpen={open} />
                ) : (
                  <DependencyTree graph={data} overlay={overlay} onOpen={open} />
                )
              }
            </QueryContent>
          </div>
        )}
      </QueryContent>
      {assetId && asset && (
        <AssetDetail
          tenant={tenant}
          scopeId={asset.scope_id}
          assetId={asset.id}
          onClose={() => {
            if (opened) {
              void navigate(-1);
            } else {
              set({ asset: null });
            }
          }}
        />
      )}
    </>
  );
}
