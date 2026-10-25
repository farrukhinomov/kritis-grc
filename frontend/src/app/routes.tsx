import { Navigate, type RouteObject } from "react-router";

import { PublicLayout } from "./PublicLayout";
import { RootLayout } from "./RootLayout";
import { RouteError } from "./RouteError";
import { titled } from "./routeHandle";
import { NAV_ITEMS } from "./shell/navigation";

const placeholder = async () => ({ Component: (await import("./pages")).PlaceholderPage });
const notFound = async () => ({ Component: (await import("./pages")).NotFound });

// Each page is its own chunk, loaded on first visit, so the initial download stays small
// as screens are added.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    ErrorBoundary: RouteError,
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            index: true,
            ...titled("status.title"),
            lazy: async () => ({
              Component: (await import("@/features/status/StatusPage")).StatusPage,
            }),
          },
          { path: "*", ...titled("notFound.title"), lazy: notFound },
        ],
      },
      // Every tenant-owned page lives under the Tenant's slug, so links are shareable and
      // two tabs can work in two Tenants at once.
      {
        path: "t/:tenantSlug",
        // The shell loads in parallel with the first page, and public pages never need it.
        lazy: async () => ({ Component: (await import("./shell/TenantShell")).TenantShell }),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          {
            // Errors inside a Tenant render within the shell, so navigation stays usable.
            ErrorBoundary: RouteError,
            children: [
              ...NAV_ITEMS.map((item) => ({
                path: item.path,
                ...titled(`nav.${item.key}`),
                lazy: placeholder,
              })),
              { path: "*", ...titled("notFound.title"), lazy: notFound },
            ],
          },
        ],
      },
    ],
  },
];
