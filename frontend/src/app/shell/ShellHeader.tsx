import { Select, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";

import { useCan, useSession } from "@/shared/session/sessionContext";
import type { Membership } from "@/shared/session/session";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";
import { LanguageSwitch } from "@/shared/ui/LanguageSwitch";

import { screenOf } from "./navigation";
import { UserMenu } from "./UserMenu";

/** Decided at build time, like the mock API itself. */
const SHOWS_DEMO_DATA = import.meta.env.VITE_API_MOCKING === "enabled";

/** Apple keyboards say Cmd where the others say Ctrl. */
const APPLE = /Mac|iPhone|iPad/.test(globalThis.navigator.userAgent);

interface ShellHeaderProps {
  membership: Membership;
  wide: boolean;
  onSearch: () => void;
}

export function ShellHeader({ membership, wide, onSearch }: ShellHeaderProps) {
  const { t } = useTranslation();
  const readOnly = !useCan("change");

  return (
    <header className="grc-shell-header">
      {!wide && (
        <span className="grc-shell-brand-mark" aria-hidden>
          GRC
        </span>
      )}
      <TenantSwitcher current={membership} />
      {/* Phones have no keyboard shortcut, so the search needs its button there most. */}
      <button
        type="button"
        className="grc-shell-search"
        aria-label={wide ? undefined : t("search.label")}
        aria-keyshortcuts={APPLE ? "Meta+K" : "Control+K"}
        onClick={onSearch}
      >
        <AnimatedIcon preset="search" />
        {wide && (
          <>
            <span>{t("search.label")}</span>
            <kbd className="grc-shell-search-key">
              {t(APPLE ? "search.keyApple" : "search.key")}
            </kbd>
          </>
        )}
      </button>
      <span className="grc-shell-header-spacer" />
      {SHOWS_DEMO_DATA && (
        <span className="grc-shell-prototype-badge">
          {t(wide ? "app.prototypeBadge" : "app.prototypeBadgeShort")}
        </span>
      )}
      {/* Says up front why no edit controls appear, instead of leaving users to wonder.
          A button, so keyboard and touch users can reach the explanation too. */}
      {readOnly && (
        <Tooltip title={t("shell.readOnlyHint")} trigger={["hover", "focus"]}>
          <button type="button" className="grc-shell-read-only-badge">
            {t(wide ? "shell.readOnly" : "shell.readOnlyShort")}
          </button>
        </Tooltip>
      )}
      {wide && <LanguageSwitch />}
      <UserMenu role={membership.role} includeLanguage={!wide} showName={wide} />
    </header>
  );
}

/**
 * Switching Tenants keeps the user on the same screen, so comparing two organizations
 * is one click instead of a trip through the navigation. Only the screen carries over:
 * an object ID from one Tenant means nothing in another and must not leak into its URL.
 */
function TenantSwitcher({ current }: { current: Membership }) {
  const { t } = useTranslation();
  const { memberships } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (memberships.length < 2) {
    return <span className="grc-shell-tenant-name">{current.tenant.name}</span>;
  }

  return (
    <Select
      className="grc-shell-tenant-switcher"
      aria-label={t("shell.tenantSwitcher")}
      value={current.tenant.slug}
      prefix={<AnimatedIcon preset="tenant" />}
      popupMatchSelectWidth={false}
      options={memberships.map(({ tenant }) => ({ value: tenant.slug, label: tenant.name }))}
      onChange={(slug: string) => {
        void navigate(`/t/${slug}/${screenOf(pathname) ?? ""}`);
      }}
    />
  );
}
