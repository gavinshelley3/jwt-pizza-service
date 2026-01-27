import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  js.configs.recommended,
  {
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    files: ["**/*.test.js", "**/*.spec.js"],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ["**/*testUtils.js"],
    languageOptions: { globals: globals.jest },
  },
  {
    ...pluginReact.configs.flat.recommended,
    settings: { react: { version: "18.0" } },
  },
]);
