import { sessionKey } from "@/shared/api/auth";
import { ApiError } from "@/shared/api/client";

import { createQueryClient, shouldRetry } from "./queryClient";

describe("shouldRetry", () => {
  it("retries a server error once", () => {
    const error = new ApiError(503, "unavailable", "");

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it("retries a network failure once", () => {
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
  });

  it.each([400, 401, 403, 404, 409])("never retries a %i client error", (status) => {
    expect(shouldRetry(0, new ApiError(status, "x", ""))).toBe(false);
  });
});

describe("an expired session", () => {
  const session = { user: { id: "u", display_name: "U", email: "u@example.com" }, memberships: [] };

  it("is forgotten when any query answers 401", async () => {
    const client = createQueryClient();
    client.setQueryData(sessionKey, session);

    await client
      .query({
        queryKey: ["tenants", "x", "anything"],
        queryFn: () => Promise.reject(new ApiError(401, "not_authenticated", "")),
      })
      .catch(() => undefined);

    expect(client.getQueryData(sessionKey)).toBeNull();
  });

  it("is forgotten when any mutation answers 401", async () => {
    const client = createQueryClient();
    client.setQueryData(sessionKey, session);

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(new ApiError(401, "not_authenticated", "")),
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(client.getQueryData(sessionKey)).toBeNull();
  });

  it("is kept on other errors", async () => {
    const client = createQueryClient();
    client.setQueryData(sessionKey, session);

    await client
      .query({
        queryKey: ["tenants", "x", "anything"],
        queryFn: () => Promise.reject(new ApiError(403, "permission_denied", "")),
      })
      .catch(() => undefined);

    expect(client.getQueryData(sessionKey)).toEqual(session);
  });
});
