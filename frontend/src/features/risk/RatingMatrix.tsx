import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import type { RatingKind, Risk } from "@/shared/api/types";
import { duration, ease } from "@/shared/theme/motion";

const LEVELS = [1, 2, 3, 4] as const;
const KINDS: readonly RatingKind[] = ["inherent", "target", "residual"];

/**
 * One Risk's three ratings in one 4×4 grid. Each rating is a marker with a stable layout
 * ID, so when the Residual Rating changes, its marker glides from the old cell to the new
 * one instead of jumping. Under reduced motion it simply appears in the new cell.
 */
export function RatingMatrix({ risk }: { risk: Risk }) {
  const { t } = useTranslation();
  const at = (likelihood: number, impact: number) =>
    KINDS.filter((kind) => {
      const rating = risk[kind];
      return rating?.likelihood === likelihood && rating.impact === impact;
    });

  return (
    <figure className="grc-rating-matrix">
      <div className="grc-rating-grid" aria-hidden>
        {LEVELS.toReversed().flatMap((impact) =>
          LEVELS.map((likelihood) => (
            <div key={`${String(likelihood)}-${String(impact)}`} className="grc-rating-cell">
              {at(likelihood, impact).map((kind) => (
                <m.span
                  key={kind}
                  layoutId={`${risk.id}-${kind}`}
                  transition={{ duration: duration.slow * 2, ease: ease.standard }}
                  className={`grc-rating-marker grc-rating-marker-${kind}`}
                />
              ))}
            </div>
          )),
        )}
      </div>
      <figcaption className="grc-rating-legend">
        {KINDS.map((kind) => {
          const rating = risk[kind];
          return (
            <span key={kind} className="grc-rating-legend-item">
              <span className={`grc-rating-marker grc-rating-marker-${kind}`} aria-hidden />
              {t(`risk.ratings.${kind}`)}:{" "}
              {rating
                ? t("risk.detail.rating", {
                    category: t(`dashboard.riskCategories.${rating.category}`),
                    likelihood: rating.likelihood,
                    impact: rating.impact,
                  })
                : t("dashboard.risks.calculationPending")}
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}
