import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Local rule tuning: keep signal high, avoid blocking merges on stylistic / overly-strict rules.
  {
    rules: {
      // This rule is useful but currently too noisy across route handlers/tests.
      "@typescript-eslint/no-explicit-any": "warn",

      // These two are overly strict for our current polling-style components.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Generated / vendor-ish folders we don't want to block merges on.
    "coverage/**",
    ".source/**",
  ]),
]);

export default eslintConfig;
