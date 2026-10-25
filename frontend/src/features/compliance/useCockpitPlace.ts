import { useSearchParams } from "react-router";

export interface CockpitPlace {
  framework: string | null;
  scope: string | null;
  paragraph: string | null;
  requirement: string | null;
}

const KEYS = ["framework", "scope", "paragraph", "requirement"] as const;

/**
 * Where the user is in the cockpit, kept in the URL. A reload or a shared link opens the
 * same place, and every drill-down is a history entry, so the browser's back button and
 * the phone's back gesture return one level, as they would on any website.
 */
export function useCockpitPlace() {
  const [params, setParams] = useSearchParams();
  const place = Object.fromEntries(
    KEYS.map((key) => [key, params.get(key)]),
  ) as unknown as CockpitPlace;

  const go = (change: Partial<CockpitPlace>, { replace = false } = {}) => {
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
      { replace },
    );
  };

  return {
    place,
    /** Another Framework has other paragraphs, so the drill-down starts over. */
    selectFramework: (framework: string) => {
      go({ framework, scope: null, paragraph: null, requirement: null });
    },
    /** The same place in another Scope, so two facilities can be compared directly. */
    selectScope: (scope: string) => {
      go({ scope });
    },
    selectParagraph: (paragraph: string) => {
      go({ paragraph, requirement: null });
    },
    selectRequirement: (requirement: string) => {
      go({ requirement });
    },
    /** The in-app back button closes the deepest level without adding history. */
    back: () => {
      go(place.requirement ? { requirement: null } : { paragraph: null }, { replace: true });
    },
  };
}
