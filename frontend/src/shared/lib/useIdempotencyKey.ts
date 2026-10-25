import { useRef } from "react";

/**
 * One key per payload: a retry of exactly the same request after a lost response sends
 * the same key, and the server answers it without creating anything twice. A changed payload is
 * a new action and needs a new key, or the server would refuse it as a reused key.
 */
export function useIdempotencyKey() {
  const key = useRef(crypto.randomUUID());
  return {
    current: () => key.current,
    renew: () => {
      key.current = crypto.randomUUID();
    },
  };
}
