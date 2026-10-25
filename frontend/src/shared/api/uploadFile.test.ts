import { uploadFile } from "./compliance";
import type { UploadSlot } from "./types";

const slot: UploadSlot = { upload_id: "up-1", upload_url: "/storage/up-1", expires_at: "" };
const file = new File(["%PDF-1.7"], "plan.pdf", { type: "application/pdf" });

/** A stand-in for XMLHttpRequest that lets the test play the upload's events. */
class FakeRequest {
  static last: FakeRequest | undefined;
  status = 0;
  responseText = "";
  sent = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  headers: Record<string, string> = {};
  constructor() {
    FakeRequest.last = this;
  }
  open() {
    // The URL and method are not under test.
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send() {
    this.sent = true;
  }
  abort() {
    this.onabort?.();
  }
}

beforeEach(() => {
  FakeRequest.last = undefined;
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadFile", () => {
  it("reports progress as the browser sends the file", async () => {
    const progress: number[] = [];
    const done = uploadFile(slot, file, (fraction) => progress.push(fraction));
    const request = FakeRequest.last!;

    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 25,
      total: 100,
    } as ProgressEvent);
    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 75,
      total: 100,
    } as ProgressEvent);
    request.status = 200;
    request.onload?.();
    await done;

    expect(progress).toEqual([0.25, 0.75, 1]);
    expect(request.headers["Content-Type"]).toBe("application/pdf");
  });

  it("sends nothing when cancelled before it started", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(uploadFile(slot, file, () => undefined, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(FakeRequest.last).toBeUndefined();
  });

  it("stops sending when cancelled during the upload", async () => {
    const controller = new AbortController();
    const done = uploadFile(slot, file, () => undefined, controller.signal);

    controller.abort();

    await expect(done).rejects.toMatchObject({ name: "AbortError" });
  });

  it("turns a storage error into an ApiError with its code", async () => {
    const done = uploadFile(slot, file, () => undefined);
    const request = FakeRequest.last!;
    request.status = 403;
    request.responseText = JSON.stringify({ code: "upload_expired", detail: "Expired." });

    request.onload?.();

    await expect(done).rejects.toMatchObject({ status: 403, code: "upload_expired" });
  });
});
