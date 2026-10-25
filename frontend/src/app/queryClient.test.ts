import { ApiError } from "@/shared/api/client";

import { shouldRetry } from "./queryClient";

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
