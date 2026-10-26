import { useQuery } from "@tanstack/react-query";
import { Button, Typography } from "antd";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import {
  frameworksQuery,
  implementationsQuery,
  mappingsQuery,
  requirementQuery,
} from "@/shared/api/compliance";
import { scopeQuery } from "@/shared/api/organization";
import type { Evidence, Framework, Implementation, Mapping, Requirement } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { LAW_ABBREVIATIONS } from "@/shared/lib/laws";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { StatusBadge } from "@/shared/ui/StatusBadge/StatusBadge";

import { SaveError } from "./SaveError";
import { useIdempotencyKey } from "@/shared/lib/useIdempotencyKey";

import { type EvidenceTarget, useAddEvidence } from "./useAddEvidence";

interface ReferenceSuggestionsProps {
  target: EvidenceTarget;
  requirement: Requirement;
  existing: Evidence[];
}

/**
 * Only full Mappings are suggested: a partial one leaves part of the Requirement
 * uncovered, so the other Implementation alone could never prove it.
 */
export function ReferenceSuggestions({ target, requirement, existing }: ReferenceSuggestionsProps) {
  const { t } = useTranslation();
  const query = combine([
    useQuery(mappingsQuery(target.tenant, { target_requirement: requirement.id, limit: 100 })),
    useQuery(frameworksQuery(target.tenant)),
  ] as const);

  return (
    <QueryContent
      query={query}
      rows={3}
      isEmpty={([mappings]) => !mappings.items.some((mapping) => mapping.coverage === "full")}
      empty={t("evidence.noFullMapping")}
    >
      {([mappings, frameworks]) => (
        <div className="grc-drawer-panel">
          {mappings.items
            .filter((mapping) => mapping.coverage === "full")
            .map((mapping) => (
              <MappingSuggestion
                key={mapping.id}
                target={target}
                mapping={mapping}
                frameworks={frameworks.items}
                existing={existing}
              />
            ))}
        </div>
      )}
    </QueryContent>
  );
}

function MappingSuggestion({
  target,
  mapping,
  frameworks,
  existing,
}: {
  target: EvidenceTarget;
  mapping: Mapping;
  frameworks: Framework[];
  existing: Evidence[];
}) {
  const source = useQuery(requirementQuery(target.tenant, mapping.source_requirement_id)).data;
  const candidates = useQuery(
    implementationsQuery(target.tenant, { requirement: mapping.source_requirement_id, limit: 100 }),
  ).data;

  if (!source || !candidates) {
    return null;
  }
  const framework = frameworks.find((item) =>
    item.versions.some((version) => version.id === source.framework_version_id),
  );
  const citation = `${framework ? LAW_ABBREVIATIONS[framework.key] : ""} ${source.citation}`.trim();
  return (
    <>
      {candidates.items
        .filter((candidate) => candidate.id !== target.implementationId)
        .map((candidate) => (
          <SuggestionCard
            key={candidate.id}
            target={target}
            mapping={mapping}
            source={source}
            citation={citation}
            candidate={candidate}
            referenced={existing.some((item) => item.referenced_implementation_id === candidate.id)}
          />
        ))}
    </>
  );
}

function SuggestionCard({
  target,
  mapping,
  source,
  citation,
  candidate,
  referenced,
}: {
  target: EvidenceTarget;
  mapping: Mapping;
  source: Requirement;
  citation: string;
  candidate: Implementation;
  referenced: boolean;
}) {
  const { t, i18n } = useTranslation();
  const scope = useQuery(scopeQuery(target.tenant, candidate.scope_id)).data;
  const key = useIdempotencyKey();
  const add = useAddEvidence(target, key.renew);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grc-suggestion">
      <h4 id={headingId} className="grc-suggestion-title">
        {t("evidence.suggestion", { citation })}
      </h4>
      <p className="grc-suggestion-text">
        <strong>{citation}</strong> {i18n.language === "en" ? source.title_en : source.title_de}
        {scope && ` · ${scope.name}`} <StatusBadge status={candidate.status} />
      </p>
      {/* The Tenant's own reasoning, in German as it was approved. */}
      <p lang="de" className="grc-meta">
        {mapping.justification_de}
      </p>
      {referenced ? (
        <Typography.Text type="success">{t("evidence.alreadyReferenced")}</Typography.Text>
      ) : (
        <>
          <SaveError error={add.error} />
          <Button
            type="primary"
            loading={add.isPending}
            onClick={() => {
              add.mutate({
                evidence: {
                  kind: "reference",
                  title: `${source.title_de} (${citation})`,
                  referenced_implementation_id: candidate.id,
                },
                key: key.current(),
              });
            }}
          >
            {t("evidence.reference")}
          </Button>
        </>
      )}
    </section>
  );
}
