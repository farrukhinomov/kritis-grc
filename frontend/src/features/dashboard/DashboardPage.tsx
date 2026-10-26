import "./dashboard.css";

import { useTranslation } from "react-i18next";

import { PageHeader } from "@/shared/ui/PageHeader";

import { Widget } from "./Widget";
import { ActivityWidget } from "./widgets/ActivityWidget";
import { ComplianceWidget } from "./widgets/ComplianceWidget";
import { DeadlinesWidget } from "./widgets/DeadlinesWidget";
import { MyImplementationsWidget } from "./widgets/MyImplementationsWidget";
import { RiskMatrixWidget } from "./widgets/RiskMatrixWidget";
import { TopRisksWidget } from "./widgets/TopRisksWidget";

/**
 * Where a GRC Manager stands at a glance. The source order is the priority order: on a
 * phone the widgets simply stack, so the most important one is always on top. Each
 * widget's skeleton is about as tall as its content, so nothing below jumps when the
 * data arrives.
 */
export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t("nav.dashboard")} description={t("dashboard.description")} />
      <div className="grc-dashboard">
        <Widget title={t("dashboard.compliance.title")} wide>
          <ComplianceWidget />
        </Widget>
        <Widget title={t("dashboard.deadlines.title")}>
          <DeadlinesWidget />
        </Widget>
        <Widget title={t("dashboard.matrix.title")}>
          <RiskMatrixWidget />
        </Widget>
        <Widget title={t("dashboard.topRisks.title")}>
          <TopRisksWidget />
        </Widget>
        <Widget title={t("dashboard.mine.title")}>
          <MyImplementationsWidget />
        </Widget>
        <Widget title={t("dashboard.activity.title")}>
          <ActivityWidget />
        </Widget>
      </div>
    </>
  );
}
