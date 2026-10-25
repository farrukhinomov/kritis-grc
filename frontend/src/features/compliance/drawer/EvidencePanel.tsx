import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Popconfirm, Progress, Segmented, Typography } from "antd";
import { FileText, Link2, Share2 } from "lucide-react";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/shared/api/client";
import {
  addEvidence,
  EVIDENCE_FILE_TYPES,
  evidenceQuery,
  frameworksQuery,
  implementationQuery,
  implementationsQuery,
  MAX_EVIDENCE_BYTES,
  mappingsQuery,
  removeEvidence,
  requestUpload,
  requirementQuery,
  uploadFile,
} from "@/shared/api/compliance";
import { resourceKey } from "@/shared/api/keys";
import { scopeQuery } from "@/shared/api/organization";
import type {
  Evidence,
  Framework,
  Implementation,
  Mapping,
  NewEvidence,
  Requirement,
} from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { useCan } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { StatusBadge } from "@/shared/ui/StatusBadge/StatusBadge";

import { formatBytes } from "./formatBytes";

type Kind = NewEvidence["kind"];

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx";
const LAW_ABBREVIATIONS: Record<Framework["key"], string> = {
  kritis_dachg: "KRITIS-DachG",
  bsig: "BSIG",
};

/**
 * One key per user action, kept until that action succeeds: a retry after a lost
 * response sends the same key, and the server answers it without adding the Evidence
 * twice. Only a success starts a new action.
 */
function useIdempotencyKey() {
  const key = useRef(crypto.randomUUID());
  return {
    current: () => key.current,
    renew: () => {
      key.current = crypto.randomUUID();
    },
  };
}

function useEvidenceChanges(tenant: string, implementationId: string) {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: evidenceQuery(tenant, implementationId).queryKey }),
      client.invalidateQueries({ queryKey: resourceKey(tenant, "activity") }),
    ]);

  const add = useMutation({
    mutationFn: ({ evidence, key }: { evidence: NewEvidence; key: string }) =>
      addEvidence(tenant, implementationId, evidence, key),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (evidenceId: string) => removeEvidence(tenant, implementationId, evidenceId),
    onSettled: refresh,
  });
  return { add, remove };
}

