import "./shell.css";

import { useState } from "react";
import { Outlet, useParams } from "react-router";

import { ROOMY_SCREEN_QUERY, useIsWideScreen } from "@/shared/lib/breakpoints";
import { useMediaQuery } from "@/shared/lib/useMediaQuery";
import { MembershipContext, useMembership } from "@/shared/session/sessionContext";
import { DEFAULT_THEME } from "@/shared/theme/semantic";
import { useTenantTheme } from "@/shared/theme/themeContext";

import { MAIN_CONTENT_ID } from "../RootLayout";
import { BottomTabBar } from "./BottomTabBar";
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
  useTenantTheme(membership?.tenant.theme ?? DEFAULT_THEME);

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
          <ShellHeader membership={membership} wide={wide} />
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="grc-shell-main">
            <Outlet />
          </main>
        </div>
        {!wide && <BottomTabBar />}
      </div>
    </MembershipContext>
  );
}
