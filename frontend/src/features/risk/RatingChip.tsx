import { useTranslation } from "react-i18next";

import type { Rating } from "@/shared/api/types";
import { RiskChip } from "@/shared/ui/RiskChip/RiskChip";

/** A rating as category and score, or "calculation pending" where there is none yet. */
export function RatingChip({ rating }: { rating: Rating | null }) {
  const { t } = useTranslation();

  return rating ? (
    <RiskChip category={rating.category} score={rating.score} />
  ) : (
    <span className="grc-rating-pending">{t("dashboard.risks.calculationPending")}</span>
  );
}
