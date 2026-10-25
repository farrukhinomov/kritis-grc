import { useLocation, useNavigate, useSearchParams } from "react-router";

import type { RatingKind, RiskCategory } from "@/shared/api/types";
import { RISK_CATEGORIES } from "@/shared/theme/semantic";

const RATINGS: readonly RatingKind[] = ["inherent", "residual", "target"];
const LEVEL = /^[1-4]$/;

export interface Cell {
  likelihood: number;
  impact: number;
}

export type CategoryFilter = RiskCategory | "pending";

/** "3-4" ↔ likelihood 3, impact 4; anything else is no cell. */
function parseCell(value: string | null): Cell | null {
  const [likelihood, impact] = value?.split("-") ?? [];
  return likelihood && impact && LEVEL.test(likelihood) && LEVEL.test(impact)
    ? { likelihood: Number(likelihood), impact: Number(impact) }
    : null;
}

const cellParam = (cell: Cell) => `${String(cell.likelihood)}-${String(cell.impact)}`;

/**
 * What the explorer shows, kept in the URL like the cockpit: a reload or a shared link
 * opens the same view, and opening a risk is a history entry, so back closes it.
 * Unknown values fall back to the defaults instead of an empty screen.
 */
export function useExplorerPlace() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const opened = (useLocation().state as { explorer?: string } | null)?.explorer;

  const rating = RATINGS.find((item) => item === params.get("rating")) ?? "residual";
  const rawCategory = params.get("category");
  // Only the residual rating can be pending; for the others the filter is dropped.
  const category: CategoryFilter | null =
    RISK_CATEGORIES.find((item) => item === rawCategory) ??
    (rawCategory === "pending" && rating === "residual" ? "pending" : null);
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  // A pushed entry is marked with what it opened, so closing it can go back instead of
  // stacking another entry; anything else (a filter, a shared link) is replaced.
  const set = (change: Record<string, string | null>, options: { push?: "risk" | "cell" } = {}) => {
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
      options.push ? { state: { explorer: options.push } } : { replace: true },
    );
  };

  return {
    rating,
    scope: params.get("scope"),
    category,
    cell: parseCell(params.get("cell")),
    page,
    risk: params.get("risk"),
    /** A cell belongs to one rating, so changing the rating clears it. */
    setRating: (value: RatingKind) => {
      set({ rating: value === "residual" ? null : value, cell: null, category: null, page: null });
    },
    setScope: (value: string | null) => {
      set({ scope: value, page: null });
    },
    setCategory: (value: CategoryFilter | null) => {
      set({ category: value, page: null });
    },
    /** On wide screens a cell is a filter of the table. */
    setCell: (value: Cell | null) => {
      set({ cell: value ? cellParam(value) : null, page: null });
    },
    /** On phones a cell opens a sheet, which the back gesture must close. */
    openCellSheet: (value: Cell) => {
      set({ cell: cellParam(value) }, { push: "cell" });
    },
    closeCellSheet: () => {
      if (opened === "cell") {
        void navigate(-1);
        return;
      }
      set({ cell: null });
    },
    setPage: (value: number) => {
      set({ page: value === 1 ? null : String(value) });
    },
    openRisk: (id: string) => {
      set({ risk: id }, { push: "risk" });
    },
    closeRisk: () => {
      if (opened === "risk") {
        void navigate(-1);
        return;
      }
      set({ risk: null });
    },
  };
}
