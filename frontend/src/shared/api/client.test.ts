import { http, HttpResponse } from "msw";

import { server } from "@/mocks/server";

import { ApiError, apiGet, apiRequest, tenantPath } from "./client";

describe("apiGet", () => {
  it("returns the parsed JSON body on success", async () => {
    server.use(http.get("/api/v1/things", () => HttpResponse.json({ answer: 42 })));

    await expect(apiGet<{ answer: number }>("/api/v1/things")).resolves.toEqual({ answer: 42 });
  });

  it("turns a Problem Details response into an ApiError with its stable code", async () => {
    server.use(
      http.get("/api/v1/things", () =>
        HttpResponse.json(
          { status: 409, code: "version_conflict", detail: "Changed by someone else." },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await apiGet("/api/v1/things").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "version_conflict" });
  });

  it("falls back to a generic code when the error body is not Problem Details", async () => {
    server.use(http.get("/api/v1/things", () => new HttpResponse("Bad gateway", { status: 502 })));

    await expect(apiGet("/api/v1/things")).rejects.toMatchObject({
      status: 502,
      code: "http_error",
    });
  });

  it("reports a successful response that isn't JSON as an invalid response", async () => {
    // What a missing proxy rule looks like: the SPA's index.html served with 200.
    server.use(
      http.get(
        "/api/v1/things",
        () => new HttpResponse("<!doctype html>", { headers: { "Content-Type": "text/html" } }),
      ),
    );

    await expect(apiGet("/api/v1/things")).rejects.toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });
});

describe("apiRequest", () => {
  it("sends a JSON body with the concurrency and idempotency headers", async () => {
    let seen: { body: unknown; ifMatch: string | null; key: string | null; type: string | null } = {
      body: null,
      ifMatch: null,
      key: null,
      type: null,
    };
    server.use(
      http.patch("/api/v1/things/1", async ({ request }) => {
        seen = {
          body: await request.json(),
          ifMatch: request.headers.get("If-Match"),
          key: request.headers.get("Idempotency-Key"),
          type: request.headers.get("Content-Type"),
        };
        return HttpResponse.json({ id: "1", version: 4 });
      }),
    );

    const result = await apiRequest<{ version: number }>("/api/v1/things/1", {
      method: "PATCH",
      body: { status: "implemented" },
      ifMatch: 3,
      idempotencyKey: "key-1",
    });

    expect(result).toEqual({ id: "1", version: 4 });
    expect(seen).toEqual({
      body: { status: "implemented" },
      ifMatch: '"3"',
      key: "key-1",
      type: "application/json",
    });
  });

  it("returns undefined for a response without content", async () => {
    server.use(http.delete("/api/v1/things/1", () => new HttpResponse(null, { status: 204 })));

    await expect(apiRequest("/api/v1/things/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("keeps the field-level errors of a validation problem", async () => {
    server.use(
      http.post("/api/v1/things", () =>
        HttpResponse.json(
          {
            status: 422,
            code: "validation_error",
            detail: "Invalid input.",
            errors: [{ field: "url", code: "invalid_url" }, { nonsense: true }],
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await apiRequest("/api/v1/things", { method: "POST", body: {} }).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({
      code: "validation_error",
      errors: [{ field: "url", code: "invalid_url" }],
    });
  });
});

describe("tenantPath", () => {
  it("builds tenant URLs and escapes every segment", () => {
    expect(tenantPath("muster-stadtwerke", ["implementations", "im 1/2"])).toBe(
      "/api/v1/tenants/muster-stadtwerke/implementations/im%201%2F2",
    );
  });

  it("adds only the query parameters that are set", () => {
    expect(tenantPath("t", ["risks"], { scope: "sc-nord", page: 2, status: undefined })).toBe(
      "/api/v1/tenants/t/risks?scope=sc-nord&page=2",
    );
  });
});
