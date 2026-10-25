/** German is the source language: every key starts here, and English must mirror it. */
export const de = {
  app: {
    name: "GRC-Plattform",
    languageUnavailable:
      "Englisch konnte gerade nicht geladen werden. Bitte versuchen Sie es erneut.",
    language: "Sprache",
    skipToContent: "Zum Inhalt springen",
    prototypeBadge: "Prototyp – Demodaten",
    prototypeBadgeShort: "Demo",
    openDemo: "Demo öffnen",
    openApp: "Zur Anwendung",
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
    readOnly: "Nur Lesezugriff",
    readOnlyShort: "Nur Lesen",
    readOnlyHint: "In diesem Mandanten können Sie als Auditor alles einsehen, aber nichts ändern.",
    placeholder: "Dieser Bereich wird im Prototyp ausgebaut.",
  },
  auth: {
    title: "Anmelden",
    signIn: "Anmelden",
    signOut: "Abmelden",
    signOutFailed: "Abmelden ist fehlgeschlagen. Bitte versuchen Sie es erneut.",
    demo: {
      title: "Demo ansehen, ohne Konto",
      failed: "Der Demo-Zugang ist gerade nicht verfügbar. Bitte versuchen Sie es später erneut.",
      grc_manager: {
        action: "Als GRC-Manager ansehen",
        description: "Bearbeitet Umsetzungen, lädt Nachweise hoch und gibt Mappings frei.",
      },
      auditor: {
        action: "Als Auditor ansehen",
        description: "Sieht alles, ändert nichts – wie bei einer Prüfung.",
      },
    },
    orWithEmail: "oder mit E-Mail-Adresse",
    fields: {
      email: {
        label: "E-Mail-Adresse",
        required: "Bitte geben Sie Ihre E-Mail-Adresse ein.",
        invalid: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      },
      password: {
        label: "Passwort",
        required: "Bitte geben Sie Ihr Passwort ein.",
        invalid: "Dieses Passwort wird nicht akzeptiert.",
      },
    },
    submit: "Mit E-Mail anmelden",
    invalidCredentials: "E-Mail-Adresse oder Passwort ist nicht korrekt.",
    failed: "Die Anmeldung ist fehlgeschlagen. Bitte versuchen Sie es erneut.",
    prototypeHint:
      "Dieser Prototyp hat keine eigenen Konten. Bitte nutzen Sie einen der Demo-Zugänge oben.",
  },
  dashboard: {
    description: "Wo Ihre Organisation bei KRITIS-Dachgesetz und NIS2 steht.",
    riskCategories: {
      low: "Niedrig",
      medium: "Mittel",
      high: "Hoch",
      critical: "Kritisch",
    },
    compliance: {
      title: "Compliance je Framework und Anlage",
      counts: "{{implemented}} von {{applicable}} umgesetzt, {{partial}} teilweise",
      empty: "Noch keine Umsetzungen erfasst.",
    },
    deadlines: {
      title: "Fristen",
      inDays_zero: "heute fällig",
      inDays_one: "in {{count}} Tag",
      inDays_other: "in {{count}} Tagen",
      overdue_one: "{{count}} Tag überfällig",
      overdue_other: "{{count}} Tage überfällig",
      projected: "prognostiziert",
      projectedHint:
        "Prognostiziert: berechnet aus der geplanten Registrierung. Verbindlich werden die Fristen erst mit dem bestätigten Datum.",
      empty: "Keine kritische Anlage mit Registrierung erfasst.",
    },
    matrix: {
      title: "Restrisiko-Matrix",
      caption:
        "Anzahl der Risiken nach Restrisiko: Auswirkung (Zeilen) und Eintrittswahrscheinlichkeit (Spalten)",
      likelihood: "Eintrittswahrscheinlichkeit",
      impact: "Auswirkung",
      axes: "Zeilen: Auswirkung · Spalten: Eintrittswahrscheinlichkeit",
    },
    topRisks: {
      title: "Top-5-Risiken",
    },
    risks: {
      empty: "Noch keine Risiken erfasst.",
      calculationPending: "Berechnung ausstehend",
      pending_one: "{{count}} Risiko wartet noch auf die Berechnung des Restrisikos.",
      pending_other: "{{count}} Risiken warten noch auf die Berechnung des Restrisikos.",
    },
    mine: {
      title: "Meine offenen Umsetzungen",
      due: "fällig am {{date}}",
      more: "{{shown}} von {{total}} angezeigt",
      empty: "Ihnen sind keine offenen Umsetzungen zugewiesen.",
    },
    activity: {
      title: "Letzte Aktivitäten",
      unknownActor: "Unbekannt",
      empty: "Noch keine Aktivitäten.",
      actions: {
        created: "{{actor}} hat {{object}} angelegt",
        updated: "{{actor}} hat {{object}} geändert",
        deleted: "{{actor}} hat {{object}} gelöscht",
        approved: "{{actor}} hat {{object}} freigegeben",
        rejected: "{{actor}} hat {{object}} abgelehnt",
        commented: "{{actor}} hat {{object}} kommentiert",
      },
    },
  },
  compliance: {
    description: "Vom Paragraphen bis zur einzelnen Umsetzung, je Framework und Geltungsbereich.",
    framework: "Framework",
    scope: "Geltungsbereich",
    drill: "Compliance-Cockpit",
    columns: {
      paragraphs: "Paragraphen",
      requirements: "Anforderungen",
      implementation: "Umsetzung",
    },
    summary:
      "{{requirements}} Anforderungen · {{implemented}} umgesetzt · {{partial}} teilweise · {{open}} offen",
    implementedOf: "{{implemented}} von {{total}} umgesetzt",
    pendingLegalDetail: "Rechtsdetail ausstehend",
    status: "Status",
    owner: "Verantwortlich",
    unassigned: "Nicht zugewiesen",
    due: "Fällig",
    noDue: "Kein Termin",
    note: "Notiz",
    updated: "Zuletzt geändert",
    statuteText: "Gesetzestext",
    noImplementation: "Für diesen Geltungsbereich ist keine Umsetzung erfasst.",
    empty: "Noch keine Umsetzungen erfasst.",
    emptyParagraphs:
      "Für diesen Geltungsbereich sind in diesem Framework keine Umsetzungen erfasst.",
    emptyRequirements: "Dieser Paragraph enthält keine Anforderungen.",
  },
  implementationStatus: {
    open: "Offen",
    partial: "Teilweise umgesetzt",
    implemented: "Umgesetzt",
    not_applicable: "Nicht anwendbar",
  },
  patterns: {
    back: "Zurück",
    close: "Schließen",
    expandSheet: "Auf volle Höhe vergrößern",
    shrinkSheet: "Auf halbe Höhe verkleinern",
    actions: "Aktionen",
    loadError: "Dieser Bereich konnte nicht geladen werden.",
    stale: "Nicht aktuell: die Aktualisierung ist fehlgeschlagen.",
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
