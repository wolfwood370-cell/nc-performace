import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tailwindcss from "eslint-plugin-tailwindcss";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/integrations/supabase/types.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      tailwindcss,
    },
    settings: {
      tailwindcss: {
        // Not optional. Left to itself the plugin looks for
        // `tailwind.config.js`, does NOT fail when it is missing, and falls
        // back to the stock Tailwind config — under which every Aura token
        // (`bg-surface-container-lowest`, `text-on-surface-variant`, …)
        // would be reported as a custom class. Canary for a regression
        // here: `bg-surface-container-lowest` must stay unreported.
        config: "tailwind.config.ts",
        // `cn` is this repo's class merger. The plugin's defaults do not
        // include it, and most severity classes live inside a `cn(...)`
        // call rather than in a bare `className`.
        callees: ["cn", "clsx", "cva", "classnames", "twMerge"],
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Project-wide conventions introduced during Phase 0 cleanup. The
      // `no-console` rule allows warn/error (which the audit will graduate
      // to a logger) and FLAGS new console.log/info — as a warning, not a
      // gate: the CI ratchet counts `errorCount` only (see the note below),
      // `npm run lint` has no `--max-warnings`, and `.husky/pre-commit` does
      // not run eslint at all. Deliberate: see the `error`-vs-`warn` note at
      // the tailwindcss rule below.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // A Tailwind class that does not exist is not a type error and not a
      // failing test: it is CSS that is not there. `bg-error-container`
      // reached production through green `tsc`, green eslint and 170 green
      // tests, and the coach read a severity pill with no colour on it.
      // `error`, not `warn`: the CI ratchet counts `errorCount` only
      // (.github/workflows/ci.yml), so a warning would leave the gate open.
      // Known limit: the rule reads literal `className` attributes and
      // strings inside the `callees` above. Class strings returned from a
      // helper object (`severityPill()` in CoachHome) stay out of reach —
      // it covers half of the known call sites, not all of them. The
      // complete proof is `npm run verify:css`, on the built stylesheet.
      "tailwindcss/no-custom-classname": "error",
    },
  },
);
