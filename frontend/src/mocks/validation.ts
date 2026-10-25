import type { FieldError } from "@/shared/api/client";
import { EVIDENCE_FILE_TYPES, MAX_EVIDENCE_BYTES } from "@/shared/api/compliance";
import type {
  ImplementationChange,
  ImplementationStatus,
  NewEvidence,
  UploadRequest,
} from "@/shared/api/types";

import type { TenantData } from "./db";
import { isRecord } from "./http";

/**
 * Input validation the backend's serializers will do, so the prototype's forms meet the
 * same 422 responses with field-level codes as the real API.
 */

type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

const STATUSES: readonly ImplementationStatus[] = [
  "open",
  "partial",
  "implemented",
  "not_applicable",
];
const CHANGE_FIELDS = new Set(["status", "owner_id", "due_date", "note_de"]);
const MAX_NOTE = 2000;
const MAX_TITLE = 200;
const MAX_FILE_BYTES = MAX_EVIDENCE_BYTES;
const FILE_TYPES = EVIDENCE_FILE_TYPES;
const MAX_FILE_NAME = 255;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function validateChange(body: unknown, data: TenantData): Result<ImplementationChange> {
  if (!isRecord(body)) {
    return { ok: false, errors: [{ field: "non_field_errors", code: "invalid" }] };
  }
  const errors: FieldError[] = [];
  for (const field of Object.keys(body)) {
    if (!CHANGE_FIELDS.has(field)) {
      errors.push({ field, code: "unknown_field" });
    }
  }
  if ("status" in body && !STATUSES.includes(body.status as ImplementationStatus)) {
    errors.push({ field: "status", code: "invalid_choice" });
  }
  if (
    "owner_id" in body &&
    body.owner_id !== null &&
    !data.members.some((member) => member.id === body.owner_id)
  ) {
    errors.push({ field: "owner_id", code: "invalid_choice" });
  }
  if ("due_date" in body && body.due_date !== null && !isIsoDate(body.due_date)) {
    errors.push({ field: "due_date", code: "invalid_date" });
  }
  if ("note_de" in body && body.note_de !== null) {
    if (typeof body.note_de !== "string") {
      errors.push({ field: "note_de", code: "invalid" });
    } else if (body.note_de.length > MAX_NOTE) {
      errors.push({ field: "note_de", code: "too_long" });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: body };
}

function validUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateEvidence(
  body: unknown,
  implementationId: string,
  data: TenantData,
): Result<NewEvidence> {
  if (!isRecord(body)) {
    return { ok: false, errors: [{ field: "non_field_errors", code: "invalid" }] };
  }
  const errors: FieldError[] = [];
  if (typeof body.title !== "string" || body.title.trim() === "") {
    errors.push({ field: "title", code: "required" });
  } else if (body.title.length > MAX_TITLE) {
    errors.push({ field: "title", code: "too_long" });
  }

  switch (body.kind) {
    case "link":
      if (!validUrl(body.url)) {
        errors.push({ field: "url", code: "invalid_url" });
      }
      break;
    case "reference": {
      const target = body.referenced_implementation_id;
      if (target === implementationId) {
        errors.push({ field: "referenced_implementation_id", code: "self_reference" });
      } else if (!data.implementations.some((implementation) => implementation.id === target)) {
        errors.push({ field: "referenced_implementation_id", code: "invalid_choice" });
      }
      break;
    }
    case "file": {
      const code = uploadProblem(body.upload_id, data);
      if (code) {
        errors.push({ field: "upload_id", code });
      }
      break;
    }
    default:
      errors.push({ field: "kind", code: "invalid_choice" });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: body as NewEvidence };
}

/**
 * The second check, on confirm: what arrived in storage must be what was announced when
 * the URL was issued, or a client could announce a small PDF and store something else.
 */
function uploadProblem(uploadId: unknown, data: TenantData): string | null {
  if (typeof uploadId !== "string" || uploadId === "") {
    return "required";
  }
  const upload = data.uploads.get(uploadId);
  if (!upload || upload.used) {
    return "invalid_choice";
  }
  if (!upload.stored) {
    return "not_uploaded";
  }
  if (upload.stored.size_bytes !== upload.announced.size_bytes) {
    return "size_mismatch";
  }
  const announced = upload.announced.content_type;
  const office = announced.includes("openxmlformats");
  if (
    upload.stored.content_type !== announced ||
    upload.stored.detected !== (office ? "application/zip" : announced)
  ) {
    return "unsupported_type";
  }
  return null;
}

/** The first check, before an upload URL is issued. */
export function validateUploadRequest(body: unknown): Result<UploadRequest> {
  const fail = (code: string): Result<UploadRequest> => ({
    ok: false,
    errors: [{ field: "file", code }],
  });
  if (
    !isRecord(body) ||
    typeof body.name !== "string" ||
    body.name.trim() === "" ||
    body.name.length > MAX_FILE_NAME
  ) {
    return fail("required");
  }
  if (
    typeof body.size_bytes !== "number" ||
    body.size_bytes <= 0 ||
    body.size_bytes > MAX_FILE_BYTES
  ) {
    return fail("invalid_size");
  }
  if (typeof body.content_type !== "string" || !FILE_TYPES.has(body.content_type)) {
    return fail("unsupported_type");
  }
  return {
    ok: true,
    value: { name: body.name.trim(), size_bytes: body.size_bytes, content_type: body.content_type },
  };
}

/** `"3"` or `W/"3"` → 3; anything else → null. */
export function parseIfMatch(header: string | null): number | null {
  const match = header === null ? null : /^(?:W\/)?"(\d+)"$/.exec(header.trim());
  return match ? Number(match[1]) : null;
}
