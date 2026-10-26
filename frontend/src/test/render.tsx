import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { Providers } from "@/app/Providers";
import { createQueryClient } from "@/app/queryClient";
import { routes } from "@/app/routes";

/**
 * Renders the real route tree at `path`, with a fresh cache so tests never share data.
 * `strict` renders it as development does, which runs every effect twice.
 */
export function renderRoute(path: string, { strict = false }: { strict?: boolean } = {}) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const app = (
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>
  );

  return { router, client, ...render(strict ? <StrictMode>{app}</StrictMode> : app) };
}
