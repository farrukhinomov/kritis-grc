import { theme, type ThemeConfig } from "antd";

import { cssDuration, cssEasing, duration, ease } from "./motion";
import { type ColorMode, semanticTokens, type ThemeName } from "./semantic";

/** Things about the user's device and settings that change how controls are drawn. */
export interface DeviceTraits {
  coarsePointer: boolean;
  reducedMotion: boolean;
}

/** Fingers need larger targets than a mouse; 44 px is the common platform minimum. */
const TOUCH_TARGET = 44;
const TOUCH_TARGET_LARGE = 48;

/**
 * Third token layer: semantic tokens mapped into Ant Design. antd's algorithms only
 * provide the base; every color a user reads is set explicitly from the semantic tokens,
 * so the contrast tests cover what is actually rendered.
 */
export function antdTheme(name: ThemeName, mode: ColorMode, device: DeviceTraits): ThemeConfig {
  const t = semanticTokens(name, mode);

  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      fontFamily: "'Inter Variable', system-ui, sans-serif",

      colorPrimary: t.primary,
      colorPrimaryHover: t.primaryHover,
      colorTextLightSolid: t.onPrimary,
      colorLink: t.link,
      colorLinkHover: t.primaryHover,

      colorBgLayout: t.page,
      colorBgContainer: t.surface,
      colorBgElevated: t.surfaceRaised,
      colorFillAlter: t.surfaceSunken,

      colorText: t.text,
      colorTextHeading: t.text,
      colorTextSecondary: t.textSecondary,
      // antd uses lighter greys for descriptions and placeholders; they must stay readable.
      colorTextTertiary: t.textSecondary,
      colorTextDescription: t.textSecondary,
      colorTextPlaceholder: t.textSecondary,

      colorBorder: t.controlBorder,
      colorBorderSecondary: t.borderSubtle,
      colorSplit: t.borderSubtle,
      controlOutline: t.focusRing,
      controlOutlineWidth: 2,

      colorSuccess: t.status.success.solid,
      colorSuccessText: t.status.success.text,
      colorSuccessBg: t.status.success.bg,
      colorSuccessBorder: t.status.success.solid,
      colorWarning: t.status.warning.solid,
      colorWarningText: t.status.warning.text,
      colorWarningBg: t.status.warning.bg,
      colorWarningBorder: t.status.warning.solid,
      colorError: t.status.danger.solid,
      colorErrorText: t.status.danger.text,
      colorErrorBg: t.status.danger.bg,
      colorErrorBorder: t.status.danger.solid,
      colorInfo: t.status.info.solid,
      colorInfoText: t.status.info.text,
      colorInfoBg: t.status.info.bg,
      colorInfoBorder: t.status.info.solid,

      motionDurationFast: cssDuration(duration.fast),
      motionDurationMid: cssDuration(duration.base),
      motionDurationSlow: cssDuration(duration.slow),
      motionEaseInOut: cssEasing(ease.standard),
      motionEaseOut: cssEasing(ease.enter),
      ...(device.reducedMotion ? { motion: false } : {}),

      ...(device.coarsePointer
        ? {
            controlHeightSM: TOUCH_TARGET,
            controlHeight: TOUCH_TARGET,
            controlHeightLG: TOUCH_TARGET_LARGE,
          }
        : {}),
    },
    components: {
      Layout: {
        bodyBg: t.page,
        headerBg: t.surface,
      },
    },
  };
}
