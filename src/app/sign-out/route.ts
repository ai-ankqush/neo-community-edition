import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { destroyCurrentSession } from "@/server/sky/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /sign-out — a sign-out that does NOT depend on Clerk's client components.
 *
 * Community Edition (built-in Sky auth) has no Clerk: destroy the Sky session
 * (deletes the row + clears the cookie) and return to the login screen.
 *
 * Clerk path: revoke the session SERVER-side (secret key, no browser SDK) and
 * clear the session cookies, so it works even when client-side Clerk is broken.
 * Deliberately a plain link — no JS required.
 */
export async function GET(req: NextRequest) {
  if (AUTH_PROVIDER === "builtin") {
    try {
      await destroyCurrentSession();
    } catch (e) {
      console.error("SIGN OUT (sky) failed", e);
    }
    return NextResponse.redirect(new URL("/sky/login", req.url));
  }

  try {
    const { sessionId } = await auth();
    if (sessionId) {
      const client = await clerkClient();
      await client.sessions.revokeSession(sessionId);
    }
  } catch (e) {
    // Even if revocation fails (broken/expired session), still clear cookies below — the point is to get out.
    console.error("SIGN OUT revoke failed", e);
  }

  const res = NextResponse.redirect(new URL("/sign-in", req.url));

  // Clear Clerk's cookies on both the exact host and the parent domain (Clerk uses a custom domain here, so
  // the cookie may be scoped to .neocontrol.ai).
  const names = ["__session", "__client_uat", "__clerk_db_jwt", "__refresh"];
  for (const name of names) {
    res.cookies.set({ name, value: "", maxAge: 0, path: "/" });
    res.cookies.set({ name, value: "", maxAge: 0, path: "/", domain: ".neocontrol.ai" });
  }
  return res;
}
