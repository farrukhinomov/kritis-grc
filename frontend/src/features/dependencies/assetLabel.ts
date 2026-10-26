import type { TFunction } from "i18next";

import type { GraphAsset } from "@/shared/api/types";

/** Opens an Asset's details; `entry` names the button, so focus can return to it. */
export type OpenAsset = (asset: GraphAsset, entry: string) => void;

/** The overlay's chip, short enough that a node keeps its height. */
export function riskChip(t: TFunction, asset: GraphAsset): string {
  const { count, highest } = asset.risks;
  const risks = t("dependencies.risks", { count });
  return highest
    ? t("dependencies.chip", { category: t(`dashboard.riskCategories.${highest.category}`), risks })
    : t("dependencies.chipPending", { risks });
}

/**
 * A node's name: what it shows, in the order it shows it, so a voice command that reads
 * the visible text finds it. Without Risks the overlay adds that in words.
 */
export function assetLabel(t: TFunction, asset: GraphAsset, overlay: boolean): string {
  const parts = [asset.name, t(`facilities.assetKinds.${asset.kind}`)];
  if (overlay) {
    parts.push(asset.risks.count > 0 ? riskChip(t, asset) : t("dependencies.noRisks"));
  }
  return parts.join(", ");
}
