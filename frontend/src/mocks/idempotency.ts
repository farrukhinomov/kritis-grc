import { HttpResponse, type JsonBodyType } from "msw";

import type { TenantData } from "./db";
import { canonicalJson, problem } from "./http";

/**
 * The Idempotency-Key handling of every creating POST, as the backend does it: an exact
 * retry gets the first answer again, and the same key with another body is refused.
 */
export function idempotency(data: TenantData, request: Request, body: unknown) {
  const key = request.headers.get("Idempotency-Key");
  const fingerprint = `POST ${new URL(request.url).pathname} ${canonicalJson(body)}`;
  const stored = key === null ? undefined : data.idempotency.get(key);
  const replay = stored
    ? stored.fingerprint === fingerprint
      ? HttpResponse.json(stored.body, {
          status: stored.status,
          headers: { "Idempotent-Replayed": "true" },
        })
      : problem(422, "idempotency_key_reused", "This key was already used for another request.")
    : null;
  return {
    replay,
    remember: (status: number, responseBody: JsonBodyType) => {
      if (key !== null) {
        data.idempotency.set(key, { status, body: responseBody, fingerprint });
      }
    },
  };
}
