import "./roadmap.css";

import { useTranslation } from "react-i18next";

import { PageHeader } from "@/shared/ui/PageHeader";

const MILESTONES = ["m1", "m2", "m3"] as const;
const LATER = [
  "report",
  "incidents",
  "resiliencePlan",
  "evidenceLibrary",
  "policies",
  "audit",
  "notifications",
  "memberships",
  "sso",
  "quantitative",
] as const;

/** Where the platform goes after the prototype, and what version 1 knowingly leaves out. */
export function RoadmapPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t("nav.roadmap")} description={t("roadmap.description")} />
      <div className="grc-roadmap">
        <section aria-labelledby="roadmap-milestones" className="grc-roadmap-panel">
          <h2 id="roadmap-milestones" className="grc-roadmap-title">
            {t("roadmap.milestonesTitle")}
          </h2>
          <ol className="grc-plain-list grc-roadmap-milestones">
            {MILESTONES.map((key) => (
              <li key={key}>
                <h3 className="grc-roadmap-milestone">{t(`roadmap.milestones.${key}.title`)}</h3>
                <p className="grc-meta">{t(`roadmap.milestones.${key}.content`)}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="roadmap-later" className="grc-roadmap-panel">
          <h2 id="roadmap-later" className="grc-roadmap-title">
            {t("roadmap.laterTitle")}
          </h2>
          <ul className="grc-roadmap-later">
            {LATER.map((key) => (
              <li key={key}>{t(`roadmap.later.${key}`)}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
