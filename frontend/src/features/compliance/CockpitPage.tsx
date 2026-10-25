import "./cockpit.css";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Alert, Select } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  complianceParagraphsQuery,
  complianceSummaryQuery,
  frameworksQuery,
  implementationsQuery,
  requirementsQuery,
} from "@/shared/api/compliance";
import type {
  ComplianceSummaryRow,
  Framework,
  Implementation,
  ParagraphSummaryRow,
  Requirement,
} from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { PageHeader } from "@/shared/ui/PageHeader";
import { ColumnDrillDown, type DrillColumn } from "@/shared/ui/patterns/ColumnDrillDown";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { StatusBadge } from "@/shared/ui/StatusBadge/StatusBadge";

import { DrillList } from "./DrillList";
import { overallStatus } from "./status";
import { useCockpitPlace } from "./useCockpitPlace";
import { currentVersion } from "./version";

/** Critical Facilities first, as the KRITIS duties attach to them. */
const facilitiesFirst = (a: ComplianceSummaryRow, b: ComplianceSummaryRow) =>
  Number(a.scope_kind !== "critical_facility") - Number(b.scope_kind !== "critical_facility");

/**
 * From a paragraph to a single Implementation, per Framework and Scope. Choices that
 * don't exist (an old link, another Tenant's Scope) fall back to the first valid one
 * rather than showing an empty screen.
 */
export function CockpitPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([
    useQuery(frameworksQuery(tenant)),
    useQuery(complianceSummaryQuery(tenant)),
  ] as const);

  return (
    <>
      <PageHeader title={t("nav.compliance")} description={t("compliance.description")} />
      <QueryContent
        query={query}
        rows={8}
        isEmpty={([, summary]) => summary.rows.length === 0}
        empty={t("compliance.empty")}
      >
        {([frameworks, summary]) => (
          <Cockpit tenant={tenant} frameworks={frameworks.items} summary={summary.rows} />
        )}
      </QueryContent>
    </>
  );
}

interface CockpitProps {
  tenant: string;
  frameworks: Framework[];
  summary: ComplianceSummaryRow[];
}

