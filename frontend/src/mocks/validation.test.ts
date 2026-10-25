import { tenantData } from "./db";
import {
  parseIfMatch,
  validateChange,
  validateEvidence,
  validateUploadRequest,
} from "./validation";

const data = () => tenantData("muster-stadtwerke")!;
const errorsOf = (result: { ok: boolean; errors?: unknown }) => (result.ok ? [] : result.errors);

describe("validateChange", () => {
  it("accepts a valid change", () => {
    expect(
      validateChange(
        { status: "implemented", owner_id: "u-becker", due_date: "2027-03-31", note_de: "ok" },
        data(),
      ),
    ).toMatchObject({ ok: true });
  });

  it("accepts clearing the optional fields", () => {
    expect(validateChange({ owner_id: null, due_date: null, note_de: null }, data())).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it.each([
    ["not an object", ["status"], [{ field: "non_field_errors", code: "invalid" }]],
    ["unknown fields", { version: 9 }, [{ field: "version", code: "unknown_field" }]],
    ["an unknown owner", { owner_id: "u-nobody" }, [{ field: "owner_id", code: "invalid_choice" }]],
    ["a note that isn't text", { note_de: 42 }, [{ field: "note_de", code: "invalid" }]],
    [
      "a note that is too long",
      { note_de: "x".repeat(2001) },
      [{ field: "note_de", code: "too_long" }],
    ],
    [
      "a date in another format",
      { due_date: "31.03.2027" },
      [{ field: "due_date", code: "invalid_date" }],
    ],
  ])("rejects %s", (_, body, errors) => {
    expect(errorsOf(validateChange(body, data()))).toEqual(errors);
  });
});

describe("validateUploadRequest", () => {
  const file = { name: "plan.pdf", size_bytes: 1024, content_type: "application/pdf" };

  it("accepts an allowed file up to 20 MB", () => {
    expect(validateUploadRequest(file)).toMatchObject({ ok: true });
    expect(validateUploadRequest({ ...file, size_bytes: 20 * 1024 * 1024 })).toMatchObject({
      ok: true,
    });
  });

  it.each([
    ["no details", null, "required"],
    ["a missing name", { ...file, name: " " }, "required"],
    ["an empty file", { ...file, size_bytes: 0 }, "invalid_size"],
    ["a file over 20 MB", { ...file, size_bytes: 20 * 1024 * 1024 + 1 }, "invalid_size"],
    ["an unsupported type", { ...file, content_type: "text/html" }, "unsupported_type"],
  ])("rejects %s", (_, body, code) => {
    expect(errorsOf(validateUploadRequest(body))).toEqual([{ field: "file", code }]);
  });
});

describe("validateEvidence", () => {
  const announced = { name: "plan.pdf", size_bytes: 1024, content_type: "application/pdf" };
  const withUpload = (
    stored: { size_bytes: number; content_type: string; detected: string | null } | null,
    used = false,
  ) => {
    const tenant = data();
    tenant.uploads.set("up-1", { announced, expiresAt: Date.now() + 60_000, stored, used });
    return tenant;
  };
  const storedAsAnnounced = {
    size_bytes: 1024,
    content_type: "application/pdf",
    detected: "application/pdf",
  };

  it("accepts a finished upload", () => {
    expect(
      validateEvidence(
        { kind: "file", title: "Plan", upload_id: "up-1" },
        "im-001",
        withUpload(storedAsAnnounced),
      ),
    ).toMatchObject({ ok: true });
  });

  it.each([
    ["an unknown upload", () => withUpload(storedAsAnnounced), "nope", "invalid_choice"],
    ["a used upload", () => withUpload(storedAsAnnounced, true), "up-1", "invalid_choice"],
    ["an upload not yet stored", () => withUpload(null), "up-1", "not_uploaded"],
    [
      "a different size",
      () => withUpload({ ...storedAsAnnounced, size_bytes: 9 }),
      "up-1",
      "size_mismatch",
    ],
    [
      "content that isn't a PDF",
      () => withUpload({ ...storedAsAnnounced, detected: null }),
      "up-1",
      "unsupported_type",
    ],
    [
      "a different type",
      () => withUpload({ ...storedAsAnnounced, content_type: "text/html" }),
      "up-1",
      "unsupported_type",
    ],
  ])("rejects %s", (_, tenant, uploadId, code) => {
    // Built per case: every case writes "up-1" into the same Tenant data.
    expect(
      errorsOf(
        validateEvidence({ kind: "file", title: "T", upload_id: uploadId }, "im-001", tenant()),
      ),
    ).toEqual([{ field: "upload_id", code }]);
  });

  it.each([
    ["a link", { kind: "link", title: "Bericht", url: "https://example.org" }],
    ["a reference", { kind: "reference", title: "BSIG", referenced_implementation_id: "im-033" }],
  ])("accepts %s", (_, body) => {
    expect(validateEvidence(body, "im-001", data())).toMatchObject({ ok: true });
  });

  it.each([
    ["not an object", null, "non_field_errors", "invalid"],
    [
      "a missing title",
      { kind: "link", title: " ", url: "https://example.org" },
      "title",
      "required",
    ],
    [
      "a long title",
      { kind: "link", title: "x".repeat(201), url: "https://example.org" },
      "title",
      "too_long",
    ],
    [
      "a non-web link",
      { kind: "link", title: "T", url: "ftp://example.org" },
      "url",
      "invalid_url",
    ],
    ["a malformed link", { kind: "link", title: "T", url: "not a url" }, "url", "invalid_url"],
    ["a missing upload", { kind: "file", title: "T" }, "upload_id", "required"],
    [
      "an unknown reference",
      { kind: "reference", title: "T", referenced_implementation_id: "im-999" },
      "referenced_implementation_id",
      "invalid_choice",
    ],
    ["an unknown kind", { kind: "photo", title: "T" }, "kind", "invalid_choice"],
  ])("rejects %s", (_, body, field, code) => {
    expect(errorsOf(validateEvidence(body, "im-001", data()))).toEqual([{ field, code }]);
  });
});

describe("parseIfMatch", () => {
  it.each([
    ['"3"', 3],
    ['W/"12"', 12],
    [' "4" ', 4],
    ["3", null],
    ['"abc"', null],
    [null, null],
  ])("reads %s as %s", (header, expected) => {
    expect(parseIfMatch(header)).toBe(expected);
  });
});
