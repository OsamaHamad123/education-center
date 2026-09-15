import { requirePermission } from "@/shared/actions/create-action";
import type { Teacher } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { err, ok, type Result } from "@/shared/lib/result";
import { ar } from "@/shared/i18n/ar";
import { todayInCairo } from "@/shared/lib/time";
import {
  findTeacherById,
  listRateHistory,
  listTeacherBranches,
  recentSessions,
  weeklyLoad,
  type RateHistoryRow,
  type RecentSession,
  type TeacherBranchLink,
} from "../../infrastructure/teachers.repository";

export type TeacherProfile = {
  teacher: Teacher;
  branches: TeacherBranchLink[];
  /** Empty for a branch admin: rate history is super-admin only (section 3). */
  rateHistory: RateHistoryRow[];
  load: { branchName: string | null; slots: number }[];
  sessions: RecentSession[];
};

export async function getTeacherProfile(id: string): Promise<Result<TeacherProfile>> {
  const auth = await requirePermission("teacher.read");
  if (!auth.ok) return auth;

  const canSeeRates = auth.data.role === "super_admin";
  const since = todayInCairo(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const profile = await withTenant(auth.data, async (tx) => {
    const teacher = await findTeacherById(auth.data, tx, id);
    if (!teacher) return null;
    return {
      teacher,
      branches: await listTeacherBranches(auth.data, tx, id),
      rateHistory: canSeeRates ? await listRateHistory(auth.data, tx, id) : [],
      load: await weeklyLoad(auth.data, tx, id),
      sessions: await recentSessions(auth.data, tx, id, since),
    };
  });

  // A teacher not linked to the caller's branch is invisible, so a foreign id is
  // indistinguishable from a missing one.
  if (!profile) return err("NOT_FOUND", ar.errors.NOT_FOUND);
  return ok(profile);
}

export type { RateHistoryRow, RecentSession, TeacherBranchLink };
