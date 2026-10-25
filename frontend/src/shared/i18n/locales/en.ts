import type { Translation } from "./de";

export const en: Translation = {
  app: {
    name: "GRC Platform",
    language: "Language",
  },
  status: {
    title: "System status",
    subtitle: "Availability of the platform services",
    loadError: "The status could not be loaded. Please try again later.",
    retry: "Try again",
    summary: {
      ok: "All services are operational.",
      degraded: "Some services are degraded.",
    },
    states: {
      ok: "Operational",
      unavailable: "Unavailable",
      unknown: "Not reported",
    },
    checks: {
      database: "Database",
      risk_engine: "Risk engine",
      storage: "File storage",
    },
  },
  tenant: {
    placeholder: "Tenant area: {{tenant}}",
  },
  notFound: {
    title: "Page not found",
    backHome: "Back to start",
  },
};