type EvidenceChanges = ReturnType<typeof useEvidenceChanges>;

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
  const evidence = useQuery(evidenceQuery(tenant, implementation.id));
  const changes = useEvidenceChanges(tenant, implementation.id);

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
              changes.remove.mutate(id);
            }}
          />
        )}
      </QueryContent>
      {canChange && (
        <AddEvidence
          tenant={tenant}
          implementation={implementation}
          requirement={requirement}
          existing={evidence.data?.items ?? []}
          changes={changes}
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
  const icons = { file: FileText, link: Link2, reference: Share2 } as const;

  return (
    <ul aria-label={t("drawer.tabs.evidence")} className="grc-evidence-list">
      {items.map((item) => {
        const Icon = icons[item.kind];
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
    // Links lead off the platform; noopener keeps the other site from reaching back.
    return (
      <a href={evidence.url} target="_blank" rel="noopener noreferrer">
        {new URL(evidence.url).host}
      </a>
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
  tenant,
  implementation,
  requirement,
  existing,
  changes,
}: {
  tenant: string;
  implementation: Implementation;
  requirement: Requirement;
  existing: Evidence[];
  changes: EvidenceChanges;
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
      {kind === "file" && <FileEvidenceForm tenant={tenant} changes={changes} />}
      {kind === "link" && <LinkEvidenceForm changes={changes} />}
      {kind === "reference" && (
        <ReferenceSuggestions
          tenant={tenant}
          implementation={implementation}
          requirement={requirement}
          existing={existing}
          changes={changes}
        />
      )}
    </section>
  );
}

function SaveError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert
      type="error"
      showIcon
      title={t(
        error instanceof ApiError && error.code === "permission_denied"
          ? "evidence.errors.permission"
          : "evidence.errors.save",
      )}
    />
  ) : null;
}

type Upload =
  | { phase: "idle" }
  | { phase: "uploading"; file: File; progress: number }
  | { phase: "ready"; file: File; uploadId: string };

/** The reason a file can't be used, checked before anything is sent. */
function fileProblem(file: File): "evidence.errors.tooLarge" | "evidence.errors.type" | null {
  if (file.size === 0 || file.size > MAX_EVIDENCE_BYTES) {
    return "evidence.errors.tooLarge";
  }
  return EVIDENCE_FILE_TYPES.has(file.type) ? null : "evidence.errors.type";
}

function uploadErrorKey(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "upload_expired") {
      return "evidence.errors.expired";
    }
    if (error.errors.some((item) => item.code === "invalid_size")) {
      return "evidence.errors.tooLarge";
    }
    if (error.errors.some((item) => item.code === "unsupported_type")) {
      return "evidence.errors.type";
    }
  }
  return "evidence.errors.upload";
}

function FileEvidenceForm({ tenant, changes }: { tenant: string; changes: EvidenceChanges }) {
  const { t, i18n } = useTranslation();
  const [upload, setUpload] = useState<Upload>({ phase: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const key = useIdempotencyKey();
  const abort = useRef<AbortController | null>(null);
  const inputId = useId();

  // Leaving the panel mid-upload stops sending the file.
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  const start = async (file: File) => {
    setProblem(null);
    const local = fileProblem(file);
    if (local) {
      setProblem(local);
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setUpload({ phase: "uploading", file, progress: 0 });
    try {
      const slot = await requestUpload(tenant, {
        name: file.name,
        size_bytes: file.size,
        content_type: file.type,
      });
      await uploadFile(
        slot,
        file,
        (progress) => {
          setUpload({ phase: "uploading", file, progress });
        },
        controller.signal,
      );
      setUpload({ phase: "ready", file, uploadId: slot.upload_id });
    } catch (error) {
      if (!controller.signal.aborted) {
        setUpload({ phase: "idle" });
        setProblem(uploadErrorKey(error));
      }
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void start(file);
    }
  };

  const progress =
    upload.phase === "idle"
      ? null
      : upload.phase === "ready"
        ? 100
        : Math.round(upload.progress * 100);

  return (
    <div className="grc-drawer-panel">
      {/* The invisible native input covers the whole zone, so the browser itself accepts
          a dropped file, and keyboard users reach it like any file field. */}
      <label htmlFor={inputId} className="grc-dropzone">
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="grc-dropzone-input"
          onChange={onPick}
        />
        <span className="grc-dropzone-label">{t("evidence.pickFile")}</span>
        <span className="grc-evidence-meta">{t("evidence.fileRules")}</span>
      </label>
      {/* Visitors use a public demo; the request is made where the decision is taken. */}
      <Typography.Text type="secondary">{t("evidence.noPersonalData")}</Typography.Text>
      {problem && <Alert type="error" showIcon title={t(problem as "evidence.errors.upload")} />}
      {upload.phase !== "idle" && progress !== null && (
        <div>
          <span className="grc-evidence-meta">
            {upload.file.name} · {formatBytes(upload.file.size, i18n.language)}
          </span>
          <Progress
            percent={progress}
            status={upload.phase === "ready" ? "success" : "active"}
            aria-label={t("evidence.progress", { name: upload.file.name })}
          />
        </div>
      )}
      {upload.phase === "ready" && (
        <Form
          layout="vertical"
          requiredMark={false}
          onFinish={() => {
            changes.add.mutate(
              { evidence: { kind: "file", title, upload_id: upload.uploadId }, key: key.current() },
              {
                onSuccess: () => {
                  key.renew();
                  setUpload({ phase: "idle" });
                  setTitle("");
                },
              },
            );
          }}
        >
          <Form.Item label={t("evidence.title")} htmlFor={`${inputId}-title`} required>
            <Input
              id={`${inputId}-title`}
              value={title}
              maxLength={200}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </Form.Item>
          <SaveError error={changes.add.error} />
          <Button
            type="primary"
            htmlType="submit"
            loading={changes.add.isPending}
            disabled={title.trim() === ""}
          >
            {t("evidence.add")}
          </Button>
        </Form>
      )}
    </div>
  );
}

function LinkEvidenceForm({ changes }: { changes: EvidenceChanges }) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ title: string; url: string }>();
  const key = useIdempotencyKey();

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      onFinish={({ title, url }) => {
        changes.add.mutate(
          { evidence: { kind: "link", title: title.trim(), url: url.trim() }, key: key.current() },
          {
            onSuccess: () => {
              key.renew();
              form.resetFields();
            },
          },
        );
      }}
    >
      <Form.Item
        name="title"
        label={t("evidence.title")}
        rules={[{ required: true, whitespace: true, message: t("evidence.errors.titleRequired") }]}
      >
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item
        name="url"
        label={t("evidence.url")}
        rules={[
          { required: true, message: t("evidence.errors.urlInvalid") },
          { type: "url", message: t("evidence.errors.urlInvalid") },
          {
            // Only web addresses: other schemes such as javascript: must never be stored.
            pattern: /^https?:\/\//i,
            message: t("evidence.errors.urlInvalid"),
          },
        ]}
      >
        <Input type="url" inputMode="url" placeholder="https://" />
      </Form.Item>
      <SaveError error={changes.add.error} />
      <Button type="primary" htmlType="submit" loading={changes.add.isPending}>
        {t("evidence.add")}
      </Button>
    </Form>
  );
}

/**
 * Only full Mappings are suggested: a partial one leaves part of the Requirement
 * uncovered, so the other Implementation alone could never prove it.
 */
function ReferenceSuggestions({
  tenant,
  implementation,
  requirement,
  existing,
  changes,
}: {
  tenant: string;
  implementation: Implementation;
  requirement: Requirement;
  existing: Evidence[];
  changes: EvidenceChanges;
}) {
  const { t } = useTranslation();
  const query = combine([
    useQuery(mappingsQuery(tenant, { target_requirement: requirement.id, limit: 100 })),
    useQuery(frameworksQuery(tenant)),
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
                tenant={tenant}
                mapping={mapping}
                frameworks={frameworks.items}
                exclude={implementation.id}
                existing={existing}
                changes={changes}
              />
            ))}
        </div>
      )}
    </QueryContent>
  );
}

