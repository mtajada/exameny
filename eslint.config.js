import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "supabase/functions/**"] },
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword'], TSTypeAssertion[typeAnnotation.type='TSAnyKeyword']",
          message: "Avoid casting to any. Use a proper type or narrow the value.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSUnknownKeyword'], TSTypeAssertion[typeAnnotation.type='TSUnknownKeyword']",
          message: "Avoid casting to unknown. Use a proper type guard or model the value.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSNeverKeyword'], TSTypeAssertion[typeAnnotation.type='TSNeverKeyword']",
          message: "Avoid casting to never. Fix the types or refactor the API to be mockable without casting.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='Record'], TSTypeAssertion[typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='Record']",
          message: "Avoid casting to Record<...>. Use a type guard or a domain-specific type.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='JsonRecord'], TSTypeAssertion[typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='JsonRecord']",
          message: "Avoid casting to JsonRecord. Use a type guard or a domain-specific type.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='PlainRecord'], TSTypeAssertion[typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='PlainRecord']",
          message: "Avoid casting to PlainRecord. Use a type guard or a domain-specific type.",
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  }
);
