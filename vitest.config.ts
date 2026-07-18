import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "sources/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/live/**", "**/dist/**", "**/node_modules/**"],
  },
});
