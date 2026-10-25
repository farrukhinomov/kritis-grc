import { tenantData } from "./db";
import { parseIfMatch, validateChange, validateEvidence } from "./validation";

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

describe("validateEvidence", () => {
  const file = { name: "plan.pdf", size_bytes: 1024, content_type: "application/pdf" };

  it.each([
    ["a link", { kind: "link", title: "Bericht", url: "https://example.org" }],
    ["a file", { kind: "file", title: "Plan", file }],
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
    ["a missing file", { kind: "file", title: "T" }, "file", "required"],
    [
      "an empty file",
      { kind: "file", title: "T", file: { ...file, size_bytes: 0 } },
      "file",
      "invalid_size",
    ],
    [
      "an oversized file",
      { kind: "file", title: "T", file: { ...file, size_bytes: 26 * 1024 * 1024 } },
      "file",
      "invalid_size",
    ],
    [
      "an unsupported file type",
      { kind: "file", title: "T", file: { ...file, content_type: "text/html" } },
      "file",
      "unsupported_type",
    ],
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
