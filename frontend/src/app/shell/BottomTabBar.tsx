import { m } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";

import { duration, ease } from "@/shared/theme/motion";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";
import { ResponsiveDrawer } from "@/shared/ui/patterns/ResponsiveDrawer";

import { PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS, screenOf } from "./navigation";
import { NavCount } from "./NavCount";

const ICON_SIZE = 22;

/**
 * Phone navigation: the four most used screens within thumb reach, everything else in a
 * "More" sheet. "More" shows as active while one of its screens is open, so the user
 * always sees where they are.
 */
export function BottomTabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const screen = screenOf(pathname);
  const inMore = SECONDARY_NAV_ITEMS.some((item) => item.path === screen);

  return (
    <>
      <nav aria-label={t("nav.main")} className="grc-shell-tab-bar">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.key} to={item.path} className="grc-shell-tab">
            {({ isActive }) => (
              <>
                {isActive && <TabIndicator />}
                <AnimatedIcon preset={item.icon} size={ICON_SIZE} />
                {t(`nav.${item.key}`)}
                <NavCount item={item} />
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          className="grc-shell-tab"
          data-active={inMore}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => {
            setMoreOpen(true);
          }}
        >
          {inMore && <TabIndicator />}
          <AnimatedIcon preset="more" size={ICON_SIZE} />
          {t("nav.more")}
        </button>
      </nav>
      <ResponsiveDrawer
        open={moreOpen}
        onClose={() => {
          setMoreOpen(false);
        }}
        title={t("nav.more")}
        // Every item navigates, and the new page's heading takes focus.
        restoreFocus={false}
      >
        <ul className="grc-shell-sheet-list">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <NavLink
                to={item.path}
                className="grc-shell-sheet-link"
                onClick={() => {
                  setMoreOpen(false);
                }}
              >
                <AnimatedIcon preset={item.icon} size={20} />
                {t(`nav.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </ResponsiveDrawer>
    </>
  );
}

function TabIndicator() {
  return (
    <m.span
      layoutId="tab-indicator"
      className="grc-shell-tab-indicator"
      transition={{ duration: duration.base, ease: ease.standard }}
    />
  );
}
