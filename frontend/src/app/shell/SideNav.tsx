import { Tooltip } from "antd";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

import { duration, ease } from "@/shared/theme/motion";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";

import { NAV_ITEMS, type NavEntry } from "./navigation";

const ICON_SIZE = 20;

interface SideNavProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function SideNav({ collapsed, onToggle }: SideNavProps) {
  const { t } = useTranslation();

  return (
    <aside className="grc-shell-sidebar" data-collapsed={collapsed}>
      <div className="grc-shell-brand">
        <span className="grc-shell-brand-mark" aria-hidden>
          GRC
        </span>
        <span className={collapsed ? "grc-visually-hidden" : undefined}>{t("app.name")}</span>
      </div>
      <nav aria-label={t("nav.main")} className="grc-shell-nav">
        <ul className="grc-shell-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <SideNavLink item={item} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="grc-shell-sidebar-footer">
        <button
          type="button"
          className="grc-shell-collapse-button"
          aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
          onClick={onToggle}
        >
          <AnimatedIcon preset={collapsed ? "chevronForward" : "chevronBack"} size={ICON_SIZE} />
        </button>
      </div>
    </aside>
  );
}

function SideNavLink({ item, collapsed }: { item: NavEntry; collapsed: boolean }) {
  const { t } = useTranslation();
  const label = t(`nav.${item.key}`);

  const link = (
    <NavLink to={item.path} className="grc-shell-nav-link">
      {({ isActive }) => (
        <>
          {isActive && (
            <m.span
              layoutId="sidebar-active"
              className="grc-shell-active-pill"
              transition={{ duration: duration.base, ease: ease.standard }}
            />
          )}
          <AnimatedIcon preset={item.icon} size={ICON_SIZE} />
          <span className={collapsed ? "grc-visually-hidden" : undefined}>{label}</span>
        </>
      )}
    </NavLink>
  );

  // Collapsed, the label is only read by screen readers; sighted users get a tooltip.
  return collapsed ? (
    <Tooltip title={label} placement="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}
