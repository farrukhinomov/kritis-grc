import "./animated-icon.css";

import { ICON_PRESETS, type IconPreset } from "./presets";

interface AnimatedIconProps {
  preset: IconPreset;
  size?: number;
  /** Only for icons that stand alone without visible text; otherwise the icon is hidden. */
  label?: string;
}

const DEFAULT_SIZE = 16;

/**
 * A Lucide icon that moves when the button, link or menu item around it is hovered or
 * pressed. The animation lives in CSS, keyed by the data attribute, so it costs no
 * re-renders and respects reduced motion without JavaScript.
 */
export function AnimatedIcon({ preset, size = DEFAULT_SIZE, label }: AnimatedIconProps) {
  const { icon: Icon, animation } = ICON_PRESETS[preset];
  const a11y = label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label };

  return (
    <span className="grc-animated-icon" data-animated-icon={animation} {...a11y}>
      <Icon size={size} strokeWidth={1.75} aria-hidden focusable={false} />
    </span>
  );
}
