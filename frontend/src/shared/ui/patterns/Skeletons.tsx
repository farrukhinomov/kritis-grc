import "./patterns.css";

import { Skeleton } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Placeholders shaped like the content they stand for, so nothing jumps when data
 * arrives. Screen readers hear one "Loading" instead of a list of empty shapes.
 */
function Loading({ children, className }: { children: ReactNode; className: string }) {
  const { t } = useTranslation();

  return (
    <div role="status" aria-busy="true" className={`grc-skeleton ${className}`}>
      <span className="grc-visually-hidden">{t("patterns.loading")}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

export function PageSkeleton() {
  return (
    <Loading className="grc-skeleton-page">
      <Skeleton.Input active size="large" style={{ width: 280 }} />
      <div className="grc-skeleton-grid">
        {range(3).map((index) => (
          <div key={index} className="grc-skeleton-card">
            <Skeleton active title paragraph={{ rows: 3 }} />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <Loading className="grc-skeleton-table">
      {range(rows + 1).map((row) => (
        <div
          key={row}
          className="grc-skeleton-row"
          style={{ gridTemplateColumns: `repeat(${String(columns)}, 1fr)` }}
        >
          {range(columns).map((column) => (
            <Skeleton.Input key={column} active block size="small" />
          ))}
        </div>
      ))}
    </Loading>
  );
}

export function CardListSkeleton({ cards }: { cards: number }) {
  return (
    <Loading className="grc-skeleton-cards">
      {range(cards).map((card) => (
        <div key={card} className="grc-skeleton-card">
          <Skeleton active title paragraph={{ rows: 2 }} />
        </div>
      ))}
    </Loading>
  );
}

export function ColumnsSkeleton({ columns }: { columns: number }) {
  return (
    <Loading className="grc-skeleton-columns">
      {range(columns).map((column) => (
        <div key={column} className="grc-skeleton-card">
          <Skeleton active title paragraph={{ rows: 6 }} />
        </div>
      ))}
    </Loading>
  );
}

/** The body of a dashboard widget: a few lines of text under its own heading. */
export function WidgetSkeleton({ rows }: { rows: number }) {
  return (
    <Loading className="grc-skeleton-widget">
      <Skeleton active title={false} paragraph={{ rows }} />
    </Loading>
  );
}