function Cockpit({ tenant, frameworks, summary }: CockpitProps) {
  const { t } = useTranslation();
  const { place, selectFramework, selectScope, selectParagraph, selectRequirement, back, discard } =
    useCockpitPlace();
  // Which column the keyboard is moving to; it takes focus once its items are there.
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const focused = useCallback(() => {
    setFocusLevel(null);
  }, []);

  const withData = frameworks.filter((f) => summary.some((row) => row.framework_id === f.id));
  const framework = withData.find((f) => f.id === place.framework) ?? withData[0];
  const scopes = summary
    .filter((row) => row.framework_id === framework?.id)
    .toSorted(facilitiesFirst);
  const scope = scopes.find((row) => row.scope_id === place.scope) ?? scopes[0];
  const version = framework && currentVersion(framework);

  const paragraphs = useQuery({
    ...complianceParagraphsQuery(tenant, {
      framework_version: version?.id ?? "",
      scope: scope?.scope_id ?? "",
    }),
    enabled: Boolean(version && scope),
    // Another facility keeps the columns on screen until its numbers arrive, instead of
    // collapsing the drill-down and rebuilding it.
    placeholderData: keepPreviousData,
  });
  const paragraph = paragraphs.data?.rows.find((row) => row.paragraph === place.paragraph);

  const requirements = useQuery({
    ...requirementsQuery(tenant, {
      framework_version: version?.id ?? "",
      paragraph: paragraph?.paragraph ?? "",
      limit: 100,
    }),
    enabled: Boolean(paragraph),
  });
  const implementations = useQuery({
    ...implementationsQuery(tenant, {
      scope: scope?.scope_id ?? "",
      paragraph: paragraph?.paragraph ?? "",
      limit: 100,
    }),
    enabled: Boolean(paragraph),
    placeholderData: keepPreviousData,
  });
  const requirement = requirements.data?.items.find((item) => item.id === place.requirement);
  const implementationOf = (id: string) =>
    implementations.data?.items.find((item) => item.requirement_id === id);

  // Levels from an old or edited link that don't exist leave the URL, so the screen, the
  // URL and the back button agree. Placeholder data from the previous facility doesn't count.
  const paragraphsSettled = paragraphs.isSuccess && !paragraphs.isPlaceholderData;
  const requirementsSettled = requirements.isSuccess && !requirements.isPlaceholderData;
  const unknownParagraph = paragraphsSettled && place.paragraph !== null && !paragraph;
  const unknownRequirement = requirementsSettled && place.requirement !== null && !requirement;
  useEffect(() => {
    if (unknownParagraph) {
      discard({ paragraph: null, requirement: null });
    } else if (unknownRequirement) {
      discard({ requirement: null });
    }
  }, [unknownParagraph, unknownRequirement, discard]);

  // A keyboard move into a column that turned out empty or failed has nowhere to land; it
  // is dropped rather than kept, or it would take focus away from a later mouse click.
  const nowhereToLand =
    requirements.isError || (requirementsSettled && requirements.data.items.length === 0);

  if (!framework || !scope) {
    return null;
  }

  const openParagraph = (key: string) => {
    setFocusLevel(null);
    selectParagraph(key);
  };
  const openRequirement = (key: string) => {
    setFocusLevel(null);
    selectRequirement(key);
  };

  const columns: DrillColumn[] = [
    {
      key: "paragraphs",
      title: t("compliance.columns.paragraphs"),
      content: (
        <QueryContent
          query={combine([paragraphs] as const)}
          rows={6}
          isEmpty={([result]) => result.rows.length === 0}
          empty={t("compliance.emptyParagraphs")}
        >
          {([result]) => (
            <>
              <ColumnSummary rows={result.rows} />
              <DrillList
                label={t("compliance.columns.paragraphs")}
                items={result.rows.map((row) => ({
                  key: row.paragraph,
                  content: <ParagraphItem row={row} />,
                }))}
                selected={paragraph?.paragraph ?? null}
                onSelect={openParagraph}
                onForward={(key) => {
                  selectParagraph(key);
                  setFocusLevel(1);
                }}
                focusRequested={focusLevel === 0}
                onFocused={focused}
              />
            </>
          )}
        </QueryContent>
      ),
    },
  ];

  if (paragraph) {
    columns.push({
      key: `requirements ${paragraph.paragraph}`,
      title: t("compliance.columns.requirements"),
      content: (
        <QueryContent
          query={combine([requirements, implementations] as const)}
          rows={6}
          isEmpty={([result]) => result.items.length === 0}
          empty={t("compliance.emptyRequirements")}
        >
          {([result]) => (
            <DrillList
              label={t("compliance.columns.requirements")}
              items={result.items.map((item) => ({
                key: item.id,
                content: (
                  <RequirementItem requirement={item} implementation={implementationOf(item.id)} />
                ),
              }))}
              selected={requirement?.id ?? null}
              onSelect={openRequirement}
              onForward={openRequirement}
              onBackward={() => {
                setFocusLevel(0);
              }}
              focusRequested={focusLevel === 1 && !nowhereToLand}
              onFocused={focused}
            />
          )}
        </QueryContent>
      ),
    });
  }

  if (requirement) {
    columns.push({
      key: `implementation ${requirement.id}`,
      title: t("compliance.columns.implementation"),
      content: (
        <ImplementationDetail
          requirement={requirement}
          implementation={implementationOf(requirement.id)}
        />
      ),
    });
  }

  return (
    <>
      <div className="grc-cockpit-filters">
        <Select
          aria-label={t("compliance.framework")}
          className="grc-cockpit-select"
          value={framework.id}
          options={withData.map((item) => ({ value: item.id, label: item.name }))}
          onChange={selectFramework}
        />
        <Select
          aria-label={t("compliance.scope")}
          className="grc-cockpit-select"
          value={scope.scope_id}
          options={scopes.map((row) => ({ value: row.scope_id, label: row.scope_name }))}
          onChange={selectScope}
        />
      </div>
      <ColumnDrillDown
        label={t("compliance.drill")}
        columns={columns}
        onBack={() => {
          back({ requirement: Boolean(requirement) });
        }}
      />
    </>
  );
}

