/** German is the source language: every key starts here, and English must mirror it. */
export const de = {
  app: {
    name: "GRC-Plattform",
    language: "Sprache",
    skipToContent: "Zum Inhalt springen",
    prototypeBadge: "Prototyp – Demodaten",
    prototypeBadgeShort: "Demo",
    openDemo: "Demo öffnen",
  },
  nav: {
    main: "Hauptnavigation",
    more: "Mehr",
    collapse: "Navigation einklappen",
    expand: "Navigation ausklappen",
    dashboard: "Übersicht",
    compliance: "Compliance",
    risks: "Risiken",
    approvals: "Freigaben",
    suggestions: "Mapping-Vorschläge",
    deadlines: "Fristen",
    facilities: "Anlagen und Assets",
    dependencies: "Abhängigkeiten",
    coverage: "Abdeckung",
    applicability: "Betroffenheit",
    activity: "Aktivitätsprotokoll",
    settings: "Einstellungen",
    roadmap: "Roadmap",
  },
  shell: {
    tenantSwitcher: "Mandant wechseln",
    userMenu: "Benutzermenü",
    appearance: "Darstellung",
    colorModes: {
      light: "Hell",
      dark: "Dunkel",
      system: "Wie System",
    },
    roles: {
      grc_manager: "GRC-Manager",
      auditor: "Auditor",
    },
    unknownTenant: {
      title: "Mandant nicht gefunden",
      description: "Dieser Mandant existiert nicht, oder Sie haben keinen Zugriff darauf.",
    },
    placeholder: "Dieser Bereich wird im Prototyp ausgebaut.",
  },
  patterns: {
    back: "Zurück",
    close: "Schließen",
    expandSheet: "Auf volle Höhe vergrößern",
    shrinkSheet: "Auf halbe Höhe verkleinern",
    actions: "Aktionen",
    loading: "Wird geladen …",
  },
  errors: {
    title: "Dieser Bereich konnte nicht angezeigt werden.",
    description: "Ein unerwarteter Fehler ist aufgetreten. Ihre Daten sind davon nicht betroffen.",
    retry: "Erneut versuchen",
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
  dev: {
    simulation: {
      open: "Simulation",
      title: "Mock-API simulieren",
      latency: "Antwortzeit",
      latencies: { off: "Sofort", short: "400 ms", long: "1,5 s" },
      failureRate: "Fehlerquote",
      conflict: "Nächste Änderung erzeugt einen Konflikt (412)",
      riskEngineDown: "Risiko-Engine nicht erreichbar",
      reset: "Demodaten zurücksetzen",
      hint: "Nur in der Entwicklung sichtbar. Einstellungen bleiben in diesem Browser gespeichert.",
    },
  },
  notFound: {
    title: "Seite nicht gefunden",
    backHome: "Zur Startseite",
  },
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every other language must match exactly; a missing key fails the build. */
export type Translation = Widen<typeof de>;
