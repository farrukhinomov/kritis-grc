import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { approvalsQuery } from "@/shared/api/approvals";
import { useCan, useCurrentMembership } from "@/shared/session/sessionContext";

import type { NavEntry } from "./navigation";

/**
 * How many things wait behind a navigation entry; only the approvals have a count. The
 * number is shown, and the link's name says it in words, since a bare digit tells a
 * screen reader user nothing.
 */
export function NavCount({ item }: { item: NavEntry }) {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const canApprove = useCan("approve");
  const total =
    useQuery({ ...approvalsQuery(tenant), enabled: item.key === "approvals" && canApprove }).data
      ?.total ?? 0;

  if (item.key !== "approvals" || !canApprove || total === 0) {
    return null;
  }
  return (
    <>
      <span aria-hidden className="grc-nav-count">
        {total > 99 ? "99+" : total}
      </span>
      <span className="grc-visually-hidden">{t("nav.pending", { count: total })}</span>
    </>
  );
}
