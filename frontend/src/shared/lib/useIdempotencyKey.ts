import { useRef } from "react";

/**
 * One key per payload: a retry of exactly the same request after a lost response sends
 * the same key, and the server answers it without creating anything twice. A changed payload is
 * a new action and needs a new key, or the server would refuse it as a reused key.
 */
export function useIdempotencyKey() {
  const key = useRef(crypto.randomUUID());
  const sent = useRef<string | null>(null);
  return {
    current: () => key.current,
    renew: () => {
      key.current = crypto.randomUUID();
      sent.current = null;
    },
    /**
     * The key for this payload: the same as last time for an identical payload, a new one
     * as soon as anything that is sent differs. Edits that change nothing sent, such as a
     * space trimmed away, keep the retry a retry.
     */
    forPayload: (payload: unknown) => {
      const fingerprint = JSON.stringify(payload);
      if (sent.current !== null && sent.current !== fingerprint) {
        key.current = crypto.randomUUID();
      }
      sent.current = fingerprint;
      return key.current;
    },
  };
}
