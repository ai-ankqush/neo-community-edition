import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession, createSession, revokeSession } from "@/server/sky/session";
import { orgsForUser, createOrgForUser } from "@/server/sky/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sky/orgs — the current user's organizations + which one is active. */
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgs = await orgsForUser(s.userId);
  return NextResponse.json({ orgs, activeOrgId: s.orgId });
}

const CreateBody = z.object({ name: z.string().min(1).max(120) });

/**
 * POST /api/sky/orgs — create a NEW organization owned by the current user and
 * switch into it. This is the built-in-auth equivalent of Clerk's "create org".
 */
export async function POST(req: NextRequest) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let name: string;
  try {
    name = CreateBody.parse(await req.json()).name;
  } catch {
    return NextResponse.json({ error: "Enter an organization name." }, { status: 400 });
  }

  const orgId = await createOrgForUser(s.userId, name);
  // Switch into the new org right away.
  await createSession({ userId: s.userId, orgId });
  await revokeSession(s.sessionId);
  return NextResponse.json({ ok: true, orgId });
}
