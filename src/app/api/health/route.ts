import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/shared/db/client";

/**
 * Liveness AND readiness (PROJECT_PLAN 13.3; docs/SECURITY-REVIEW.md, finding 7).
 *
 * It touches the database, because a container whose database has gone away is not
 * healthy and a load balancer that keeps routing to it is the outage.
 *
 * It reports nothing else. No version, no hostname, no error text: this is usually
 * the most exposed route on a deployment, and it only needs to answer "send traffic
 * here, yes or no".
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
