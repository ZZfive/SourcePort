import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@sourceport/property-research": fileURLToPath(new URL("./packages/property-research/src/index.ts", import.meta.url)),
      "@sourceport/wuhan-housing": fileURLToPath(new URL("./sources/wuhan-housing/src/index.ts", import.meta.url)),
      "@sourceport/wuhan-listings": fileURLToPath(new URL("./sources/wuhan-listings/src/index.ts", import.meta.url)),
      "@sourceport/property-routes": fileURLToPath(new URL("./sources/property-routes/src/index.ts", import.meta.url)),
      "@sourceport/wuhan-property-miniprograms": fileURLToPath(new URL("./sources/wuhan-property-miniprograms/src/index.ts", import.meta.url)),
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
      "@sourceport/12365auto": fileURLToPath(
        new URL("./sources/12365auto/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "sources/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/live/**", "**/dist/**", "**/node_modules/**"],
  },
});
