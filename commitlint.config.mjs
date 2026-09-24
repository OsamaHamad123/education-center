/**
 * Conventional Commits. Scopes mirror the modules in src/modules plus the
 * cross-cutting areas, so `git log --grep "^feat(attendance)"` stays useful.
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "branches",
        "users",
        "classes",
        "subjects",
        "students",
        "teachers",
        "timetable",
        "attendance",
        // Four modules the enum had drifted away from: `fees` and `portal` landed in
        // P5 and P2, `settings` has been there since Phase 2, and `assessments`
        // arrived 2026-09-24. The comment above says the scopes mirror src/modules;
        // this is what makes that true again.
        "assessments",
        "fees",
        "portal",
        "settings",
        "payroll",
        "reports",
        "lookup",
        "audit",
        "auth",
        "db",
        "ui",
        "shared",
        "config",
        "ci",
        "docs",
        "deps",
      ],
    ],
    "header-max-length": [2, "always", 100],
  },
};

export default config;
