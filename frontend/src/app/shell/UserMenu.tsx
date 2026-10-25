import { Button, Dropdown, type MenuProps } from "antd";
import { useTranslation } from "react-i18next";

import { currentLanguage, SUPPORTED_LANGUAGES } from "@/shared/i18n";
import { useSession } from "@/shared/session/sessionContext";
import type { Role } from "@/shared/session/session";
import { COLOR_MODE_PREFERENCES, type ColorModePreference } from "@/shared/theme/colorMode";
import { useColorMode } from "@/shared/theme/themeContext";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";
import type { IconPreset } from "@/shared/ui/AnimatedIcon/presets";

const MODE_ICONS: Record<ColorModePreference, IconPreset> = {
  light: "lightMode",
  dark: "darkMode",
  system: "systemMode",
};

const MODE_KEY = "mode:";
const LANGUAGE_KEY = "language:";

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

  const items: MenuProps["items"] = [
    {
      key: "identity",
      type: "group",
      label: (
        <>
          <strong>{user.displayName}</strong>
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
  ];

  const onClick: MenuProps["onClick"] = ({ key }) => {
    if (key.startsWith(MODE_KEY)) {
      const mode = COLOR_MODE_PREFERENCES.find((option) => `${MODE_KEY}${option}` === key);
      if (mode) {
        setPreference(mode);
      }
    } else if (key.startsWith(LANGUAGE_KEY)) {
      void i18n.changeLanguage(key.slice(LANGUAGE_KEY.length));
    }
  };

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items, onClick }}>
      <Button
        type="text"
        aria-label={showName ? undefined : t("shell.userMenu")}
        icon={<AnimatedIcon preset="user" size={20} />}
      >
        {showName ? user.displayName : null}
      </Button>
    </Dropdown>
  );
}
