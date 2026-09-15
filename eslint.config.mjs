import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/**
 * Architecture rules 1–4 of CLAUDE.md are enforced here with `no-restricted-imports`.
 * They are not style preferences: they are what keeps the modular monolith from
 * collapsing into a ball of mud, so they are errors and must never be disabled.
 */

/** A module may only be reached through its public `index.ts` (rule 3). */
const CROSS_MODULE_DEEP_IMPORT = {
  group: ["@/modules/*/*", "@/modules/*/*/**"],
  message:
    "استورد من الواجهة العامة للوحدة فقط: '@/modules/<module>'. الاستيراد العميق ممنوع (CLAUDE.md، قاعدة 3). داخل نفس الوحدة استخدم مساراً نسبياً.",
};

/** `domain/` is pure TypeScript: no framework, no database (rule 4). */
const DOMAIN_MUST_STAY_PURE = [
  {
    group: ["next", "next/*", "react", "react-dom", "react/*", "drizzle-orm", "drizzle-orm/*", "postgres"],
    message:
      "طبقة domain يجب أن تبقى TypeScript خالصاً: ممنوع استيراد next أو react أو drizzle-orm (CLAUDE.md، قاعدة 4).",
  },
  {
    group: ["@/shared/db", "@/shared/db/**"],
    message: "طبقة domain لا تعرف شيئاً عن قاعدة البيانات (CLAUDE.md، قاعدة 4).",
  },
];

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "drizzle/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),

  ...nextVitals,
  ...nextTs,

  // Type-aware linting for our own source. Rules like no-floating-promises catch
  // un-awaited server actions, which is exactly the class of bug we cannot afford.
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-expect-error": "allow-with-description", "ts-nocheck": true },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": ["error", { patterns: [CROSS_MODULE_DEEP_IMPORT] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Rule 4: domain purity.
  {
    files: ["src/modules/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [CROSS_MODULE_DEEP_IMPORT, ...DOMAIN_MUST_STAY_PURE] }],
    },
  },

  // Seed and scripts legitimately print to the console.
  {
    files: ["src/shared/db/seed.ts", "scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
]);
