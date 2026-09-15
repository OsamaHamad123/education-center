/**
 * The whole database schema. `drizzle.config.ts` points here, so a table that is not
 * exported from this file does not exist as far as migrations are concerned.
 */
export * from "./enums";
export * from "./branches";
export * from "./auth";
export * from "./classes";
export * from "./teachers";
export * from "./students";
export * from "./timetable";
export * from "./sessions";
export * from "./system";
