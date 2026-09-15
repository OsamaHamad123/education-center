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
