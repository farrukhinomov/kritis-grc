import { Alert, Button, Form, Input, Progress, Typography } from "antd";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/shared/api/client";
import {
  EVIDENCE_FILE_TYPES,
  MAX_EVIDENCE_BYTES,
  requestUpload,
  uploadFile,
} from "@/shared/api/compliance";

import { formatBytes } from "../formatBytes";
import { type EvidenceTarget, useAddEvidence, useIdempotencyKey } from "./useAddEvidence";
import { SaveError } from "./SaveError";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx";

type ProblemKey =
  | "evidence.errors.tooLarge"
  | "evidence.errors.type"
  | "evidence.errors.expired"
  | "evidence.errors.upload";

type Upload =
  | { phase: "idle" }
  | { phase: "uploading"; file: File; progress: number }
  | { phase: "ready"; file: File; uploadId: string };

/** The reason a file can't be used, checked before anything is sent. */
function fileProblem(file: File): ProblemKey | null {
  if (file.size === 0 || file.size > MAX_EVIDENCE_BYTES) {
    return "evidence.errors.tooLarge";
  }
  return EVIDENCE_FILE_TYPES.has(file.type) ? null : "evidence.errors.type";
}

function uploadProblem(error: unknown): ProblemKey {
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

/**
 * Upload first, then name it: the file goes to storage as soon as it is picked, so the
 * user can type the title while it travels, and only a finished upload can be saved.
 */
export function FileEvidenceForm({ target }: { target: EvidenceTarget }) {
  const { t, i18n } = useTranslation();
  const [upload, setUpload] = useState<Upload>({ phase: "idle" });
  const [problem, setProblem] = useState<ProblemKey | null>(null);
  const [title, setTitle] = useState("");
  const key = useIdempotencyKey();
  const inFlight = useRef<AbortController | null>(null);
  const inputId = useId();
  const add = useAddEvidence(target, () => {
    key.renew();
    setUpload({ phase: "idle" });
    setTitle("");
  });

  // Closing the drawer mid-upload stops it, whether the URL is still being issued or the
  // file is already on its way.
  useEffect(
    () => () => {
      inFlight.current?.abort();
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
    // A newer file replaces an upload still in flight; only the newest may report back.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const isCurrent = () => inFlight.current === controller && !controller.signal.aborted;
    key.renew();
    add.reset();
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setUpload({ phase: "uploading", file, progress: 0 });
    try {
      const slot = await requestUpload(
        target.tenant,
        { name: file.name, size_bytes: file.size, content_type: file.type },
        controller.signal,
      );
      await uploadFile(
        slot,
        file,
        (progress) => {
          if (isCurrent()) {
            setUpload({ phase: "uploading", file, progress });
          }
        },
        controller.signal,
      );
      if (isCurrent()) {
        setUpload({ phase: "ready", file, uploadId: slot.upload_id });
      }
    } catch (error) {
      if (isCurrent()) {
        setUpload({ phase: "idle" });
        setProblem(uploadProblem(error));
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
        <span className="grc-meta">{t("evidence.fileRules")}</span>
      </label>
      {/* Visitors use a public demo; the request is made where the decision is taken. */}
      <Typography.Text type="secondary">{t("evidence.noPersonalData")}</Typography.Text>
      {problem && <Alert type="error" showIcon title={t(problem)} />}
      {upload.phase !== "idle" && (
        <div>
          <span className="grc-meta">
            {upload.file.name} · {formatBytes(upload.file.size, i18n.language)}
          </span>
          <Progress
            percent={upload.phase === "ready" ? 100 : Math.round(upload.progress * 100)}
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
            add.mutate({
              evidence: { kind: "file", title: title.trim(), upload_id: upload.uploadId },
              key: key.current(),
            });
          }}
        >
          <Form.Item label={t("evidence.title")} htmlFor={`${inputId}-title`} required>
            <Input
              id={`${inputId}-title`}
              value={title}
              maxLength={200}
              onChange={(event) => {
                key.renew();
                setTitle(event.target.value);
              }}
            />
          </Form.Item>
          <SaveError error={add.error} />
          <Button
            type="primary"
            htmlType="submit"
            loading={add.isPending}
            disabled={title.trim() === ""}
          >
            {t("evidence.add")}
          </Button>
        </Form>
      )}
    </div>
  );
}
