import { useQuery } from "@tanstack/react-query";
import { Button, Pagination } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { risksQuery } from "@/shared/api/risk";
import type { RatingKind, Risk } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { ResponsiveTable } from "@/shared/ui/patterns/ResponsiveTable";

import { RatingChip } from "./RatingChip";
import type { CategoryFilter, Cell } from "./useExplorerPlace";

const PAGE_SIZE = 25;

interface RiskTableProps {
  tenant: string;
  rating: RatingKind;
  scope: string | null;
  category: CategoryFilter | null;
  cell: Cell | null;
  page: number;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
}

export function RiskTable({
  tenant,
  rating,
  scope,
  category,
  cell,
  page,
  onPage,
  onOpen,
}: RiskTableProps) {
  const { t, i18n } = useTranslation();
  const query = combine([
    useQuery(
      risksQuery(tenant, {
        rating,
        ordering: "-residual_score",
        page,
        limit: PAGE_SIZE,
        ...(scope ? { scope } : {}),
        ...(category ? { category } : {}),
        ...(cell ? { likelihood: cell.likelihood, impact: cell.impact } : {}),
      }),
    ),
  ] as const);
  // A link can name a page that no longer exists (fewer risks, other filters); it moves to
  // the last page instead of showing an empty list without a pager.
  const [result] = query.data ?? [];
  const lastPage = result ? Math.max(1, Math.ceil(result.page.total / PAGE_SIZE)) : page;
  useEffect(() => {
    if (page > lastPage) {
      onPage(lastPage);
    }
  }, [page, lastPage, onPage]);
  const hazardName = (risk: Risk) =>
    i18n.language === "en" ? risk.hazard.name_en : risk.hazard.name_de;
  // The title opens the detail: a real button, so it works by keyboard and is announced.
  const title = (risk: Risk) => (
    <Button
      type="link"
      className="grc-risk-title"
      data-risk={risk.id}
      onClick={() => {
        onOpen(risk.id);
      }}
    >
      {/* Risk titles are German in every UI language, like the statute texts. */}
      <span lang="de">{risk.title_de}</span>
    </Button>
  );

  return (
    <QueryContent
      query={query}
      rows={6}
      isEmpty={([result]) => result.items.length === 0}
      empty={t("risk.table.empty")}
    >
      {([result]) => (
        <>
          <ResponsiveTable<Risk>
            label={t("nav.risks")}
            rows={result.items}
            rowKey={(risk) => risk.id}
            columns={[
              {
                key: "risk",
                title: t("risk.table.risk"),
                // Scope and Hazard sit under the title, so the three ratings keep their room.
                render: (_, risk) => (
                  <div className="grc-risk-card">
                    {title(risk)}
                    <span className="grc-meta">
                      {risk.scope_name} · {hazardName(risk)}
                    </span>
                  </div>
                ),
              },
              {
                key: "inherent",
                title: t("risk.ratings.inherent"),
                render: (_, risk) => <RatingChip rating={risk.inherent} />,
              },
              {
                key: "residual",
                title: t("risk.ratings.residual"),
                render: (_, risk) => <RatingChip rating={risk.residual} />,
              },
              {
                key: "target",
                title: t("risk.ratings.target"),
                render: (_, risk) => <RatingChip rating={risk.target} />,
              },
            ]}
            renderCard={(risk) => (
              <div className="grc-risk-card">
                {title(risk)}
                <span className="grc-meta">
                  {risk.scope_name} · {hazardName(risk)}
                </span>
                <span className="grc-risk-card-ratings">
                  {t("risk.ratings.residual")}: <RatingChip rating={risk.residual} />
                </span>
              </div>
            )}
          />
          {result.page.total > PAGE_SIZE && (
            <Pagination
              className="grc-risk-pagination"
              current={page}
              pageSize={PAGE_SIZE}
              total={result.page.total}
              showSizeChanger={false}
              onChange={onPage}
            />
          )}
        </>
      )}
    </QueryContent>
  );
}
