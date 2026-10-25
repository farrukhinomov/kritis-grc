import type { Translation } from "./de";

export const en: Translation = {
  app: {
    name: "GRC Platform",
    language: "Language",
    skipToContent: "Skip to content",
    prototypeBadge: "Prototype – demo data",
    prototypeBadgeShort: "Demo",
    openDemo: "Open demo",
  },
  nav: {
    main: "Main navigation",
    more: "More",
    collapse: "Collapse navigation",
    expand: "Expand navigation",
    dashboard: "Overview",
    compliance: "Compliance",
    risks: "Risks",
    approvals: "Approvals",
    suggestions: "Mapping suggestions",
    deadlines: "Deadlines",
    facilities: "Facilities and assets",
    dependencies: "Dependencies",
    coverage: "Coverage",
    applicability: "Applicability",
    activity: "Activity log",
    settings: "Settings",
    roadmap: "Roadmap",
  },
  shell: {
    tenantSwitcher: "Switch tenant",
    userMenu: "User menu",
    appearance: "Appearance",
    colorModes: {
      light: "Light",
      dark: "Dark",
      system: "Match system",
    },
    roles: {
      grc_manager: "GRC Manager",
      auditor: "Auditor",
    },
    unknownTenant: {
      title: "Tenant not found",
      description: "This tenant doesn't exist, or you don't have access to it.",
    },
    placeholder: "This area is being built out in the prototype.",
  },
  patterns: {
    back: "Back",
    close: "Close",
    expandSheet: "Expand to full height",
    shrinkSheet: "Shrink to half height",
    actions: "Actions",
    loading: "Loading …",
  },
  errors: {
    title: "This area could not be displayed.",
    description: "An unexpected error occurred. Your data is not affected.",
    retry: "Try again",
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
  notFound: {
    title: "Page not found",
    backHome: "Back to start",
  },
};
