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
      "@sourceport/car-research": fileURLToPath(
        new URL("./packages/car-research/src/index.ts", import.meta.url),
      ),
      "@sourceport/decision-context": fileURLToPath(
        new URL("./packages/decision-context/src/index.ts", import.meta.url),
      ),
      "@sourceport/dongchedi": fileURLToPath(
        new URL("./sources/dongchedi/src/index.ts", import.meta.url),
      ),
      "@sourceport/autohome": fileURLToPath(
        new URL("./sources/autohome/src/index.ts", import.meta.url),
      ),
      "@sourceport/brave-search": fileURLToPath(
        new URL("./sources/brave-search/src/index.ts", import.meta.url),
      ),
      "@sourceport/kr36": fileURLToPath(
        new URL("./sources/kr36/src/index.ts", import.meta.url),
      ),
      "@sourceport/xiaohongshu": fileURLToPath(
        new URL("./sources/xiaohongshu/src/index.ts", import.meta.url),
      ),
      "@sourceport/samr": fileURLToPath(
        new URL("./sources/samr/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "sources/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/live/**", "**/dist/**", "**/node_modules/**"],
  },
});
