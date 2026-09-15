import { NextResponse } from "next/server";

/**
 * Liveness probe for the container and for e2e smoke tests.
 * Phase 10 extends this with a database ping (PROJECT_PLAN section 13.3).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", service: "education-center" });
}
