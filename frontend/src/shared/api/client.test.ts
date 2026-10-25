import { http, HttpResponse } from "msw";

import { server } from "@/mocks/server";

import { ApiError, apiGet } from "./client";

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
