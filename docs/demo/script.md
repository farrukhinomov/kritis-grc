# Demo video: script

Three minutes, German narration, English subtitles ([subtitles.en.srt](subtitles.en.srt)). The screen part is recorded reproducibly by [`scripts/demo/record.mjs`](../../scripts/demo/record.mjs) against a running stack, so it can be redone after every UI change; the voice is recorded separately and laid over it.

| Time | Screen | Sprechertext (Deutsch) |
|---|---|---|
| 0:00–0:20 | Login page, demo role picker | Seit März gilt das KRITIS-Dachgesetz, seit Dezember das neue BSIG. Ein Wasserwerk muss beides erfüllen: Risikoanalyse, Resilienzmaßnahmen, Meldungen und Nachweise. Diese Plattform führt beides an einer Stelle zusammen. Ich melde mich als GRC-Managerin der Muster-Stadtwerke Saar an. |
| 0:20–0:45 | Dashboard | Die Übersicht zeigt den Stand je Gesetz und Anlage, die nächsten Fristen und die Restrisiko-Matrix. Die Fristen sind prognostiziert, denn die Registrierung ist erst geplant: Die Schwellenwertverordnung ist noch nicht in Kraft. |
| 0:45–1:15 | Compliance cockpit, Wasserwerk Nord, § 13 | Im Compliance-Cockpit öffne ich für das Wasserwerk Nord die Resilienzmaßnahmen nach § 13. Die Notstromversorgung ist bereits für das BSIG nachgewiesen. Statt alles doppelt zu dokumentieren, verweise ich auf diese Umsetzung und lade zusätzlich den Prüfbericht hoch. |
| 1:15–1:45 | Status "umgesetzt", then the risk matrix | Ich setze den Status auf „umgesetzt“. Im Hintergrund berechnet die Risiko-Engine das Restrisiko neu: Der Stromausfall rückt in der Matrix aus dem kritischen Bereich. Fällt die Engine aus, gilt die Bewertung als ausstehend und wird automatisch nachgeholt. |
| 1:45–2:15 | Freigaben: Mapping-Vorschläge, Risikobewertung | Unter „Freigaben“ warten Vorschläge der KI, welche BSIG-Pflichten eine KRITIS-Pflicht abdecken. Die KI sieht dabei nur den öffentlichen Gesetzestext, nie Daten der Organisation. Wirksam wird ein Vorschlag erst, wenn ein Mensch ihn freigibt. Eine Risikobewertung kann nie von der Person freigegeben werden, die sie eingereicht hat. |
| 2:15–2:45 | Sign out, sign in as Auditor, Aktivitätsprotokoll | Jetzt melde ich mich als Auditor an. Der Auditor sieht alles, kann aber nichts ändern. Im Aktivitätsprotokoll steht jede Änderung: wer, wann und von welchem zu welchem Wert. Die Einträge lassen sich weder ändern noch löschen, das erzwingt die Datenbank selbst. |
| 2:45–3:00 | Dashboard, then the repository's README | Jede Organisation ist doppelt abgeschottet, in der Anwendung und in der Datenbank. Code, Architektur und Entscheidungen sind öffentlich einsehbar. Danke fürs Zuschauen. |

## Recording

1. Start a stack with the demo loaded and the risk engine running, e.g. `docker compose up`, then `docker compose run --rm backend python manage.py reset_demo`.
2. `node scripts/demo/record.mjs http://localhost:5173` writes a `.webm` video to `scripts/demo/out/`. It walks the screens in the order above, with pauses for the narration. The edits in the cockpit (the Reference Evidence, the upload, the status change) are still done by hand in a second take; scripting them is the next step once the drawer's layout is final.
3. Record the narration at the timings above and lay it over the video; add the subtitles as a separate track.
