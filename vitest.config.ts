import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@sourceport/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@sourceport/testing": fileURLToPath(
        new URL("./packages/testing/src/index.ts", import.meta.url),
      ),
      "@sourceport/dongchedi": fileURLToPath(
        new URL("./sources/dongchedi/src/index.ts", import.meta.url),
      ),
      "@sourceport/autohome": fileURLToPath(
        new URL("./sources/autohome/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "sources/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/live/**", "**/dist/**", "**/node_modules/**"],
  },
});
