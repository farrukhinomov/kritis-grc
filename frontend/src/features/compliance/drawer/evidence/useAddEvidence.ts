import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addEvidence, evidenceQuery } from "@/shared/api/compliance";
import { resourceKey } from "@/shared/api/keys";
import type { NewEvidence } from "@/shared/api/types";

/** Where new Evidence goes: one Implementation of one Tenant. */
export interface EvidenceTarget {
  tenant: string;
  implementationId: string;
}

/** The list and the history both show the change, so both are fetched anew. */
export function useRefreshEvidence({ tenant, implementationId }: EvidenceTarget) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: evidenceQuery(tenant, implementationId).queryKey }),
      client.invalidateQueries({ queryKey: resourceKey(tenant, "activity") }),
    ]);
}

/**
 * Each form and suggestion has its own save, so one's spinner or error never shows on
 * another, and its success handling runs even if the user has moved on meanwhile.
 */
export function useAddEvidence(target: EvidenceTarget, onSaved: () => void) {
  const refresh = useRefreshEvidence(target);
  return useMutation({
    mutationFn: ({ evidence, key }: { evidence: NewEvidence; key: string }) =>
      addEvidence(target.tenant, target.implementationId, evidence, key),
    onSuccess: onSaved,
    onSettled: refresh,
  });
}
