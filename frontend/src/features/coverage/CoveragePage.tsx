import "./coverage.css";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { coverageMatrixQuery } from "@/shared/api/compliance";
import type { CoverageCell } from "@/shared/api/types";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { CellDetail } from "./CellDetail";
import { CoverageGrid, CoverageList } from "./CoverageGrid";

/**
 * Where the BSIG already covers the KRITIS-DachG, and where one Implementation counts for
 * both. Wide screens show the heatmap; phones list the mapped pairs. The chosen pair is
 * part of the URL, so a link opens it and the back gesture closes it.
 */
export function CoveragePage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const wide = useIsWideScreen();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const opened = (useLocation().state as { coverage?: string } | null)?.coverage === "cell";
  const query = combine([useQuery(coverageMatrixQuery(tenant))] as const);
  const matrix = query.data?.[0];
  const cell = matrix?.cells.find(
    (item) =>
      item.target_requirement_id === params.get("target") &&
      item.source_requirement_id === params.get("source"),
  );
  const find = (id: string) =>
    [...(matrix?.rows ?? []), ...(matrix?.columns ?? [])].find((item) => item.id === id);
  const target = cell && find(cell.target_requirement_id);
  const source = cell && find(cell.source_requirement_id);

  const pair =
    params.get("target") && params.get("source")
      ? `${params.get("target") ?? ""} ${params.get("source") ?? ""}`
      : null;
  // The details leave with their URL parameters and take focus with them; it returns to
  // the cell that opened them, or to the heading after a link.
  const shown = useRef(pair);
  useEffect(() => {
    const before = shown.current;
    shown.current = pair;
    if (before && !pair) {
      // Compared, not put into a selector: the value comes from the URL.
      const button = [...document.querySelectorAll<HTMLElement>("[data-cell]")].find(
        (element) => element.dataset.cell === before,
      );
      (button ?? document.querySelector<HTMLElement>("h1"))?.focus();
    }
  }, [pair]);

  const open = (chosen: CoverageCell) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("target", chosen.target_requirement_id);
        next.set("source", chosen.source_requirement_id);
        return next;
      },
      { state: { coverage: "cell" } },
    );
  };
  const close = () => {
    if (opened) {
      void navigate(-1);
      return;
    }
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("target");
        next.delete("source");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <>
      <PageHeader title={t("nav.coverage")} description={t("coverage.description")} />
      <QueryContent
        query={query}
        rows={8}
        isEmpty={([data]) => data.cells.length === 0}
        empty={t("coverage.empty")}
      >
        {([data]) => (
          <div className="grc-coverage">
            <p className="grc-coverage-totals">
              {t("coverage.totals", {
                count: data.totals.cells,
                full: data.totals.full,
                partial: data.totals.partial,
                reused: data.totals.reused,
              })}
            </p>
            <ul className="grc-plain-list grc-coverage-legend" aria-label={t("coverage.legend")}>
              {(["full", "partial"] as const).map((level) => (
                <li key={level}>
                  <span className="grc-coverage-mark" data-coverage={level} aria-hidden="true" />
                  {t(`coverage.levels.${level}`)}
                </li>
              ))}
              <li>
                <span
                  className="grc-coverage-mark"
                  data-coverage="partial"
                  data-reused="true"
                  aria-hidden="true"
                />
                {t("coverage.reused")}
              </li>
            </ul>
            {wide ? (
              <CoverageGrid matrix={data} onOpen={open} />
            ) : (
              <CoverageList matrix={data} onOpen={open} />
            )}
          </div>
        )}
      </QueryContent>
      {pair && matrix && (
        <CellDetail
          found={cell && target && source ? { cell, target, source } : null}
          onClose={close}
        />
      )}
    </>
  );
}
