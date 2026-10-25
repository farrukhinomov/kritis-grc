import type { RouteObject } from "react-router";

import { AppLayout } from "./AppLayout";

// Each page is its own chunk, loaded on first visit, so the initial download stays small
// as screens are added.
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("@/features/status/StatusPage")).StatusPage,
        }),
      },
      // Every tenant-owned page lives under the Tenant's slug, so links are shareable and
      // two tabs can work in two Tenants at once.
      {
        path: "t/:tenantSlug",
        lazy: async () => ({ Component: (await import("./pages")).TenantHome }),
      },
      {
        path: "*",
        lazy: async () => ({ Component: (await import("./pages")).NotFound }),
      },
    ],
  },
];
