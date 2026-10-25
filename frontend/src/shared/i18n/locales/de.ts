/** German is the source language: every key starts here, and English must mirror it. */
export const de = {
  app: {
    name: "GRC-Plattform",
    language: "Sprache",
  },
  status: {
    title: "Systemstatus",
    subtitle: "Erreichbarkeit der Plattformdienste",
    loadError: "Status konnte nicht geladen werden. Bitte versuchen Sie es später erneut.",
    retry: "Erneut versuchen",
    summary: {
      ok: "Alle Dienste sind betriebsbereit.",
      degraded: "Einige Dienste sind eingeschränkt.",
    },
    states: {
      ok: "Betriebsbereit",
      unavailable: "Nicht erreichbar",
      unknown: "Keine Angabe",
    },
    checks: {
      database: "Datenbank",
      risk_engine: "Risiko-Engine",
      storage: "Dateispeicher",
    },
  },
  tenant: {
    placeholder: "Mandantenbereich: {{tenant}}",
  },
  notFound: {
    title: "Seite nicht gefunden",
    backHome: "Zur Startseite",
  },
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every other language must match exactly; a missing key fails the build. */
export type Translation = Widen<typeof de>;
