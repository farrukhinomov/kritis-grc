import "./shell.css";

import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router";

import { ROOMY_SCREEN_QUERY, useIsWideScreen } from "@/shared/lib/breakpoints";
import { useMediaQuery } from "@/shared/lib/useMediaQuery";
import { MembershipContext, useMembership } from "@/shared/session/sessionContext";
import { DEFAULT_THEME } from "@/shared/theme/semantic";
import { useTenantTheme } from "@/shared/theme/themeContext";

import { MAIN_CONTENT_ID } from "../RootLayout";
import { BottomTabBar } from "./BottomTabBar";
import { CommandPalette } from "./palette/CommandPalette";
import { isSearchShortcut } from "./palette/shortcut";
import { ShellHeader } from "./ShellHeader";
import { SideNav } from "./SideNav";
import { UnknownTenant } from "./UnknownTenant";

/** The frame around every page of a Tenant, in that Tenant's Theme. */
export function TenantShell() {
  const { tenantSlug } = useParams();
  const membership = useMembership(tenantSlug);
  const wide = useIsWideScreen();
  const roomy = useMediaQuery(ROOMY_SCREEN_QUERY);
  const [collapsedByUser, setCollapsedByUser] = useState<boolean | null>(null);
  const [searching, setSearching] = useState(false);
  useTenantTheme(membership?.tenant.theme ?? DEFAULT_THEME);

  const [searchTenant, setSearchTenant] = useState(tenantSlug);

  // Another Tenant's palette would search the wrong data; switching Tenants closes it.
  if (searchTenant !== tenantSlug) {
    setSearchTenant(tenantSlug);
    setSearching(false);
  }

  // The shortcut opens the search from anywhere, even from a text field, as in most
  // tools, but never over another dialog: choosing a page would throw its work away.
  const known = membership !== undefined;
  useEffect(() => {
    if (!known) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isSearchShortcut(event) && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [known]);

  if (!membership) {
    return <UnknownTenant />;
  }

  const collapsed = collapsedByUser ?? !roomy;

  return (
    <MembershipContext value={membership}>
      <div className="grc-shell">
        {wide && (
          <SideNav
            collapsed={collapsed}
            onToggle={() => {
              setCollapsedByUser(!collapsed);
            }}
          />
        )}
        <div className="grc-shell-column">
          <ShellHeader
            membership={membership}
            wide={wide}
            onSearch={() => {
              setSearching(true);
            }}
          />
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="grc-shell-main">
            <Outlet />
          </main>
        </div>
        {!wide && <BottomTabBar />}
      </div>
      <CommandPalette
        open={searching}
        onClose={() => {
          setSearching(false);
        }}
      />
    </MembershipContext>
  );
}
