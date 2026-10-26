import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { DeadlineItem } from "@/shared/api/types";
import { formatDate } from "@/shared/lib/format";

import { entryId } from "./entryId";

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (isoDate: string) => Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / DAY_MS;

interface Marker {
  key: string;
  date: string;
  binding: boolean;
  /** The soonest-listed of its deadlines, whose list entry the marker leads to. */
  first: DeadlineItem;
  citations: string[];
}

/**
 * Deadlines of one facility that fall on one day share a marker: at this scale they would
 * sit on top of each other, and one marker naming all their citations reads better.
 */
function markersOf(items: DeadlineItem[]): Marker[] {
  const markers = new Map<string, Marker>();
  for (const item of items) {
    const key = `${item.due_date} ${String(item.binding)}`;
    const marker = markers.get(key);
    if (marker) {
      marker.citations.push(item.citation);
    } else {
      markers.set(key, {
        key,
        date: item.due_date,
        binding: item.binding,
        first: item,
        citations: [item.citation],
      });
    }
  }
  return [...markers.values()];
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
  const at = (isoDate: string): CSSProperties => ({
    insetInlineStart: `${String(((dayNumber(isoDate) - start) / (end - start)) * 100)}%`,
  });
  const ticks = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const names = new Map(items.map((item) => [item.scope_id, item.scope_name]));
  const lanes = [...names].map(([id, name]) => ({
    id,
    name,
    markers: markersOf(items.filter((item) => item.scope_id === id)),
  }));

  const open = (target: DeadlineItem) => {
    const entry = document.getElementById(entryId(target));
    entry?.focus({ preventScroll: true });
    entry?.scrollIntoView({ block: "center" });
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
                  const citations = marker.citations.join(", ");
                  const label = [
                    t("deadlines.citation", { citation: citations }),
                    lane.name,
                    formatDate(marker.date, i18n.language),
                    marker.binding ? t("deadlines.binding") : t("dashboard.deadlines.projected"),
                  ].join(", ");
                  return (
                    <a
                      key={marker.key}
                      href={`#${entryId(marker.first)}`}
                      className="grc-timeline-marker"
                      style={at(marker.date)}
                      aria-label={label}
                      title={label}
                      onClick={(event) => {
                        event.preventDefault();
                        open(marker.first);
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
          <div className="grc-timeline-today" style={at(today)}>
            <span>{t("deadlines.today")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
