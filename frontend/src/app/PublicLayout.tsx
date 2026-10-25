import "./shell/shell.css";

import { Button } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router";

import { useSession } from "@/shared/session/sessionContext";
import { LanguageSwitch } from "@/shared/ui/LanguageSwitch";

import { MAIN_CONTENT_ID } from "./RootLayout";

/** Pages outside any Tenant: system status, not-found, and later sign-in. */
export function PublicLayout({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [first] = useSession().memberships;

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
          {first && (
            <Button type="primary" onClick={() => void navigate(`/t/${first.tenant.slug}`)}>
              {t("app.openDemo")}
            </Button>
          )}
        </header>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="grc-shell-main" data-narrow>
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
