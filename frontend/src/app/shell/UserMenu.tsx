import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Dropdown, type MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { logout } from "@/shared/api/auth";
import { ApiError } from "@/shared/api/client";

import { currentLanguage, SUPPORTED_LANGUAGES } from "@/shared/i18n";
import { LOGIN_PATH } from "@/shared/session/paths";
import { useSession } from "@/shared/session/sessionContext";
import type { Role } from "@/shared/session/session";
import { COLOR_MODE_PREFERENCES, type ColorModePreference } from "@/shared/theme/colorMode";
import { useColorMode } from "@/shared/theme/themeContext";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";
import type { IconPreset } from "@/shared/ui/AnimatedIcon/presets";
import { useSelectLanguage } from "@/shared/ui/useSelectLanguage";

const MODE_ICONS: Record<ColorModePreference, IconPreset> = {
  light: "lightMode",
  dark: "darkMode",
  system: "systemMode",
};

const MODE_KEY = "mode:";
const LANGUAGE_KEY = "language:";
const LOGOUT_KEY = "logout";
const UNAUTHORIZED = 401;

interface UserMenuProps {
  role: Role;
  /** On phones the language switch moves from the header into this menu. */
  includeLanguage: boolean;
  showName: boolean;
}

/** Who is signed in, in which role, and the per-user display choices. */
export function UserMenu({ role, includeLanguage, showName }: UserMenuProps) {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const { preference, setPreference } = useColorMode();
  const language = currentLanguage(i18n.resolvedLanguage);
  const signOut = useSignOut();
  const switchTo = useSelectLanguage();

  const items: MenuProps["items"] = [
    {
      key: "identity",
      type: "group",
      label: (
        <>
          <strong>{user.display_name}</strong>
          <br />
          {t(`shell.roles.${role}`)}
        </>
      ),
    },
    { type: "divider" },
    {
      key: "appearance",
      type: "group",
      label: t("shell.appearance"),
      children: COLOR_MODE_PREFERENCES.map((mode) => ({
        key: `${MODE_KEY}${mode}`,
        role: "menuitemradio",
        "aria-checked": mode === preference,
        icon: <AnimatedIcon preset={MODE_ICONS[mode]} />,
        label: t(`shell.colorModes.${mode}`),
        extra: mode === preference ? <AnimatedIcon preset="check" /> : undefined,
      })),
    },
    ...(includeLanguage
      ? [
          { type: "divider" as const },
          {
            key: "language",
            type: "group" as const,
            label: t("app.language"),
            children: SUPPORTED_LANGUAGES.map((option) => ({
              key: `${LANGUAGE_KEY}${option}`,
              role: "menuitemradio",
              "aria-checked": option === language,
              icon: <AnimatedIcon preset="language" />,
              label: option.toUpperCase(),
              extra: option === language ? <AnimatedIcon preset="check" /> : undefined,
            })),
          },
        ]
      : []),
    { type: "divider" },
    {
      key: LOGOUT_KEY,
      icon: <AnimatedIcon preset="logout" />,
      label: t("auth.signOut"),
      disabled: signOut.isPending,
    },
  ];

  const onClick: MenuProps["onClick"] = ({ key }) => {
    if (key.startsWith(MODE_KEY)) {
      const mode = COLOR_MODE_PREFERENCES.find((option) => `${MODE_KEY}${option}` === key);
      if (mode) {
        setPreference(mode);
      }
    } else if (key.startsWith(LANGUAGE_KEY)) {
      const language = SUPPORTED_LANGUAGES.find((option) => `${LANGUAGE_KEY}${option}` === key);
      if (language) {
        void switchTo(language);
      }
    } else if (key === LOGOUT_KEY) {
      signOut.mutate();
    }
  };

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items, onClick }}>
      <Button
        type="text"
        aria-label={showName ? undefined : t("shell.userMenu")}
        icon={<AnimatedIcon preset="user" size={20} />}
      >
        {showName ? user.display_name : null}
      </Button>
    </Dropdown>
  );
}

/** A session that already expired on the server is as signed out as one ended now. */
async function endSession(): Promise<void> {
  try {
    await logout();
  } catch (error) {
    if (!(error instanceof ApiError && error.status === UNAUTHORIZED)) {
      throw error;
    }
  }
}

/**
 * Everything cached belongs to the user who signed out, so it's all dropped once the
 * login page shows; the next user on this browser starts from nothing. Running requests
 * are cancelled first: one answering 401 while the login page loads would make the gate
 * send the next user back to this user's page.
 */
function useSignOut() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: endSession,
    onSuccess: async () => {
      await client.cancelQueries();
      await navigate(LOGIN_PATH, { replace: true });
      client.clear();
    },
    onError: () => {
      void message.error(t("auth.signOutFailed"));
    },
  });
}
