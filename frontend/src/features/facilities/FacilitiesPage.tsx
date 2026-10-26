import "./facilities.css";

import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { assetsQuery, scopesQuery } from "@/shared/api/organization";
import type { Asset, Scope } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { formatDate } from "@/shared/lib/format";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { AssetDetail } from "@/shared/ui/assets/AssetDetail";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { ResponsiveTable } from "@/shared/ui/patterns/ResponsiveTable";

/**
 * The Tenant's Scopes and, for the chosen one, its Assets. The chosen Scope and an open
 * Asset are part of the URL: a link from the search opens the same Asset, and the back
 * gesture closes it.
 */
export function FacilitiesPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const opened = (useLocation().state as { facilities?: string } | null)?.facilities === "asset";
  const scopes = combine([useQuery(scopesQuery(tenant, { limit: 100 }))] as const);
  const items = scopes.data?.[0].items ?? [];
  // Critical Facilities first, as everywhere: they carry the legal duties.
  const ordered = items.toSorted(
    (a, b) => Number(b.kind === "critical_facility") - Number(a.kind === "critical_facility"),
  );
  const scope = ordered.find((item) => item.id === params.get("scope")) ?? ordered[0];
  const assetId = params.get("asset");

  // The detail leaves with its URL parameter and takes focus with it; focus returns to
  // the Asset's name in the table.
  const shown = useRef(assetId);
  useEffect(() => {
    const before = shown.current;
    shown.current = assetId;
    if (before && !assetId) {
      // Compared, not put into a selector: the value comes from the URL and may be anything.
      const name = [...document.querySelectorAll<HTMLElement>("[data-asset]")].find(
        (element) => element.dataset.asset === before,
      );
      (name ?? document.querySelector<HTMLElement>(".grc-facility-assets h2"))?.focus();
    }
  }, [assetId]);

  const set = (change: Record<string, string | null>, push = false) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(change)) {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        }
        return next;
      },
      push ? { state: { facilities: "asset" } } : { replace: true },
    );
  };

  return (
    <>
      <PageHeader title={t("nav.facilities")} description={t("facilities.description")} />
      <QueryContent
        query={scopes}
        rows={4}
        isEmpty={([page]) => page.items.length === 0}
        empty={t("facilities.empty")}
      >
        {() => (
          <div className="grc-facilities">
            <ul className="grc-plain-list grc-facility-cards">
              {ordered.map((item) => (
                <li key={item.id}>
                  <ScopeCard
                    scope={item}
                    selected={item.id === scope?.id}
                    onSelect={() => {
                      // The first Scope is the default and stays out of the URL.
                      set({ scope: item.id === ordered[0]?.id ? null : item.id, asset: null });
                    }}
                  />
                </li>
              ))}
            </ul>
            {scope && (
              <AssetList
                tenant={tenant}
                scope={scope}
                onOpen={(id) => {
                  set({ scope: scope.id === ordered[0]?.id ? null : scope.id, asset: id }, true);
                }}
              />
            )}
          </div>
        )}
      </QueryContent>
      {assetId && scope && (
        <AssetDetail
          tenant={tenant}
          scopeId={scope.id}
          assetId={assetId}
          onClose={() => {
            if (opened) {
              void navigate(-1);
            } else {
              set({ asset: null });
            }
          }}
        />
      )}
    </>
  );
}

function ScopeCard({
  scope,
  selected,
  onSelect,
}: {
  scope: Scope;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const facility = scope.critical_facility;
  const headingId = `${scope.id}-name`;

  return (
    <section aria-labelledby={headingId} className="grc-facility-card" data-selected={selected}>
      <h2 id={headingId} className="grc-facility-name">
        {scope.name}
      </h2>
      <p className="grc-meta">{t(`facilities.kinds.${scope.kind}`)}</p>
      {facility && (
        <dl className="grc-facts">
          <dt>{t("facilities.service")}</dt>
          <dd>
            {t(`applicability.services.${facility.critical_service}.name`)} ·{" "}
            {t("facilities.supplied", {
              count: facility.people_supplied,
              people: new Intl.NumberFormat(i18n.language).format(facility.people_supplied),
            })}
          </dd>
          <dt>{t("facilities.location")}</dt>
          <dd>{facility.location}</dd>
          <dt>{t("facilities.registration")}</dt>
          <dd>
            {t(`facilities.registrationStatus.${facility.registration.status}`, {
              date: formatDate(facility.registration.date, i18n.language),
            })}
          </dd>
        </dl>
      )}
      {/* A short visible label; the name says whose Assets, and starts with what is seen. */}
      <Button
        type={selected ? "primary" : "default"}
        className="grc-facility-show"
        aria-pressed={selected}
        aria-label={t("facilities.showAssetsOf", { name: scope.name })}
        onClick={onSelect}
      >
        {t("facilities.showAssets")}
      </Button>
    </section>
  );
}

function AssetList({
  tenant,
  scope,
  onOpen,
}: {
  tenant: string;
  scope: Scope;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const query = combine([useQuery(assetsQuery(tenant, { scope: scope.id, limit: 100 }))] as const);
  const headingId = `${scope.id}-assets`;
  const name = (asset: Asset) => (
    <Button
      type="link"
      className="grc-asset-name"
      data-asset={asset.id}
      onClick={() => {
        onOpen(asset.id);
      }}
    >
      {asset.name}
    </Button>
  );

  return (
    <section aria-labelledby={headingId} className="grc-facility-assets">
      <h2 id={headingId} tabIndex={-1} className="grc-facility-name">
        {t("facilities.assetsOf", { name: scope.name })}
      </h2>
      <QueryContent
        query={query}
        rows={5}
        isEmpty={([page]) => page.items.length === 0}
        empty={t("facilities.noAssets")}
      >
        {([page]) => (
          <ResponsiveTable<Asset>
            label={t("facilities.assetList", { name: scope.name })}
            rows={page.items}
            rowKey={(asset) => asset.id}
            columns={[
              { key: "name", title: t("facilities.asset"), render: (_, asset) => name(asset) },
              {
                key: "kind",
                title: t("facilities.kind"),
                render: (_, asset) => t(`facilities.assetKinds.${asset.kind}`),
              },
              {
                key: "criticality",
                title: t("facilities.criticality"),
                render: (_, asset) => t(`risk.criticality.${asset.criticality}`),
              },
              {
                key: "dependencies",
                title: t("facilities.dependencies"),
                render: (_, asset) =>
                  t("facilities.dependencyCount", { count: asset.depends_on.length }),
              },
            ]}
            renderCard={(asset) => (
              <div className="grc-asset-card">
                {name(asset)}
                <span className="grc-meta">
                  {t(`facilities.assetKinds.${asset.kind}`)} ·{" "}
                  {t(`risk.criticality.${asset.criticality}`)}
                </span>
              </div>
            )}
          />
        )}
      </QueryContent>
    </section>
  );
}
