import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

export interface DrillItem {
  key: string;
  content: ReactNode;
}

interface DrillListProps {
  label: string;
  items: readonly DrillItem[];
  selected: string | null;
  onSelect: (key: string) => void;
  /** Right arrow opens the item; with a next list it moves on to it. */
  onForward?: (key: string) => void;
  /** Left arrow returns to the previous column. */
  onBackward?: () => void;
  /** Set when the keyboard moved here; focus lands on the selected or first item. */
  focusRequested: boolean;
  onFocused: () => void;
}

/**
 * One column of the cockpit as a list of buttons with a single tab stop. Up and down move
 * within the column, Home and End jump to its ends, right opens an item and continues in
 * the next column, left returns to the previous one. Tab leaves the column, so a keyboard
 * user crosses the cockpit in a few presses instead of one per row.
 */
export function DrillList({
  label,
  items,
  selected,
  onSelect,
  onForward,
  onBackward,
  focusRequested,
  onFocused,
}: DrillListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const tabStop = items.some((item) => item.key === selected) ? selected : items[0]?.key;

  useEffect(() => {
    if (!focusRequested || items.length === 0) {
      return;
    }
    listRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    onFocused();
  }, [focusRequested, items.length, onFocused]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = buttons.indexOf(event.currentTarget);
    const focusAt = (target: number) => {
      event.preventDefault();
      buttons[Math.max(0, Math.min(target, buttons.length - 1))]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(buttons.length - 1);
        break;
      case "ArrowRight":
        if (onForward) {
          event.preventDefault();
          onForward(key);
        }
        break;
      case "ArrowLeft":
        if (onBackward) {
          event.preventDefault();
          onBackward();
        }
        break;
      default:
    }
  };

  return (
    <ul ref={listRef} aria-label={label} className="grc-drill-list">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            className="grc-drill-item"
            data-key={item.key}
            tabIndex={item.key === tabStop ? 0 : -1}
            aria-current={item.key === selected ? "true" : undefined}
            onClick={() => {
              onSelect(item.key);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, item.key);
            }}
          >
            {item.content}
          </button>
        </li>
      ))}
    </ul>
  );
}
