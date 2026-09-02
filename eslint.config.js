import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "src/integrations/**", "scripts/**", "*.js", "*.cjs", "*.mjs"] },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    extends: [],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "prefer-const": "off",
      "no-useless-escape": "off",
      "no-case-declarations": "off",
      "no-constant-condition": "off",
      "no-fallthrough": "off",
      "no-cond-assign": "off",
      "no-undef": "off",
      "no-redeclare": "off",
      "no-prototype-builtins": "off",
      "no-async-promise-executor": "off",
      "no-control-regex": "off",
      "no-misleading-character-class": "off",
      "@typescript-eslint/no-wrapper-object-types": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "@typescript-eslint/prefer-as-const": "off",
      "no-useless-catch": "off",
      "no-empty": "off",
      "no-irregular-whitespace": "off",
      "no-self-assign": "off",
      "no-loss-of-precision": "off",
      "no-unused-vars": "off",
      "no-extra-boolean-cast": "off",
    },
  },
);
