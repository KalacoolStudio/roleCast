import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "data/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.jsx"],
    plugins: { react },
    rules: { "react/jsx-uses-vars": "error", "react/jsx-uses-react": "error" },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
