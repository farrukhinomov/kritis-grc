import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { Providers } from "@/app/Providers";
import { createQueryClient } from "@/app/queryClient";
import { routes } from "@/app/routes";

/** Renders the real route tree at `path`, with a fresh cache so tests never share data. */
export function renderRoute(path: string) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return {
    router,
    ...render(
      <Providers client={client}>
        <RouterProvider router={router} />
      </Providers>,
    ),
  };
}
