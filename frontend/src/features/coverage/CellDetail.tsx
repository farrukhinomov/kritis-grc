import { Tag } from "antd";
import { useTranslation } from "react-i18next";

import { LAW_ABBREVIATIONS } from "@/shared/lib/laws";
import type { CoverageCell, CoverageRequirement } from "@/shared/api/types";
import { ResponsiveDrawer } from "@/shared/ui/patterns/ResponsiveDrawer";

/** One pair of Requirements: every Mapping between them, its reasons and gaps, and reuse. */
export function CellDetail({
  cell,
  target,
  source,
  onClose,
}: {
  cell: CoverageCell;
  target: CoverageRequirement;
  source: CoverageRequirement;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const english = i18n.language === "en";

  return (
    <ResponsiveDrawer
      open
      onClose={onClose}
      title={t("coverage.pair", {
        target: `${target.citation} ${LAW_ABBREVIATIONS[target.framework_key]}`,
        source: `${source.citation} ${LAW_ABBREVIATIONS[source.framework_key]}`,
      })}
    >
      <div className="grc-coverage-detail">
        <dl className="grc-facts">
          <dt>{LAW_ABBREVIATIONS[target.framework_key]}</dt>
          <dd>
            {target.citation} {english ? target.title_en : target.title_de}
          </dd>
          <dt>{LAW_ABBREVIATIONS[source.framework_key]}</dt>
          <dd>
            {source.citation} {english ? source.title_en : source.title_de}
          </dd>
        </dl>
        <section aria-labelledby="coverage-mappings">
          <h3 id="coverage-mappings" className="grc-drawer-subtitle">
            {t("coverage.mappings")}
          </h3>
          <ul className="grc-plain-list grc-coverage-mappings">
            {cell.mappings.map((mapping) => (
              <li key={mapping.id}>
                <p className="grc-coverage-tags">
                  <Tag>{t(`coverage.kinds.${mapping.kind}`)}</Tag>
                  <Tag className="grc-coverage-tag" data-coverage={mapping.coverage}>
                    {t(`coverage.levels.${mapping.coverage}`)}
                  </Tag>
                </p>
                <p lang="de">{mapping.justification_de}</p>
                {mapping.gap_note_de && (
                  <p>
                    <strong>{t("coverage.gap")}</strong> <span lang="de">{mapping.gap_note_de}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="coverage-reuse">
          <h3 id="coverage-reuse" className="grc-drawer-subtitle">
            {t("coverage.reuseTitle")}
          </h3>
          <p className={cell.reused_in.length > 0 ? undefined : "grc-meta"}>
            {cell.reused_in.length > 0
              ? t("coverage.reusedIn", {
                  facilities: cell.reused_in.map((item) => item.scope_name).join(", "),
                })
              : t("coverage.notReused")}
          </p>
        </section>
      </div>
    </ResponsiveDrawer>
  );
}
