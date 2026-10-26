import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { COLOR_MODE_STORAGE_KEY, DARK_SCHEME_QUERY } from "./colorMode";

// Vitest runs from the frontend folder, where public/ holds the files served as they are.
const SCRIPT = readFileSync(resolve("public/color-mode.js"), "utf8");

interface Root {
  dataset: Record<string, string>;
  style: Record<string, string>;
}

function runScript(stored: string | null, systemDark: boolean, storageThrows = false): Root {
  const root: Root = { dataset: {}, style: {} };
  const queries: string[] = [];
  runInNewContext(SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) {
          throw new Error("blocked");
        }
        return key === COLOR_MODE_STORAGE_KEY ? stored : null;
      },
    },
    window: {
      matchMedia: (query: string) => {
        queries.push(query);
        return { matches: query === DARK_SCHEME_QUERY && systemDark };
      },
    },
    document: { documentElement: root },
  });
  return root;
}

describe("the pre-paint color mode script", () => {
  it.each([
    { stored: "dark", systemDark: false, expected: "dark" },
    { stored: "light", systemDark: true, expected: "light" },
    { stored: "system", systemDark: true, expected: "dark" },
    { stored: "system", systemDark: false, expected: "light" },
    { stored: null, systemDark: false, expected: "light" },
    // Nothing chosen yet: light, even on a dark system.
    { stored: null, systemDark: true, expected: "light" },
    { stored: "sepia", systemDark: true, expected: "light" },
  ])("applies $expected for stored=$stored and system dark=$systemDark", (scenario) => {
    const root = runScript(scenario.stored, scenario.systemDark);

    expect(root.dataset.colorMode).toBe(scenario.expected);
    expect(root.style.colorScheme).toBe(scenario.expected);
  });

  it("is loaded by index.html as a blocking script before the app", () => {
    const html = readFileSync(resolve("index.html"), "utf8");
    const prePaint = html.indexOf('<script src="/color-mode.js"></script>');

    expect(prePaint).toBeGreaterThan(-1);
    expect(prePaint).toBeLessThan(html.indexOf("</head>"));
    expect(prePaint).toBeLessThan(html.indexOf('type="module"'));
  });

  it("falls back to light when storage is blocked", () => {
    expect(runScript(null, true, true).dataset.colorMode).toBe("light");
  });
});
