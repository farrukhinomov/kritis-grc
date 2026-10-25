import "./shell/shell.css";

import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router";

import { sessionQuery } from "@/shared/api/auth";
import { LOGIN_PATH } from "@/shared/session/paths";
import { LanguageSwitch } from "@/shared/ui/LanguageSwitch";

import { MAIN_CONTENT_ID } from "./RootLayout";

/** Pages outside any Tenant: system status, sign-in and not-found. */
export function PublicLayout({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="grc-shell">
      <div className="grc-shell-column">
        <header className="grc-shell-header">
          <span className="grc-shell-brand-mark" aria-hidden>
            GRC
          </span>
          <span className="grc-shell-tenant-name">{t("app.name")}</span>
          <span className="grc-shell-header-spacer" />
          <LanguageSwitch />
          <EntryButton />
        </header>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="grc-shell-main" data-narrow>
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

/** Decided at build time, like the mock API itself. */
const SHOWS_DEMO_DATA = import.meta.env.VITE_API_MOCKING === "enabled";

/** Into the app: straight to the first Tenant when signed in, else to the login page. */
function EntryButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: session, isPending } = useQuery(sessionQuery);
  const first = session?.memberships[0];

  if (first) {
    return (
      <Button type="primary" onClick={() => void navigate(`/t/${first.tenant.slug}`)}>
        {t(SHOWS_DEMO_DATA ? "app.openDemo" : "app.openApp")}
      </Button>
    );
  }
  if (isPending || pathname === LOGIN_PATH) {
    return null;
  }
  return (
    <Button type="primary" onClick={() => void navigate(LOGIN_PATH)}>
      {t("auth.signIn")}
    </Button>
  );
}
