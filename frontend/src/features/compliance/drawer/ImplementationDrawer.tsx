import "./drawer.css";

import { useQuery } from "@tanstack/react-query";
import { Tabs } from "antd";
import { useTranslation } from "react-i18next";

import { implementationQuery } from "@/shared/api/compliance";
import type { Implementation, Requirement } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { ResponsiveDrawer } from "@/shared/ui/patterns/ResponsiveDrawer";

import { PANELS, type Panel } from "../useCockpitPlace";
import { EvidencePanel } from "./EvidencePanel";
import { HistoryPanel } from "./HistoryPanel";
import { StatusPanel } from "./StatusPanel";

interface ImplementationDrawerProps {
  tenant: string;
  /** From the cockpit's list; the drawer fetches the current version itself. */
  implementation: Implementation;
  requirement: Requirement;
  scopeName: string;
  panel: Panel;
  onPanel: (panel: Panel) => void;
  onClose: () => void;
}

/**
 * Everything about one Implementation that changes it or proves it: the status, the
 * Evidence and the history. A side drawer next to the cockpit on wide screens, a bottom
 * sheet on phones.
 */
export function ImplementationDrawer({
  tenant,
  implementation,
  requirement,
  scopeName,
  panel,
  onPanel,
  onClose,
}: ImplementationDrawerProps) {
  const { t } = useTranslation();
  // Writes need the version the server has now, not the one the list was loaded with.
  const query = combine([
    useQuery({
      ...implementationQuery(tenant, implementation.id),
      placeholderData: implementation,
    }),
  ] as const);

  return (
    <ResponsiveDrawer
      open
      onClose={onClose}
      title={
        <span className="grc-drawer-title">
          <strong>{requirement.citation}</strong> · {scopeName}
        </span>
      }
    >
      <QueryContent query={query} rows={4} isEmpty={() => false} empty="">
        {([current]) => (
          <Tabs
            activeKey={panel}
            onChange={(key) => {
              const next = PANELS.find((option) => option === key);
              if (next) {
                onPanel(next);
              }
            }}
            items={[
              {
                key: "status",
                label: t("drawer.tabs.status"),
                children: <StatusPanel tenant={tenant} implementation={current} />,
              },
              {
                key: "evidence",
                label: t("drawer.tabs.evidence"),
                children: (
                  <EvidencePanel
                    tenant={tenant}
                    implementation={current}
                    requirement={requirement}
                  />
                ),
              },
              {
                key: "history",
                label: t("drawer.tabs.history"),
                children: <HistoryPanel tenant={tenant} implementationId={current.id} />,
              },
            ]}
          />
        )}
      </QueryContent>
    </ResponsiveDrawer>
  );
}
