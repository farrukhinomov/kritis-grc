import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";

import { Providers } from "./Providers";
import { createQueryClient } from "./queryClient";
import { routes } from "./routes";

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

// Both flags are replaced at build time, so production builds drop the panel entirely.
const SimulationPanel =
  import.meta.env.DEV && import.meta.env.VITE_API_MOCKING === "enabled"
    ? lazy(async () => ({ default: (await import("./dev/SimulationPanel")).SimulationPanel }))
    : null;

export function App() {
  return (
    <Providers client={queryClient}>
      <RouterProvider router={router} />
      {SimulationPanel && (
        <Suspense fallback={null}>
          <SimulationPanel />
        </Suspense>
      )}
    </Providers>
  );
}
