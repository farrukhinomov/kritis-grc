import "./patterns.css";

import { Button, Typography } from "antd";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { duration, ease } from "@/shared/theme/motion";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";

export interface DrillColumn {
  key: string;
  title: string;
  content: ReactNode;
}

interface ColumnDrillDownProps {
  /** Names the whole drill-down for screen readers. */
  label: string;
  /** The open levels, outermost first. The caller decides what opens and closes. */
  columns: readonly DrillColumn[];
  onBack: () => void;
}

const SLIDE_DISTANCE = 48;
const transition = { duration: duration.base, ease: ease.standard };

/**
 * Hierarchies (paragraph → Requirement → Implementation) as side-by-side columns on wide
 * screens, where the path stays visible, and as stacked screens with a back button on
 * phones, where only one level fits.
 */
export function ColumnDrillDown({ label, columns, onBack }: ColumnDrillDownProps) {
  const wide = useIsWideScreen();
  const baseId = useId();

  return wide ? (
    <div className="grc-drill" role="group" aria-label={label}>
      <AnimatePresence initial={false}>
        {columns.map((column, index) => (
          <m.section
            key={column.key}
            className="grc-drill-column"
            aria-labelledby={`${baseId}-${String(index)}`}
            initial={{ opacity: 0, x: SLIDE_DISTANCE }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: SLIDE_DISTANCE }}
            transition={transition}
          >
            <ColumnTitle id={`${baseId}-${String(index)}`} title={column.title} />
            {column.content}
          </m.section>
        ))}
      </AnimatePresence>
    </div>
  ) : (
    <StackedColumns label={label} columns={columns} onBack={onBack} />
  );
}

function StackedColumns({ label, columns, onBack }: ColumnDrillDownProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const depth = columns.length;
  const current = columns.at(-1);
  // Going deeper slides in from the right, going back from the left.
  const [previousDepth, setPreviousDepth] = useState(depth);
  const [direction, setDirection] = useState(1);
  if (depth !== previousDepth) {
    setDirection(depth > previousDepth ? 1 : -1);
    setPreviousDepth(depth);
  }
  const titleId = `${headingId}-${String(depth)}`;
  useFocusTitleOnDepthChange(depth, titleId);

  if (!current) {
    return null;
  }

  return (
    <div className="grc-drill-stack" role="group" aria-label={label}>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <m.section
          key={current.key}
          aria-labelledby={titleId}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ opacity: 0, x: dir * SLIDE_DISTANCE }),
            center: { opacity: 1, x: 0 },
            exit: (dir: number) => ({ opacity: 0, x: -dir * SLIDE_DISTANCE }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
        >
          {depth > 1 && (
            <Button type="text" icon={<AnimatedIcon preset="back" />} onClick={onBack}>
              {t("patterns.back")}
            </Button>
          )}
          <ColumnTitle id={titleId} title={current.title} />
          {current.content}
        </m.section>
      </AnimatePresence>
    </div>
  );
}

/**
 * Drilling in or back replaces the screen, and the button that was used disappears with
 * it. Focus moves to the new level's title, so keyboard and screen reader users continue
 * there instead of at the top of the page. The first render is left alone.
 */
function useFocusTitleOnDepthChange(depth: number, titleId: string) {
  const previousDepth = useRef(depth);

  useEffect(() => {
    if (previousDepth.current === depth) {
      return;
    }
    previousDepth.current = depth;
    const title = document.getElementById(titleId);
    if (title) {
      title.tabIndex = -1;
      title.focus();
    }
  }, [depth, titleId]);
}

function ColumnTitle({ id, title }: { id: string; title: string }) {
  return (
    <Typography.Title level={2} id={id} className="grc-drill-title">
      {title}
    </Typography.Title>
  );
}
