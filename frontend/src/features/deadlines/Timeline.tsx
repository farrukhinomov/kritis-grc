import type { CSSProperties, MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { DeadlineItem } from "@/shared/api/types";
import { formatDate } from "@/shared/lib/format";

import { entryId } from "./entryId";

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (isoDate: string) => Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / DAY_MS;

/**
 * The narrowest track a wide screen leaves, and a marker's target. Markers closer than one
 * target apart at that width would cover each other, so they share one marker instead.
 */
const NARROWEST_TRACK_PX = 420;
const TARGET_PX = 44;
/** Past this share of the track, today's label turns to the left so it stays inside. */
const LABEL_FLIP_SHARE = 0.85;

interface Marker {
  first: DeadlineItem;
  last: DeadlineItem;
  citations: string[];
  /** Projected as long as any of its deadlines is; a projected date is not yet law. */
  binding: boolean;
}

function markersOf(items: DeadlineItem[], minimumGapDays: number): Marker[] {
  const markers: Marker[] = [];
  for (const item of items) {
    const current = markers.at(-1);
    if (current && dayNumber(item.due_date) - dayNumber(current.first.due_date) < minimumGapDays) {
      current.last = item;
      current.binding &&= item.binding;
      if (!current.citations.includes(item.citation)) {
        current.citations.push(item.citation);
      }
    } else {
      markers.push({ first: item, last: item, citations: [item.citation], binding: item.binding });
    }
  }
  return markers;
}

/**
 * An overview of whole years, with one lane per Critical Facility and a line for today.
 * Every marker is a link to its entry in the list, which holds the details, so the
 * timeline needs no tooltips that touch and keyboard users would have to find.
 */
export function Timeline({ items, today }: { items: DeadlineItem[]; today: string }) {
  const { t, i18n } = useTranslation();
  const years = items.map((item) => Number(item.due_date.slice(0, 4)));
  const firstYear = Math.min(Number(today.slice(0, 4)), ...years);
  const lastYear = Math.max(Number(today.slice(0, 4)), ...years);
  const start = dayNumber(`${String(firstYear)}-01-01`);
  const end = dayNumber(`${String(lastYear + 1)}-01-01`);
  const share = (isoDate: string) => (dayNumber(isoDate) - start) / (end - start);
  const at = (isoDate: string): CSSProperties => ({
    insetInlineStart: `${String(share(isoDate) * 100)}%`,
  });
  const minimumGapDays = ((end - start) * TARGET_PX) / NARROWEST_TRACK_PX;
  const ticks = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const names = new Map(items.map((item) => [item.scope_id, item.scope_name]));
  // By name, so the lanes keep their places when a deadline moves.
  const lanes = [...names]
    .toSorted(([, a], [, b]) => a.localeCompare(b))
    .map(([id, name]) => ({
      id,
      name,
      markers: markersOf(
        items.filter((item) => item.scope_id === id),
        minimumGapDays,
      ),
    }));

  const open = (event: MouseEvent, target: DeadlineItem) => {
    // A modified or middle click is the browser's: a new tab or window for the link.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    const entry = document.getElementById(entryId(target));
    if (entry) {
      // Moved here on purpose, so the entry shows where focus went even after a click.
      entry.dataset.reached = "";
      entry.addEventListener("blur", () => delete entry.dataset.reached, { once: true });
      entry.focus({ preventScroll: true });
      entry.scrollIntoView({ block: "center" });
    }
  };

  return (
    <section className="grc-timeline" aria-label={t("deadlines.timeline")}>
      <ul className="grc-plain-list grc-timeline-legend">
        <li>
          <span className="grc-deadline-marker" data-binding="true" aria-hidden="true" />
          {t("deadlines.binding")}
        </li>
        <li>
          <span className="grc-deadline-marker" data-binding="false" aria-hidden="true" />
          {t("dashboard.deadlines.projected")}
        </li>
      </ul>
      <div className="grc-timeline-grid">
        <div className="grc-timeline-years" aria-hidden="true">
          {ticks.map((year) => (
            <span key={year} className="grc-timeline-year" style={at(`${String(year)}-01-01`)}>
              {year}
            </span>
          ))}
        </div>
        <ul className="grc-plain-list grc-timeline-lanes">
          {lanes.map((lane) => (
            <li key={lane.id} className="grc-timeline-lane">
              <span className="grc-timeline-lane-name">{lane.name}</span>
              <span className="grc-timeline-track">
                {lane.markers.map((marker) => {
                  const from = formatDate(marker.first.due_date, i18n.language);
                  const to = formatDate(marker.last.due_date, i18n.language);
                  const label = [
                    t("deadlines.citation", { citation: marker.citations.join(", ") }),
                    lane.name,
                    from === to ? from : t("deadlines.range", { from, to }),
                    marker.binding ? t("deadlines.binding") : t("dashboard.deadlines.projected"),
                  ].join(", ");
                  return (
                    <a
                      key={entryId(marker.first)}
                      href={`#${entryId(marker.first)}`}
                      className="grc-timeline-marker"
                      style={at(marker.first.due_date)}
                      aria-label={label}
                      title={label}
                      onClick={(event) => {
                        open(event, marker.first);
                      }}
                    >
                      <span
                        className="grc-deadline-marker"
                        data-binding={marker.binding}
                        aria-hidden="true"
                      />
                    </a>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
        {/* Spans the tracks only, so today's position matches the markers'. */}
        <div className="grc-timeline-overlay" aria-hidden="true">
          <div
            className="grc-timeline-today"
            style={at(today)}
            data-flip={share(today) > LABEL_FLIP_SHARE}
          >
            <span>{t("deadlines.today")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
