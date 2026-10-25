import "@/shared/ui/RiskChip/riskChip.css";
import "./risk.css";

import { useQuery } from "@tanstack/react-query";
import { Button, Segmented, Select } from "antd";
import { useTranslation } from "react-i18next";

import { scopesQuery } from "@/shared/api/organization";
import { risksQuery } from "@/shared/api/risk";
import type { RatingKind } from "@/shared/api/types";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { RISK_CATEGORIES } from "@/shared/theme/semantic";
import { PageHeader } from "@/shared/ui/PageHeader";
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
            onSelect={place.setCell}
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
          onClose={() => {
            place.setCell(null);
          }}
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
  const risks =
    useQuery(
      risksQuery(tenant, {
        rating,
        likelihood: cell.likelihood,
        impact: cell.impact,
        limit: 100,
        ...(scope ? { scope } : {}),
      }),
    ).data?.items ?? [];

  return (
    <ResponsiveDrawer
      open
      onClose={onClose}
      title={t("risk.filters.cell", { likelihood: cell.likelihood, impact: cell.impact })}
    >
      <ul className="grc-plain-list grc-cell-risks">
        {risks.map((risk) => (
          <li key={risk.id}>
            <Button
              type="link"
              className="grc-risk-title"
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
    </ResponsiveDrawer>
  );
}
