import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const security = require("eslint-plugin-security");

const reactHooksRecommended = reactHooksPlugin.configs.flat["recommended"];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs}"],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...reactHooksRecommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs}"],
    plugins: {
      security,
    },
    rules: {
      "security/detect-eval-with-expression": "warn",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-unsafe-regex": "warn",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-child-process": "warn",
      "security/detect-bidi-characters": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", "production_artifacts/**", ".unlighthouse/**", "coverage/**", ".engram/**", "test-results/**", "playwright-report/**", "playwright/.cache/**"],
  },
);
