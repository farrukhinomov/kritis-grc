import { QueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/shared/api/client";
import { addEvidence, evidenceQuery, requestUpload, uploadFile } from "@/shared/api/compliance";

import { SEED } from "./seed";

/**
 * Evidence files go straight to storage: the API issues a short-lived upload URL, the
 * browser PUTs the file there, and the Evidence is created with the upload's ID, which
 * is when the server checks the stored file again.
 */

const DEMO = "muster-stadtwerke";
const IMPLEMENTATION = SEED.implementations[0]!.id;
const PDF = "application/pdf";
const MB = 1024 * 1024;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);
const pdf = (bytes: number) => new File([new Uint8Array(bytes)], "plan.pdf", { type: PDF });

describe("upload slots", () => {
  it("are issued for an allowed file with a short expiry", async () => {
    const slot = await requestUpload(DEMO, {
      name: "plan.pdf",
      size_bytes: 2048,
      content_type: PDF,
    });

    expect(slot.upload_id).toEqual(expect.any(String));
    expect(slot.upload_url).toEqual(expect.any(String));
    const minutes = (Date.parse(slot.expires_at) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(4);
    expect(minutes).toBeLessThanOrEqual(5);
  });

  it.each([
    ["larger than 20 MB", { size_bytes: 20 * MB + 1, content_type: PDF }, "invalid_size"],
    ["empty", { size_bytes: 0, content_type: PDF }, "invalid_size"],
    [
      "of a type that isn't allowed",
      { size_bytes: 10, content_type: "text/html" },
      "unsupported_type",
    ],
  ])("are refused for a file %s", async (_, file, code) => {
    const error = await failure(requestUpload(DEMO, { name: "x", ...file }));

    expect(error).toMatchObject({
      status: 422,
      code: "validation_error",
      errors: [{ field: "file", code }],
    });
  });

  it("are issued for exactly 20 MB", async () => {
    const slot = await requestUpload(DEMO, {
      name: "big.pdf",
      size_bytes: 20 * MB,
      content_type: PDF,
    });

    expect(slot.upload_id).not.toBe("");
  });

  it("are refused for an Auditor, like every write", async () => {
    const { setMockSession } = await import("./accounts");
    setMockSession("auditor");

    const error = await failure(
      requestUpload(DEMO, { name: "plan.pdf", size_bytes: 10, content_type: PDF }),
    );

    expect(error).toMatchObject({ status: 403, code: "permission_denied" });
  });
});

describe("file Evidence", () => {
  async function uploaded(file: File) {
    const slot = await requestUpload(DEMO, {
      name: file.name,
      size_bytes: file.size,
      content_type: file.type,
    });
    const progress: number[] = [];
    await uploadFile(slot, file, (fraction) => progress.push(fraction));
    return { slot, progress };
  }

  it("is created from a finished upload and carries the file's details", async () => {
    const { slot, progress } = await uploaded(pdf(4096));

    const evidence = await addEvidence(
      DEMO,
      IMPLEMENTATION,
      { kind: "file", title: "Notfallplan", upload_id: slot.upload_id },
      crypto.randomUUID(),
    );

    expect(progress.at(-1)).toBe(1);
    expect(evidence).toMatchObject({
      kind: "file",
      file: { name: "plan.pdf", size_bytes: 4096, content_type: PDF },
    });
    const list = await client().query(evidenceQuery(DEMO, IMPLEMENTATION));
    expect(list.items.map((item) => item.id)).toContain(evidence.id);
  });

  it("can't be created before the file arrived in storage", async () => {
    const slot = await requestUpload(DEMO, { name: "plan.pdf", size_bytes: 10, content_type: PDF });

    const error = await failure(
      addEvidence(
        DEMO,
        IMPLEMENTATION,
        { kind: "file", title: "T", upload_id: slot.upload_id },
        crypto.randomUUID(),
      ),
    );

    expect(error).toMatchObject({
      status: 422,
      errors: [{ field: "upload_id", code: "not_uploaded" }],
    });
  });

  it("is refused when the stored file differs from what was announced", async () => {
    const slot = await requestUpload(DEMO, { name: "plan.pdf", size_bytes: 10, content_type: PDF });
    await uploadFile(slot, pdf(20), () => undefined);

    const error = await failure(
      addEvidence(
        DEMO,
        IMPLEMENTATION,
        { kind: "file", title: "T", upload_id: slot.upload_id },
        crypto.randomUUID(),
      ),
    );

    expect(error).toMatchObject({
      status: 422,
      errors: [{ field: "upload_id", code: "size_mismatch" }],
    });
  });

  it("uses an upload only once", async () => {
    const { slot } = await uploaded(pdf(10));
    const evidence = { kind: "file" as const, title: "T", upload_id: slot.upload_id };
    await addEvidence(DEMO, IMPLEMENTATION, evidence, crypto.randomUUID());

    const error = await failure(addEvidence(DEMO, IMPLEMENTATION, evidence, crypto.randomUUID()));

    expect(error).toMatchObject({
      status: 422,
      errors: [{ field: "upload_id", code: "invalid_choice" }],
    });
  });

  it("refuses an upload URL that has expired", async () => {
    const slot = await requestUpload(DEMO, { name: "plan.pdf", size_bytes: 10, content_type: PDF });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);

    const error = await failure(uploadFile(slot, pdf(10), () => undefined));
    vi.useRealTimers();

    expect(error).toMatchObject({ status: 403, code: "upload_expired" });
  });
});

describe("the Tenant Mappings", () => {
  it("include a full one, so a NIS2 Implementation can serve as Evidence", async () => {
    const page = await apiRequest<{ items: { kind: string; coverage: string }[] }>(
      `/api/v1/tenants/${DEMO}/mappings?target_requirement=req-k-13-3-5`,
      { method: "GET" },
    );

    expect(page.items).toContainEqual(
      expect.objectContaining({ kind: "tenant", coverage: "full" }),
    );
  });
});
