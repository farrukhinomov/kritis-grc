import { useLocation, useNavigate, useSearchParams } from "react-router";

export interface CockpitPlace {
  framework: string | null;
  scope: string | null;
  paragraph: string | null;
  requirement: string | null;
}

const KEYS = ["framework", "scope", "paragraph", "requirement"] as const;

/** Marks history entries that went one level deeper, so "back" can return to them. */
const DRILL_STATE = { cockpit: "drill" } as const;

function isDrillEntry(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>).cockpit === DRILL_STATE.cockpit
  );
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

  const go = (change: Partial<CockpitPlace>, options: { replace?: boolean; drill?: boolean }) => {
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
      { replace: options.replace ?? false, ...(options.drill ? { state: DRILL_STATE } : {}) },
    );
  };

  return {
    place,
    /** Another Framework has other paragraphs, so the drill-down starts over. */
    selectFramework: (framework: string) => {
      go({ framework, scope: null, paragraph: null, requirement: null }, {});
    },
    /** The same place in another Scope, so two facilities can be compared directly. */
    selectScope: (scope: string) => {
      go({ scope }, {});
    },
    selectParagraph: (paragraph: string) => {
      go({ paragraph, requirement: null }, { drill: true });
    },
    selectRequirement: (requirement: string) => {
      go({ requirement }, { drill: true });
    },
    /**
     * One level up from what is shown. After a drill-down the level above is the previous
     * history entry, so going back there keeps the browser's history in step with the
     * screen; after a deep link there is none, and the URL is shortened in place.
     */
    back: (shown: { requirement: boolean }) => {
      if (isDrillEntry(state)) {
        void navigate(-1);
        return;
      }
      go(shown.requirement ? { requirement: null } : { paragraph: null, requirement: null }, {
        replace: true,
      });
    },
    /** Removes levels from the URL that don't exist, such as a Requirement from an old link. */
    discard: (change: Partial<CockpitPlace>) => {
      go(change, { replace: true });
    },
  };
}
