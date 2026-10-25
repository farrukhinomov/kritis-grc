import { useQuery } from "@tanstack/react-query";
import { Tag } from "antd";
import { useTranslation } from "react-i18next";

import { implementationsQuery, requirementsQuery } from "@/shared/api/compliance";
import { scopesQuery } from "@/shared/api/organization";
import { useCurrentMembership, useSession } from "@/shared/session/sessionContext";

import { formatDate } from "../format";
import { combine } from "../combine";
import { WidgetContent } from "../Widget";

const SHOWN = 5;

export function MyImplementationsWidget() {
  const { t, i18n } = useTranslation();
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
    useQuery(requirementsQuery(tenant, { limit: 100 })),
    useQuery(scopesQuery(tenant, { limit: 100 })),
  ] as const);

  return (
    <WidgetContent
      query={query}
      rows={5}
      isEmpty={([implementations]) => implementations.items.length === 0}
      empty={t("dashboard.mine.empty")}
    >
      {([implementations, requirements, scopes]) => (
        <>
          <ul className="grc-widget-list">
            {implementations.items.map((implementation) => {
              const requirement = requirements.items.find(
                (item) => item.id === implementation.requirement_id,
              );
              const scope = scopes.items.find((item) => item.id === implementation.scope_id);
              return (
                <li key={implementation.id} className="grc-widget-row">
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
                  <Tag>{t(`dashboard.statuses.${implementation.status}`)}</Tag>
                </li>
              );
            })}
          </ul>
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
    </WidgetContent>
  );
}
