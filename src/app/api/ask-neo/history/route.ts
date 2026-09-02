import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rbac";
import { getMine, getTop, clearMine } from "@/server/ask-neo/history";

export const dynamic = "force-dynamic";

/** GET → { mine: string[], top: {question,count}[] } for the Ask Neo panel. */
export async function GET() {
  try {
    const session = await requireSession();
    const [mine, top] = await Promise.all([
      getMine(session.internalOrgId, session.userId),
      getTop(session.internalOrgId),
    ]);
    return NextResponse.json({ mine, top });
  } catch {
    return NextResponse.json({ mine: [], top: [] });
  }
}

/** POST { action: "clear" } → wipe this user's history. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));
    if (body?.action === "clear") await clearMine(session.internalOrgId, session.userId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
