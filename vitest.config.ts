import { defineConfig } from "vitest/config";

/**
 * Two projects with different needs:
 *  - `unit` runs pure `domain/` and `shared/lib` logic, in parallel, no I/O.
 *  - `integration` runs use cases and RLS policies against a real Postgres, so it
 *    must run one file at a time to avoid two suites truncating each other's data.
 *
 * Both inherit `resolve` and plugins from this file, so `@/*` works everywhere.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: false,
    // The integration project is empty until Phase 1 adds the schema and policies.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/helpers/setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/modules/**/domain/**", "src/shared/lib/**"],
      exclude: ["**/*.test.ts"],
    },
  },
});