function MappingSuggestion({
  tenant,
  mapping,
  frameworks,
  exclude,
  existing,
  changes,
}: {
  tenant: string;
  mapping: Mapping;
  frameworks: Framework[];
  exclude: string;
  existing: Evidence[];
  changes: EvidenceChanges;
}) {
  const source = useQuery(requirementQuery(tenant, mapping.source_requirement_id)).data;
  const candidates = useQuery(
    implementationsQuery(tenant, { requirement: mapping.source_requirement_id, limit: 100 }),
  ).data;

  if (!source || !candidates) {
    return null;
  }
  const framework = frameworks.find((item) =>
    item.versions.some((version) => version.id === source.framework_version_id),
  );
  const law = framework ? LAW_ABBREVIATIONS[framework.key] : "";
  return (
    <>
      {candidates.items
        .filter((candidate) => candidate.id !== exclude)
        .map((candidate) => (
          <SuggestionCard
            key={candidate.id}
            tenant={tenant}
            mapping={mapping}
            source={source}
            law={law}
            candidate={candidate}
            referenced={existing.some((item) => item.referenced_implementation_id === candidate.id)}
            changes={changes}
          />
        ))}
    </>
  );
}

function SuggestionCard({
  tenant,
  mapping,
  source,
  law,
  candidate,
  referenced,
  changes,
}: {
  tenant: string;
  mapping: Mapping;
  source: Requirement;
  law: string;
  candidate: Implementation;
  referenced: boolean;
  changes: EvidenceChanges;
}) {
  const { t, i18n } = useTranslation();
  const scope = useQuery(scopeQuery(tenant, candidate.scope_id)).data;
  const key = useIdempotencyKey();
  const headingId = useId();
  const citation = `${law} ${source.citation}`.trim();

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
      <p lang="de" className="grc-evidence-meta">
        {mapping.justification_de}
      </p>
      {referenced ? (
        <Typography.Text type="success">{t("evidence.alreadyReferenced")}</Typography.Text>
      ) : (
        <Button
          type="primary"
          loading={changes.add.isPending}
          onClick={() => {
            changes.add.mutate(
              {
                evidence: {
                  kind: "reference",
                  title: `${source.title_de} (${citation})`,
                  referenced_implementation_id: candidate.id,
                },
                key: key.current(),
              },
              {
                onSuccess: () => {
                  key.renew();
                },
              },
            );
          }}
        >
          {t("evidence.reference")}
        </Button>
      )}
    </section>
  );
}