/** Totals for the whole column, so the counts per row have a frame of reference. */
function ColumnSummary({ rows }: { rows: ParagraphSummaryRow[] }) {
  const { t } = useTranslation();
  const sum = (pick: (row: ParagraphSummaryRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  return (
    <p className="grc-cockpit-summary">
      {t("compliance.summary", {
        requirements: sum((row) => row.requirement_count),
        implemented: sum((row) => row.counts.implemented),
        partial: sum((row) => row.counts.partial),
        open: sum((row) => row.counts.open),
      })}
    </p>
  );
}

function ParagraphItem({ row }: { row: ParagraphSummaryRow }) {
  const { t } = useTranslation();
  const applicable = row.counts.open + row.counts.partial + row.counts.implemented;

  return (
    <>
      <span className="grc-drill-item-text">
        <strong>{row.paragraph}</strong>{" "}
        <span className="grc-drill-item-meta">
          {t("compliance.implementedOf", {
            implemented: row.counts.implemented,
            total: applicable,
          })}
        </span>
      </span>
      <StatusBadge status={overallStatus(row.counts)} />
    </>
  );
}

function RequirementItem({
  requirement,
  implementation,
}: {
  requirement: Requirement;
  implementation: Implementation | undefined;
}) {
  const { t, i18n } = useTranslation();

  return (
    <>
      <span className="grc-drill-item-text">
        <strong>{requirement.citation}</strong>{" "}
        <span>{i18n.language === "en" ? requirement.title_en : requirement.title_de}</span>{" "}
        {requirement.pending_legal_detail && (
          <span className="grc-pending-legal-detail">{t("compliance.pendingLegalDetail")}</span>
        )}
      </span>
      {implementation && <StatusBadge status={implementation.status} />}
    </>
  );
}

function ImplementationDetail({
  requirement,
  implementation,
}: {
  requirement: Requirement;
  implementation: Implementation | undefined;
}) {
  const { t, i18n } = useTranslation();
  const english = i18n.language === "en";
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
    );

  return (
    <div className="grc-cockpit-detail">
      <p className="grc-cockpit-detail-title">
        <strong>{requirement.citation}</strong>{" "}
        {english ? requirement.title_en : requirement.title_de}
      </p>
      {requirement.pending_legal_detail && (
        <Alert
          type="info"
          showIcon
          title={t("compliance.pendingLegalDetail")}
          description={
            english
              ? requirement.pending_legal_detail.reason_en
              : requirement.pending_legal_detail.reason_de
          }
        />
      )}
      {implementation ? (
        <dl className="grc-cockpit-facts">
          <dt>{t("compliance.status")}</dt>
          <dd>
            <StatusBadge status={implementation.status} />
          </dd>
          <dt>{t("compliance.owner")}</dt>
          <dd>{implementation.owner_name ?? t("compliance.unassigned")}</dd>
          <dt>{t("compliance.due")}</dt>
          <dd>{implementation.due_date ? date(implementation.due_date) : t("compliance.noDue")}</dd>
          {implementation.note_de && (
            <>
              <dt>{t("compliance.note")}</dt>
              {/* Notes are written by the Tenant's people, in German. */}
              <dd lang="de">{implementation.note_de}</dd>
            </>
          )}
          <dt>{t("compliance.updated")}</dt>
          <dd>{date(implementation.updated_at)}</dd>
        </dl>
      ) : (
        <p className="grc-cockpit-summary">{t("compliance.noImplementation")}</p>
      )}
      <h3 className="grc-cockpit-statute-title">{t("compliance.statuteText")}</h3>
      {/* The statute is quoted verbatim in German in every UI language; English readers
          get the summary as a guide, never as a translation of the law. */}
      {english && <p className="grc-cockpit-summary-en">{requirement.summary_en}</p>}
      <blockquote lang="de" className="grc-cockpit-statute">
        {requirement.text_de}
      </blockquote>
    </div>
  );
}
