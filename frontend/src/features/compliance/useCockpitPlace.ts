import { useLocation, useNavigate, useSearchParams } from "react-router";

export const PANELS = ["status", "evidence", "history"] as const;
export type Panel = (typeof PANELS)[number];

export interface CockpitPlace {
  framework: string | null;
  scope: string | null;
  paragraph: string | null;
  requirement: string | null;
  /** The open tab of the Implementation drawer; none when the drawer is closed. */
  panel: string | null;
}

const KEYS = ["framework", "scope", "paragraph", "requirement", "panel"] as const;

/** Marks history entries that opened something, so closing it can return to them. */
type EntryKind = "drill" | "panel";

function entryKind(state: unknown): EntryKind | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }
  const kind = (state as Record<string, unknown>).cockpit;
  return kind === "drill" || kind === "panel" ? kind : null;
}

/**
 * Where the user is in the cockpit, kept in the URL. A reload or a shared link opens the
 * same place, and every drill-down is a history entry, so the browser's back button and
 * the phone's back gesture return one level, as they would on any website.
 */
export function useCockpitPlace() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const state: unknown = useLocation().state;
  const place = Object.fromEntries(
    KEYS.map((key) => [key, params.get(key)]),
  ) as unknown as CockpitPlace;

  const go = (change: Partial<CockpitPlace>, options: { replace?: boolean; entry?: EntryKind }) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of KEYS) {
          if (key in change) {
            const value = change[key];
            if (value) {
              next.set(key, value);
            } else {
              next.delete(key);
            }
          }
        }
        return next;
      },
      {
        replace: options.replace ?? false,
        ...(options.entry ? { state: { cockpit: options.entry } } : {}),
      },
    );
  };

  return {
    place,
    /** Another Framework has other paragraphs, so the drill-down starts over. */
    selectFramework: (framework: string) => {
      go({ framework, scope: null, paragraph: null, requirement: null, panel: null }, {});
    },
    /** The same place in another Scope, so two facilities can be compared directly. */
    selectScope: (scope: string) => {
      go({ scope, panel: null }, {});
    },
    selectParagraph: (paragraph: string) => {
      go({ paragraph, requirement: null, panel: null }, { entry: "drill" });
    },
    selectRequirement: (requirement: string) => {
      go({ requirement, panel: null }, { entry: "drill" });
    },
    /**
     * One level up from what is shown. After a drill-down the level above is the previous
     * history entry, so going back there keeps the browser's history in step with the
     * screen; after a deep link there is none, and the URL is shortened in place.
     */
    back: (shown: { requirement: boolean }) => {
      if (entryKind(state) === "drill") {
        void navigate(-1);
        return;
      }
      go(shown.requirement ? { requirement: null } : { paragraph: null, requirement: null }, {
        replace: true,
      });
    },
    /** Opening the drawer is a history entry, so the phone's back gesture closes it. */
    openPanel: (panel: Panel) => {
      go({ panel }, { entry: "panel" });
    },
    /** Another tab of the open drawer replaces the entry instead of adding to history. */
    switchPanel: (panel: Panel) => {
      go({ panel }, { replace: true, entry: "panel" });
    },
    closePanel: () => {
      if (entryKind(state) === "panel") {
        void navigate(-1);
        return;
      }
      go({ panel: null }, { replace: true });
    },
    /** Removes levels from the URL that don't exist, such as a Requirement from an old link. */
    discard: (change: Partial<CockpitPlace>) => {
      go(change, { replace: true });
    },
  };
}
