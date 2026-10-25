import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavigationType, Outlet, useLocation, useNavigationType } from "react-router";

import { useRouteTitleKey } from "./routeHandle";

export const MAIN_CONTENT_ID = "main-content";

/** Page title, skip link and focus handling shared by every layout. */
export function RootLayout() {
  const { t } = useTranslation();
  useDocumentTitle();
  useFocusHeadingAfterNavigation();

  return (
    <>
      <a
        className="grc-skip-link"
        href={`#${MAIN_CONTENT_ID}`}
        onClick={(event) => {
          // Moving focus directly keeps the URL clean and works with client-side routing.
          event.preventDefault();
          document.getElementById(MAIN_CONTENT_ID)?.focus();
        }}
      >
        {t("app.skipToContent")}
      </a>
      <Outlet />
    </>
  );
}

function useDocumentTitle() {
  const { t } = useTranslation();
  const titleKey = useRouteTitleKey();
  const appName = t("app.name");
  const pageTitle = titleKey === undefined ? undefined : t(titleKey);

  useEffect(() => {
    document.title = pageTitle === undefined ? appName : `${pageTitle} · ${appName}`;
  }, [pageTitle, appName]);
}

/**
 * A client-side navigation doesn't move focus the way a page load does, so screen reader
 * and keyboard users would stay on the link they used. Focusing the new page's heading
 * announces the page and starts the tab order at its content. The first render and
 * redirects (replace navigations, such as a Tenant link resolving to its dashboard) are
 * left alone: there the user hasn't moved, and the browser's own behavior is right.
 */
function useFocusHeadingAfterNavigation() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current === pathname) {
      return;
    }
    previousPathname.current = pathname;
    if (navigationType === NavigationType.Replace) {
      return;
    }
    const heading = document.querySelector<HTMLElement>(`#${MAIN_CONTENT_ID} h1`);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [pathname, navigationType]);
}
