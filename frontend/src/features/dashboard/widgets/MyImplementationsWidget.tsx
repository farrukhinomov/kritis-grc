import { useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { implementationsQuery, requirementQuery } from "@/shared/api/compliance";
import { scopeQuery } from "@/shared/api/organization";
import type { Implementation, Requirement, Scope } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership, useSession } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { StatusBadge } from "@/shared/ui/StatusBadge/StatusBadge";

import { formatDate } from "@/shared/lib/format";

const SHOWN = 5;

export function MyImplementationsWidget() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const { user } = useSession();
  const query = combine([
    useQuery(
      implementationsQuery(tenant, {
        owner: user.id,
        status: ["open", "partial"],
        ordering: "due_date",
        limit: SHOWN,
      }),
    ),
  ] as const);

  return (
    <QueryContent
      query={query}
      rows={5}
      isEmpty={([implementations]) => implementations.items.length === 0}
      empty={t("dashboard.mine.empty")}
    >
      {([implementations]) => (
        <>
          <ImplementationList tenant={tenant} implementations={implementations.items} />
          {implementations.page.total > implementations.items.length && (
            <p className="grc-widget-note">
              {t("dashboard.mine.more", {
                shown: implementations.items.length,
                total: implementations.page.total,
              })}
            </p>
          )}
        </>
      )}
    </QueryContent>
  );
}

/**
 * Names are looked up one by one: five rows need at most five Requirements and two
 * Scopes, and fetching whole lists would silently miss entries beyond the first page.
 */
function ImplementationList({
  tenant,
  implementations,
}: {
  tenant: string;
  implementations: Implementation[];
}) {
  const requirements = useQueries({
    queries: [...new Set(implementations.map((i) => i.requirement_id))].map((id) =>
      requirementQuery(tenant, id),
    ),
  });
  const scopes = useQueries({
    queries: [...new Set(implementations.map((i) => i.scope_id))].map((id) =>
      scopeQuery(tenant, id),
    ),
  });
  const requirement = (id: string) => requirements.find((result) => result.data?.id === id)?.data;
  const scope = (id: string) => scopes.find((result) => result.data?.id === id)?.data;

  return (
    <ul className="grc-widget-list">
      {implementations.map((implementation) => (
        <ImplementationRow
          key={implementation.id}
          implementation={implementation}
          requirement={requirement(implementation.requirement_id)}
          scope={scope(implementation.scope_id)}
        />
      ))}
    </ul>
  );
}

function ImplementationRow({
  implementation,
  requirement,
  scope,
}: {
  implementation: Implementation;
  requirement: Requirement | undefined;
  scope: Scope | undefined;
}) {
  const { t, i18n } = useTranslation();

  return (
    <li className="grc-widget-row">
      <span>
        <strong>{requirement?.citation}</strong>{" "}
        {i18n.language === "en" ? requirement?.title_en : requirement?.title_de}
        <br />
        <span className="grc-widget-muted">
          {scope?.name}
          {implementation.due_date &&
            ` · ${t("dashboard.mine.due", { date: formatDate(implementation.due_date, i18n.language) })}`}
        </span>
      </span>
      <StatusBadge status={implementation.status} />
    </li>
  );
}
