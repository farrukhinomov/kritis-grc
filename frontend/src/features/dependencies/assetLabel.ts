import type { TFunction } from "i18next";

import type { GraphAsset } from "@/shared/api/types";

/** What the overlay says about an Asset, in words, for its node and its tree entry. */
export function riskSummary(t: TFunction, asset: GraphAsset): string {
  const { count, highest } = asset.risks;
  if (count === 0) {
    return t("dependencies.noRisks");
  }
  const counted = t("dependencies.risks", { count });
  return highest
    ? `${counted}, ${t("dependencies.highest", { category: t(`dashboard.riskCategories.${highest.category}`) })}`
    : `${counted}, ${t("dependencies.pending")}`;
}

/** The whole node in one name: what the Asset is and, with the overlay, its Risks. */
export function assetLabel(t: TFunction, asset: GraphAsset, overlay: boolean): string {
  const parts = [
    asset.name,
    t(`facilities.assetKinds.${asset.kind}`),
    t(`risk.criticality.${asset.criticality}`),
  ];
  return (overlay ? [...parts, riskSummary(t, asset)] : parts).join(", ");
}

/** The overlay's chip: short, so a node keeps its height; the node's name says it in full. */
export function riskChip(t: TFunction, asset: GraphAsset): string {
  const { count, highest } = asset.risks;
  const counted = t("dependencies.risks", { count });
  return highest
    ? `${t(`dashboard.riskCategories.${highest.category}`)} · ${counted}`
    : `${t("dependencies.pendingShort")} · ${counted}`;
}
