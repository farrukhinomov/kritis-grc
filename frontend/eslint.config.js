import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

// Colors come only from the design tokens, so Themes and dark mode stay consistent.
const RAW_COLOR_MESSAGE = "Use a semantic design token instead of a raw color.";
const RAW_COLORS = [
  { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]", message: RAW_COLOR_MESSAGE },
  { selector: "Literal[value=/^(rgb|hsl)a?[(]/]", message: RAW_COLOR_MESSAGE },
];

export default tseslint.config(
  { ignores: ["dist", "coverage", "public/mockServiceWorker.js"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.strict,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
      "no-restricted-syntax": ["error", ...RAW_COLORS],
      "no-console": "error",
    },
  },
  {
    files: ["src/shared/theme/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**", "src/mocks/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
