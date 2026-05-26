import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.output/**",
      "**/.next/**",
      "**/.source/**",
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/pnpm-lock.yaml",
      "**/.wxt/**",
      "packages/bookmarklet/generated/**",
      "goals/**"
    ]
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
);
