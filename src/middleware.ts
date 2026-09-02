import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextMiddleware } from "next/server";
import { isCommunity, isCommunityCookie, EDITION_COOKIE, isBlockedPage, isBlockedApi } from "@/ce/edition";
import { AUTH_PROVIDER } from "@/ce/auth-provider";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sign-out",            // server-side sign-out; must always be reachable, even with a broken/expired session
  "/trust(.*)",
  "/api/health",
  "/api/inngest(.*)", // Inngest calls this server-to-server (verified by signing key)
  "/api/cron(.*)",    // Vercel Cron calls this (verified by CRON_SECRET)
  "/api/billing/webhook", // Stripe calls this (verified by the signing secret)
  "/api/clerk/webhook",   // Clerk calls this (verified by the signing secret)
  "/api/account/confirm", // dormancy keep-alive link (token-based, no login)
  "/api/founding/lead",   // public marketing-site Founding application (no login; honeypot + CORS-guarded)
  "/api/public/ask-neo",  // public marketing-site Ask Neo concierge (no login; honeypot + CORS + rate-limited)
  "/tour(.*)",            // public read-only product demo / guided tour (fictional demo org only; write APIs stay protected)
  "/scan(.*)",            // public "Red Team first" cold-open — describe your AI, see the exposure (indicative, no login)
  "/api/scan",            // scan endpoint (honeypot + rate-limited; runs a single cheap classify)
  "/pal",                 // public PAL frontier — published findings TEASERS only (method is gated behind sign-in)
  "/pal/(.*)",            // teaser detail pages
  "/api/public/pal",      // public frontier feed (teasers only, CORS-guarded)
  "/vendor-portal(.*)",   // scoped vendor answer portal (per-review token, no org login)
  "/api/vendor-portal(.*)", // vendor portal submit (token-verified, no login)
  "/api/action-fabric/decide", // external apps call this with an ingest key (Bearer naf_…), not a login
  "/api/action-fabric/ingest", // audit-log collector, same ingest-key auth
  "/api/sky(.*)",              // Sky is Clerk-free end to end — every Sky API enforces its OWN session
]);

// Portal subdomains — one runtime, distinct hosts. gravity.neocontrol.ai serves the /gravity portal,
// sky.neocontrol.ai serves the /sky portal — separate interfaces from the AI Control Architecture console.
const PORTAL_SUBS = new Set(["gravity", "sky"]);

// Community-Edition module gating — shared by both auth paths. Active for a deployment-wide
// community build (NEO_EDITION) OR a per-viewer preview cookie set at /neo-ce-gated.
// No env flag and no cookie = full product, unchanged.
function communityGate(req: NextRequest): NextResponse | null {
  const path = req.nextUrl.pathname;
  const community = isCommunity() || isCommunityCookie(req.cookies.get(EDITION_COOKIE)?.value);
  if (!community) return null;
  if (isBlockedApi(path)) {
    return new NextResponse(JSON.stringify({ error: "not available in Community Edition" }), { status: 404, headers: { "content-type": "application/json" } });
  }
  if (isBlockedPage(path)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return null;
}

// Built-in (Clerk-free) middleware — Community Edition / AUTH_PROVIDER=builtin. Never touches Clerk,
// so a self-host with no Clerk keys boots. The Neo-native Sky session guards the console; gravity
// (internal, Clerk-only) is not served in this mode.
const builtinMiddleware: NextMiddleware = (req) => {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  const sub = host.split(".")[0];
  const path = req.nextUrl.pathname;

  if (
    PORTAL_SUBS.has(sub) && sub !== "gravity" &&
    !path.startsWith("/_next") &&
    !path.startsWith("/api") &&
    !path.startsWith("/sign-in") &&
    !path.startsWith("/sign-up") &&
    !path.startsWith(`/${sub}`)
  ) {
    const url = req.nextUrl.clone();
    url.pathname = `/${sub}${path === "/" ? "" : path}`;
    return NextResponse.rewrite(url);
  }

  if (!isPublicRoute(req)) {
    // Sky's auth pages link to bare /login, /signup, /reset — serve them from /sky/* on the CE host.
    if (["/login", "/signup", "/reset"].includes(path)) {
      const url = req.nextUrl.clone();
      url.pathname = "/sky" + path;
      return NextResponse.rewrite(url);
    }
    const signedIn = Boolean(req.cookies.get("sky_session")?.value);
    const skyArea = path.startsWith("/sky") || path.startsWith("/api/sky");
    if (!signedIn && !skyArea) {
      const url = req.nextUrl.clone();
      url.pathname = "/sky/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
  }

  return communityGate(req) ?? NextResponse.next();
};

// Clerk middleware — default / production path (AUTH_PROVIDER=clerk). Behavior unchanged.
// Only constructed when not in built-in mode, so Clerk keys are not required for a CE self-host.
export default (AUTH_PROVIDER === "builtin"
  ? builtinMiddleware
  : clerkMiddleware(async (auth, req) => {
      const host = (req.headers.get("host") ?? "").split(":")[0];
      const sub = host.split(".")[0];
      const path = req.nextUrl.pathname;

      if (
        PORTAL_SUBS.has(sub) &&
        !path.startsWith("/_next") &&
        !path.startsWith("/api") &&        // APIs stay shared across hosts
        !path.startsWith("/sign-in") &&    // shared auth pages
        !path.startsWith("/sign-up") &&
        !path.startsWith(`/${sub}`)        // avoid double-prefixing
      ) {
        // Gravity is internal and stays behind Clerk for now. Sky is the customer product with its OWN
        // Neo-native auth (no Clerk) — it enforces its session per-page and redirects unauthenticated users
        // to /login itself, so we only host-rewrite here.
        if (sub === "gravity") await auth.protect();
        const url = req.nextUrl.clone();
        url.pathname = `/${sub}${path === "/" ? "" : path}`;
        return NextResponse.rewrite(url);
      }

      if (!isPublicRoute(req)) {
        if (AUTH_PROVIDER === "builtin") {
          // Sky's auth pages link to bare /login, /signup, /reset (they rely on the sky.* host
          // rewrite). On the CE host, serve those from /sky/* so the links work.
          if (["/login", "/signup", "/reset"].includes(path)) {
            const url = req.nextUrl.clone();
            url.pathname = "/sky" + path;
            return NextResponse.rewrite(url);
          }
          // Community Edition auth: the Neo-native Sky session guards the console. Sky's own
          // pages + APIs self-enforce, so let them through to run sign-in; everyone else with
          // no session is sent to the built-in login. (Default AUTH_PROVIDER=clerk skips all this.)
          const signedIn = Boolean(req.cookies.get("sky_session")?.value);
          const skyArea = path.startsWith("/sky") || path.startsWith("/api/sky");
          if (!signedIn && !skyArea) {
            const url = req.nextUrl.clone();
            url.pathname = "/sky/login";
            url.searchParams.set("next", path);
            return NextResponse.redirect(url);
          }
        } else {
          await auth.protect();
        }
      }

      // Community Edition: the paid modules are hidden from the nav; block them here too so a direct
      // URL or API call can't reach them.
      const community = isCommunity() || isCommunityCookie(req.cookies.get(EDITION_COOKIE)?.value);
      if (community) {
        if (isBlockedApi(path)) {
          return new NextResponse(JSON.stringify({ error: "not available in Community Edition" }), { status: 404, headers: { "content-type": "application/json" } });
        }
        if (isBlockedPage(path)) {
          const url = req.nextUrl.clone();
          url.pathname = "/dashboard";
          return NextResponse.redirect(url);
        }
      }
    })) as NextMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
