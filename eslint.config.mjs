// ESLint flat config for the Zonaed AI extension.
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/** Minimal runtime globals (no extra dependency). */
const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  Buffer: "readonly",
  fetch: "readonly",
  URL: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
};
const browserGlobals = {
  ...nodeGlobals,
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  Request: "readonly",
  Response: "readonly",
  FormData: "readonly",
};

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "*.config.mjs"],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: browserGlobals },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
);