import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession, createSession, revokeSession } from "@/server/sky/session";
import { isMember } from "@/server/sky/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ orgId: z.string().uuid() });

/**
 * POST /api/sky/orgs/switch — set the active organization for the current user.
 * Built-in (Sky) auth is single-active-org per session; switching re-issues the
 * session bound to the new org (after verifying membership) and retires the old one.
 */
export async function POST(req: NextRequest) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let orgId: string;
  try {
    orgId = Body.parse(await req.json()).orgId;
  } catch {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  if (orgId === s.orgId) return NextResponse.json({ ok: true, orgId });
  if (!(await isMember(s.userId, orgId))) {
    return NextResponse.json({ error: "You are not a member of that organization." }, { status: 403 });
  }

  await createSession({ userId: s.userId, orgId });
  await revokeSession(s.sessionId);
  return NextResponse.json({ ok: true, orgId });
}
