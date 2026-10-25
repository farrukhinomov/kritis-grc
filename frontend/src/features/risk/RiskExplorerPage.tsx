import "@/shared/ui/RiskChip/riskChip.css";
import "./risk.css";

import { useQuery } from "@tanstack/react-query";
import { Button, Segmented, Select } from "antd";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { scopesQuery } from "@/shared/api/organization";
import { risksQuery } from "@/shared/api/risk";
import type { RatingKind } from "@/shared/api/types";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { RISK_CATEGORIES } from "@/shared/theme/semantic";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { ResponsiveDrawer } from "@/shared/ui/patterns/ResponsiveDrawer";

import { ExplorerMatrix } from "./ExplorerMatrix";
import { RatingChip } from "./RatingChip";
import { RiskDetail } from "./RiskDetail";
import { RiskTable } from "./RiskTable";
import { type CategoryFilter, type Cell, useExplorerPlace } from "./useExplorerPlace";

const RATINGS: readonly RatingKind[] = ["inherent", "residual", "target"];
const ALL = "all";

/**
 * How the measures change the risk picture: a matrix of the chosen rating and the risks
 * behind it. On wide screens a cell narrows the table; on phones, where the table is a
 * long list, a cell opens its risks in a sheet.
 */
export function RiskExplorerPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const wide = useIsWideScreen();
  const place = useExplorerPlace();
  const scopes = useQuery(scopesQuery(tenant, { limit: 100 })).data?.items ?? [];

  // The detail and the sheet go away with their URL parameter, whether closed by a button
  // or by the back gesture, and take the focused element with them. Focus returns to what
  // opened them, so keyboard and screen reader users continue where they were.
  const cellKey = place.cell
    ? `${String(place.cell.likelihood)}-${String(place.cell.impact)}`
    : null;
  const shown = useRef({ risk: place.risk, cell: cellKey });
  useEffect(() => {
    const before = shown.current;
    shown.current = { risk: place.risk, cell: cellKey };
    if (before.risk && !place.risk) {
      focusMarked("risk", before.risk);
    } else if (before.cell && !cellKey) {
      focusMarked("cell", before.cell);
    }
  }, [place.risk, cellKey]);

  return (
    <>
      <PageHeader title={t("nav.risks")} description={t("risk.description")} />
      <div className="grc-explorer-filters">
        <Segmented<RatingKind>
          name="risk-rating"
          value={place.rating}
          onChange={place.setRating}
          options={RATINGS.map((rating) => ({ value: rating, label: t(`risk.ratings.${rating}`) }))}
        />
        <Select
          aria-label={t("compliance.scope")}
          className="grc-explorer-select"
          value={place.scope ?? ALL}
          options={[
            { value: ALL, label: t("risk.filters.allScopes") },
            ...scopes.map((scope) => ({ value: scope.id, label: scope.name })),
          ]}
          onChange={(value: string) => {
            place.setScope(value === ALL ? null : value);
          }}
        />
        <Select
          aria-label={t("risk.filters.category")}
          className="grc-explorer-select"
          value={place.category ?? ALL}
          options={[
            { value: ALL, label: t("risk.filters.allCategories") },
            ...RISK_CATEGORIES.map((category) => ({
              value: category,
              label: t(`dashboard.riskCategories.${category}`),
            })),
            ...(place.rating === "residual"
              ? [{ value: "pending", label: t("dashboard.risks.calculationPending") }]
              : []),
          ]}
          onChange={(value: string) => {
            place.setCategory(value === ALL ? null : (value as CategoryFilter));
          }}
        />
      </div>
      <div className="grc-explorer">
        <section
          aria-label={t("risk.matrix.title")}
          className="grc-explorer-panel grc-explorer-matrix-panel"
        >
          <ExplorerMatrix
            tenant={tenant}
            rating={place.rating}
            scope={place.scope}
            selected={place.cell}
            onSelect={(cell) => {
              if (wide || !cell) {
                place.setCell(cell);
              } else {
                place.openCellSheet(cell);
              }
            }}
          />
        </section>
        {wide && (
          <div className="grc-explorer-panel">
            {place.cell && (
              <p className="grc-explorer-cell-filter">
                {t("risk.filters.cell", {
                  likelihood: place.cell.likelihood,
                  impact: place.cell.impact,
                })}{" "}
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    place.setCell(null);
                  }}
                >
                  {t("risk.filters.clearCell")}
                </Button>
              </p>
            )}
            <RiskTable
              tenant={tenant}
              rating={place.rating}
              scope={place.scope}
              category={place.category}
              cell={place.cell}
              page={place.page}
              onPage={place.setPage}
              onOpen={place.openRisk}
            />
          </div>
        )}
        {!wide && !place.cell && (
          <div className="grc-explorer-panel">
            <RiskTable
              tenant={tenant}
              rating={place.rating}
              scope={place.scope}
              category={place.category}
              cell={null}
              page={place.page}
              onPage={place.setPage}
              onOpen={place.openRisk}
            />
          </div>
        )}
      </div>
      {!wide && place.cell && !place.risk && (
        <CellSheet
          tenant={tenant}
          rating={place.rating}
          scope={place.scope}
          cell={place.cell}
          onOpen={place.openRisk}
          onClose={place.closeCellSheet}
        />
      )}
      {place.risk && <RiskDetail tenant={tenant} riskId={place.risk} onClose={place.closeRisk} />}
    </>
  );
}

function CellSheet({
  tenant,
  rating,
  scope,
  cell,
  onOpen,
  onClose,
}: {
  tenant: string;
  rating: RatingKind;
  scope: string | null;
  cell: Cell;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const query = combine([
    useQuery(
      risksQuery(tenant, {
        rating,
        likelihood: cell.likelihood,
        impact: cell.impact,
        limit: 100,
        ...(scope ? { scope } : {}),
      }),
    ),
  ] as const);

  return (
    <ResponsiveDrawer
      open
      onClose={onClose}
      title={t("risk.filters.cell", { likelihood: cell.likelihood, impact: cell.impact })}
    >
      <QueryContent
        query={query}
        rows={4}
        isEmpty={([result]) => result.items.length === 0}
        empty={t("risk.table.empty")}
      >
        {([result]) => (
          <ul className="grc-plain-list grc-cell-risks">
            {result.items.map((risk) => (
              <li key={risk.id}>
                <Button
                  type="link"
                  className="grc-risk-title"
                  data-risk={risk.id}
                  onClick={() => {
                    onOpen(risk.id);
                  }}
                >
                  <span lang="de">{risk.title_de}</span>
                </Button>
                <RatingChip rating={risk[rating]} />
              </li>
            ))}
          </ul>
        )}
      </QueryContent>
    </ResponsiveDrawer>
  );
}

/** Focuses the control marked as opening a risk or a cell, if it is still on screen. */
function focusMarked(kind: "risk" | "cell", value: string) {
  const marked = [...document.querySelectorAll<HTMLElement>(`[data-${kind}]`)];
  marked.find((element) => element.dataset[kind] === value)?.focus();
}
