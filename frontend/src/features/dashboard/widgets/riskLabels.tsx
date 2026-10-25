import { useTranslation } from "react-i18next";

import type { RiskCategory } from "@/shared/api/types";

/** A risk category as a colored chip, always with its word, never by color alone. */
export function RiskChip({ category, score }: { category: RiskCategory; score?: number }) {
  const { t } = useTranslation();

  return (
    <span className={`grc-risk-chip grc-risk-${category}`}>
      {t(`dashboard.riskCategories.${category}`)}
      {score !== undefined && ` · ${String(score)}`}
    </span>
  );
}
