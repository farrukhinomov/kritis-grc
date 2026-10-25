import { Button, Drawer } from "antd";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";

import { type SheetHeight, snapSheetHeight } from "./sheetSnap";

interface ResponsiveDrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Width of the side drawer on wide screens, in pixels. */
  width?: number;
  /**
   * Return focus to the control that opened it, on close. Turn off when closing goes
   * along with a navigation, which moves focus to the new page itself.
   */
  restoreFocus?: boolean;
}

const DEFAULT_WIDTH = 480;
const SHEET_HEIGHTS: Record<Exclude<SheetHeight, "closed">, string> = {
  half: "50dvh",
  full: "92dvh",
};

/**
 * Details next to the content on wide screens; a bottom sheet on phones, where a side
 * drawer would cover everything and be out of thumb reach. The sheet's handle can be
 * dragged between half and full height or down to close, and the same can be done with
 * the expand button, so the gesture is never the only way.
 */
export function ResponsiveDrawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = DEFAULT_WIDTH,
  restoreFocus = true,
}: ResponsiveDrawerProps) {
  const wide = useIsWideScreen();
  const focusable = { focusTriggerAfterClose: restoreFocus };

  if (wide) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={title}
        footer={footer}
        placement="right"
        size={width}
        focusable={focusable}
        destroyOnHidden
      >
        {children}
      </Drawer>
    );
  }
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      restoreFocus={restoreFocus}
    >
      {children}
    </BottomSheet>
  );
}

function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  restoreFocus,
}: Omit<ResponsiveDrawerProps, "width">) {
  const { t } = useTranslation();
  const [height, setHeight] = useState<Exclude<SheetHeight, "closed">>("half");
  // While the handle is dragged the sheet follows the finger; on release it snaps.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const expanded = height === "full";

  const close = () => {
    setHeight("half");
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title={title}
      footer={footer}
      placement="bottom"
      size={dragHeight ?? SHEET_HEIGHTS[height]}
      focusable={{ focusTriggerAfterClose: restoreFocus ?? true }}
      destroyOnHidden
      resizable={{
        onResize: setDragHeight,
        onResizeEnd: () => {
          if (dragHeight === null) {
            return;
          }
          const snapped = snapSheetHeight(dragHeight, window.innerHeight);
          setDragHeight(null);
          if (snapped === "closed") {
            close();
          } else {
            setHeight(snapped);
          }
        },
      }}
      extra={
        <Button
          type="text"
          aria-label={t(expanded ? "patterns.shrinkSheet" : "patterns.expandSheet")}
          icon={<AnimatedIcon preset={expanded ? "collapse" : "expand"} />}
          onClick={() => {
            setHeight(expanded ? "half" : "full");
          }}
        />
      }
    >
      {children}
    </Drawer>
  );
}
