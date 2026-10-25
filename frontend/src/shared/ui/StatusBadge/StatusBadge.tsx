import "./statusBadge.css";

import { Circle, CircleCheck, CircleDot, CircleMinus } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ImplementationStatus } from "@/shared/api/types";

const ICONS = {
  open: Circle,
  partial: CircleDot,
  implemented: CircleCheck,
  not_applicable: CircleMinus,
} as const;

/**
 * An Implementation status as icon, word and color together, so it reads the same for
 * people who can't tell the colors apart. "Open" stays neutral: open work is normal in a
 * compliance programme, not an error.
 */
export function StatusBadge({ status }: { status: ImplementationStatus }) {
  const { t } = useTranslation();
  const Icon = ICONS[status];

  return (
    <span className={`grc-status-badge grc-status-badge-${status}`}>
      <Icon size={14} aria-hidden />
      {t(`implementationStatus.${status}`)}
    </span>
  );
}
