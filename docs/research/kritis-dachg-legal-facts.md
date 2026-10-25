# KRITIS-DachG & BSIG (NIS2): legal facts

Researched on 2026-10-25 from gesetze-im-internet.de, BBK, Bundesregierung and secondary legal sources. Check the wording against the BGBl before quoting it verbatim. Items marked _(unverified)_ come only from secondary sources.

## KRITIS-DachG status
- "Dachgesetz zur Stärkung der physischen Resilienz kritischer Anlagen" of 11.03.2026, BGBl. 2026 I Nr. 66. **In force since 17.03.2026**, except § 14 Abs. 3–5, which apply from 01.01.2030.
- Amended by BGBl. 2026 I Nr. 221, effective 29.07.2026. The amendment reportedly removed the fixed earliest registration date in § 8 _(unverified)_.
- The **thresholds ordinance (KritisV) was still a draft** (Referentenentwurf of 26.05.2026), with no evidence it has been promulgated. According to the BBK FAQ, **no registration duty applies until it is in force**.
- BBK templates (Resilienzplan), minimum requirements (§ 14), risk-analysis methods and the evidence procedure are all **still "in Abstimmung"** (being coordinated). None are published yet.

Source: https://www.gesetze-im-internet.de/kritisdachg/BJNR0420B0026.html

## Scope
- § 2 Nr. 3: a **kritische Anlage** is a facility that is significant for providing a critical service. The Betreiber is whoever has decisive influence over it.
- § 4 Abs. 1 lists 10 sectors: Energie, Transport und Verkehr, Finanzwesen, Sozialversicherung/Grundsicherung, Gesundheit, Wasser, Ernährung, IT und TK, Weltraum, Siedlungsabfallentsorgung.
  - § 4 Abs. 2 exempts finance (DORA) and IT/TK from §§ 9, 10 and 12–16.
  - Electricity and gas provide evidence via § 5f EnWG instead.
- § 5 Abs. 2: the default threshold is **500,000 people supplied**. The ordinance sets the specific values.

## Operator obligations
| § | Obligation | Timing |
|---|---|---|
| 8 | Register with the BBK through the joint BSI/BBK registration facility (operator, contact point, facility, sector/service, thresholds, location, IP ranges, critical components) | ≤ 3 months after becoming critical; changes ≤ 2 weeks; thresholds updated yearly |
| 12 | Risk analysis and assessment, incl. cross-sector dependencies, based on the national risk analyses (§ 11) | applies **9 months after registration**; then as needed, **at least every 4 years** |
| 13 Abs. 1–3 | Resilience measures with four goals: prevent incidents, physical protection, respond/limit, restore. Example areas: emergency preparedness; structural/technical security, detection, access control; risk/crisis/alarm management; BCM (emergency power, alternative supply chains); personnel security incl. external staff; training and exercises | **10 months after registration** |
| 13 Abs. 4 | **Resilienzplan** documenting the measures and their reasoning, referring to the risk analysis, applied and kept up to date | 10 months after registration |
| 16 | Evidence on request (risk-based selection): audits, the Resilienzplan, on-site inspections, remediation plans; § 39 BSIG evidence can be reused | no fixed cycle |
| 17 | Evidence produced under other legal duties counts as equivalent | n/a |
| 18 | Incident report to the BBK via the joint BBK/BSI reporting office: first report **≤ 24 h**, updates, detailed report **≤ 1 month** (people affected, duration, area, cause, cross-border effects) | 10 months after registration |
| 20 | Management must implement and oversee the measures, with liability | 10 months after registration |

Fines (§ 24): up to €1M / €500k / €200k / €100k depending on the breach. Missing an incident report has no fine of its own.

Authorities (§ 3): the BBK is the central authority (registration, reporting). Sector authorities include BNetzA, BSI and BaFin; the Länder cover the rest.

## BSIG (NIS2), the overlap
- New BSIG = Art. 1 NIS2UmsuCG of 02.12.2025 (BGBl. 2025 I Nr. 301), **in force since 06.12.2025**. Old § 8a no longer exists.
- **§ 30 Abs. 2 Nr. 1–10** list the measures: risk analysis and security concepts; incident handling; BCM, backup and crisis management; supply chain; secure acquisition, development and vulnerabilities; effectiveness assessment; training; cryptography; personnel, access and asset management; MFA and secure communications.
- § 31: extra measures for critical facilities. § 32: reporting at 24 h / 72 h / 1 month. § 33: registration. § 39: evidence every 3 years.
- **Explicit links between the two laws:**
  - One shared definition of "kritische Anlage" (§ 2 Nr. 22 BSIG → § 2 Nr. 3 KRITIS-DachG).
  - A joint registration facility and a joint reporting office.
  - § 16 KRITIS-DachG reuses § 39 BSIG evidence.
  - § 14 builds on § 30 Abs. 8 BSIG standards.
