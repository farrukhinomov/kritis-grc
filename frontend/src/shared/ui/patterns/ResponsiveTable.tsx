import "./patterns.css";

import { Button, Dropdown, Table, type TableColumnsType } from "antd";
import { animate, m, type PanInfo, useMotionValue } from "motion/react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { duration, ease } from "@/shared/theme/motion";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";
import type { IconPreset } from "@/shared/ui/AnimatedIcon/presets";

import { CardListSkeleton, TableSkeleton } from "./Skeletons";
import { settlesOpen } from "./swipe";

export interface RowAction {
  key: string;
  label: string;
  icon: IconPreset;
  danger?: boolean;
  onSelect: () => void;
}

interface ResponsiveTableProps<T> {
  /** Names the table or list for screen readers. */
  label: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: TableColumnsType<T>;
  /** The phone layout: what one row looks like as a card. */
  renderCard: (row: T) => ReactNode;
  actions?: (row: T) => RowAction[];
  loading?: boolean;
}

const SKELETON_ROWS = 5;

/**
 * A table on wide screens and a card list on phones, where columns don't fit. On phones a
 * card swipes left to reveal its actions. Every action is also in the card's "Actions"
 * menu, because a swipe can't be discovered, nor done with a keyboard or screen reader.
 */
export function ResponsiveTable<T extends object>({
  label,
  rows,
  rowKey,
  columns,
  renderCard,
  actions,
  loading = false,
}: ResponsiveTableProps<T>) {
  const { t } = useTranslation();
  const wide = useIsWideScreen();

  if (loading) {
    return wide ? (
      <TableSkeleton rows={SKELETON_ROWS} columns={columns.length} />
    ) : (
      <CardListSkeleton cards={SKELETON_ROWS} />
    );
  }

  if (wide) {
    const actionColumn: TableColumnsType<T> = actions
      ? [
          {
            key: "actions",
            title: <span className="grc-visually-hidden">{t("patterns.actions")}</span>,
            align: "end",
            width: 64,
            render: (_, row) => <RowActionsMenu actions={actions(row)} />,
          },
        ]
      : [];
    return (
      <section aria-label={label}>
        <Table<T>
          columns={[...columns, ...actionColumn]}
          dataSource={[...rows]}
          rowKey={rowKey}
          pagination={false}
          // A table wider than its box scrolls inside it rather than widening the page.
          scroll={{ x: "max-content" }}
        />
      </section>
    );
  }

  return (
    <ul className="grc-card-list" aria-label={label}>
      {rows.map((row) => (
        <li key={rowKey(row)}>
          <SwipeableCard actions={actions?.(row) ?? []}>{renderCard(row)}</SwipeableCard>
        </li>
      ))}
    </ul>
  );
}

function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const { t } = useTranslation();

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items: actions.map((action) => ({
          key: action.key,
          label: action.label,
          danger: action.danger ?? false,
          icon: <AnimatedIcon preset={action.icon} />,
          onClick: action.onSelect,
        })),
      }}
    >
      <Button
        type="text"
        aria-label={t("patterns.actions")}
        icon={<AnimatedIcon preset="more" />}
      />
    </Dropdown>
  );
}

const SWIPE_ACTION_WIDTH = 80;
const settle = { duration: duration.base, ease: ease.standard };

/** A card that swipes left to reveal its actions, which its "Actions" menu offers too. */
export function SwipeableCard({
  actions,
  children,
}: {
  actions: RowAction[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);
  const revealed = actions.length * SWIPE_ACTION_WIDTH;

  // The card is moved explicitly to one end after every drag, so it can never rest
  // half-open with its actions partly visible but unusable.
  const settleTo = (nextOpen: boolean) => {
    setOpen(nextOpen);
    void animate(x, nextOpen ? -revealed : 0, settle);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    settleTo(settlesOpen(x.get(), info.velocity.x, revealed));
  };

  return (
    <div className="grc-swipe">
      {actions.length > 0 && (
        // Behind the card while closed; inert keeps it out of the tab order until revealed.
        <div className="grc-swipe-actions" inert={!open}>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="grc-swipe-action"
              data-danger={action.danger ?? false}
              style={{ width: SWIPE_ACTION_WIDTH }}
              onClick={() => {
                settleTo(false);
                action.onSelect();
              }}
            >
              <AnimatedIcon preset={action.icon} size={20} />
              {action.label}
            </button>
          ))}
        </div>
      )}
      <m.div
        className="grc-swipe-card"
        drag={actions.length > 0 ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: -revealed, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={onDragEnd}
      >
        <div className="grc-swipe-content">{children}</div>
        {actions.length > 0 && <RowActionsMenu actions={actions} />}
      </m.div>
    </div>
  );
}
