import "./settings.css";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Radio } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { sessionKey } from "@/shared/api/auth";
import { resourceKey } from "@/shared/api/keys";
import { updateTenantTheme } from "@/shared/api/organization";
import { useCan, useCurrentMembership } from "@/shared/session/sessionContext";
import { COLOR_MODE_PREFERENCES } from "@/shared/theme/colorMode";
import { THEME_NAMES, type ThemeName } from "@/shared/theme/semantic";
import { useColorMode } from "@/shared/theme/themeContext";
import { PageHeader } from "@/shared/ui/PageHeader";

/**
 * The Tenant's Theme, which every member sees, and the user's own light or dark mode.
 * The Theme comes with the session, so after a change the session is fetched again and
 * the whole app takes the new Theme on.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const membership = useCurrentMembership();
  const tenant = membership.tenant.slug;
  const canChange = useCan("change");
  const client = useQueryClient();
  const { preference, setPreference } = useColorMode();
  const [saved, setSaved] = useState("");
  const change = useMutation({
    mutationFn: (theme: ThemeName) => updateTenantTheme(tenant, theme),
    onSuccess: (updated) => {
      setSaved(t("settings.saved", { theme: t(`settings.themes.${updated.theme}.name`) }));
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: sessionKey }),
        client.invalidateQueries({ queryKey: resourceKey(tenant, "tenant") }),
        client.invalidateQueries({ queryKey: resourceKey(tenant, "activity") }),
      ]),
  });
  const theme = change.isPending ? change.variables : membership.tenant.theme;

  return (
    <>
      <PageHeader title={t("nav.settings")} description={t("settings.description")} />
      <div className="grc-settings">
        <section aria-labelledby="settings-theme" className="grc-settings-panel">
          <h2 id="settings-theme" className="grc-settings-title">
            {t("settings.theme")}
          </h2>
          <p className="grc-meta">{t("settings.themeHint")}</p>
          <Radio.Group
            name="tenant-theme"
            className="grc-settings-options"
            value={theme}
            disabled={!canChange || change.isPending}
            onChange={(event) => {
              change.mutate(event.target.value as ThemeName);
            }}
            options={THEME_NAMES.map((name) => ({
              value: name,
              label: (
                <span className="grc-settings-option">
                  {t(`settings.themes.${name}.name`)}
                  <span className="grc-meta">{t(`settings.themes.${name}.description`)}</span>
                </span>
              ),
            }))}
          />
          {!canChange && <p className="grc-meta">{t("settings.readOnly")}</p>}
          {change.isError && <Alert type="error" showIcon title={t("settings.failed")} />}
          <p role="status" className="grc-visually-hidden">
            {saved}
          </p>
        </section>
        <section aria-labelledby="settings-mode" className="grc-settings-panel">
          <h2 id="settings-mode" className="grc-settings-title">
            {t("settings.colorMode")}
          </h2>
          <p className="grc-meta">{t("settings.colorModeHint")}</p>
          <Radio.Group
            name="color-mode"
            className="grc-settings-options"
            value={preference}
            onChange={(event) => {
              setPreference(event.target.value as typeof preference);
            }}
            options={COLOR_MODE_PREFERENCES.map((mode) => ({
              value: mode,
              label: t(`shell.colorModes.${mode}`),
            }))}
          />
        </section>
      </div>
    </>
  );
}
