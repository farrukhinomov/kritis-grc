import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Popconfirm, Segmented } from "antd";
import { FileText, Link2, Share2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { evidenceQuery, implementationQuery, removeEvidence } from "@/shared/api/compliance";
import { scopeQuery } from "@/shared/api/organization";
import type { Evidence, Implementation, NewEvidence, Requirement } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { useCan } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { StatusBadge } from "@/shared/ui/StatusBadge/StatusBadge";

import { FileEvidenceForm } from "./evidence/FileEvidenceForm";
import { LinkEvidenceForm } from "./evidence/LinkEvidenceForm";
import { ReferenceSuggestions } from "./evidence/ReferenceSuggestions";
import { type EvidenceTarget, useRefreshEvidence } from "./evidence/useAddEvidence";
import { formatBytes } from "./formatBytes";

type Kind = NewEvidence["kind"];

const ICONS = { file: FileText, link: Link2, reference: Share2 } as const;

/**
 * Only web addresses become links. Stored data may come from other clients, so anything
 * unparsable or with another scheme (javascript:, data:) is shown as plain text instead
 * of breaking the list or running in the page.
 */
function webAddress(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function EvidencePanel({
  tenant,
  implementation,
  requirement,
}: {
  tenant: string;
  implementation: Implementation;
  requirement: Requirement;
}) {
  const { t } = useTranslation();
  const canChange = useCan("change");
  const target: EvidenceTarget = { tenant, implementationId: implementation.id };
  const evidence = useQuery(evidenceQuery(tenant, implementation.id));
  const refresh = useRefreshEvidence(target);
  const remove = useMutation({
    mutationFn: (evidenceId: string) => removeEvidence(tenant, implementation.id, evidenceId),
    onSettled: refresh,
  });

  return (
    <div className="grc-drawer-panel">
      <QueryContent
        query={combine([evidence] as const)}
        rows={3}
        isEmpty={([page]) => page.items.length === 0}
        empty={t("evidence.empty")}
      >
        {([page]) => (
          <EvidenceList
            tenant={tenant}
            items={page.items}
            canChange={canChange}
            onRemove={(id) => {
              remove.mutate(id);
            }}
          />
        )}
      </QueryContent>
      {canChange && (
        <AddEvidence
          target={target}
          requirement={requirement}
          existing={evidence.data?.items ?? []}
        />
      )}
    </div>
  );
}

function EvidenceList({
  tenant,
  items,
  canChange,
  onRemove,
}: {
  tenant: string;
  items: Evidence[];
  canChange: boolean;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <ul aria-label={t("drawer.tabs.evidence")} className="grc-evidence-list">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.id} className="grc-evidence-item">
            <Icon size={18} aria-hidden className="grc-evidence-icon" />
            <span className="grc-evidence-text">
              <span>{item.title}</span>{" "}
              <span className="grc-evidence-meta">
                <EvidenceMeta tenant={tenant} evidence={item} />
              </span>
            </span>
            {canChange && (
              <Popconfirm
                title={t("evidence.removeConfirm")}
                okText={t("evidence.remove")}
                cancelText={t("evidence.cancel")}
                onConfirm={() => {
                  onRemove(item.id);
                }}
              >
                <Button type="text" size="small" danger>
                  <span className="grc-visually-hidden">
                    {t("evidence.removeLabel", { title: item.title })}
                  </span>
                  <span aria-hidden>{t("evidence.remove")}</span>
                </Button>
              </Popconfirm>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EvidenceMeta({ tenant, evidence }: { tenant: string; evidence: Evidence }) {
  const { t, i18n } = useTranslation();

  if (evidence.kind === "file" && evidence.file) {
    return `${evidence.file.name} · ${formatBytes(evidence.file.size_bytes, i18n.language)}`;
  }
  if (evidence.kind === "link" && evidence.url) {
    const url = webAddress(evidence.url);
    // Links lead off the platform; noopener keeps the other site from reaching back.
    return url ? (
      <a href={url.href} target="_blank" rel="noopener noreferrer">
        {url.host}
      </a>
    ) : (
      evidence.url
    );
  }
  if (evidence.referenced_implementation_id) {
    return (
      <ReferenceMeta tenant={tenant} implementationId={evidence.referenced_implementation_id} />
    );
  }
  return t("evidence.kinds.unknown");
}

function ReferenceMeta({ tenant, implementationId }: { tenant: string; implementationId: string }) {
  const { t } = useTranslation();
  const implementation = useQuery(implementationQuery(tenant, implementationId)).data;
  const scope = useQuery({
    ...scopeQuery(tenant, implementation?.scope_id ?? ""),
    enabled: Boolean(implementation),
  }).data;

  return implementation ? (
    <>
      {t("evidence.referenceTo", { scope: scope?.name ?? "" })}{" "}
      <StatusBadge status={implementation.status} />
    </>
  ) : null;
}

function AddEvidence({
  target,
  requirement,
  existing,
}: {
  target: EvidenceTarget;
  requirement: Requirement;
  existing: Evidence[];
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>("file");
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grc-evidence-add">
      <h3 id={headingId} className="grc-drawer-subtitle">
        {t("evidence.addTitle")}
      </h3>
      <Segmented<Kind>
        block
        value={kind}
        onChange={setKind}
        options={[
          { value: "file", label: t("evidence.kinds.file") },
          { value: "link", label: t("evidence.kinds.link") },
          { value: "reference", label: t("evidence.kinds.reference") },
        ]}
      />
      {kind === "file" && <FileEvidenceForm target={target} />}
      {kind === "link" && <LinkEvidenceForm target={target} />}
      {kind === "reference" && (
        <ReferenceSuggestions target={target} requirement={requirement} existing={existing} />
      )}
    </section>
  );
}
