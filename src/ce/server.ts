import { cookies } from "next/headers";
import { isCommunity, EDITION_COOKIE } from "./edition";

/**
 * Server-side check for the Community Edition, usable in any server component or
 * route: true for a deployment-wide community build (NEO_EDITION) OR a viewer with
 * the /neo-ce-gated preview cookie. False = full product (production default).
 */
export async function communityActive(): Promise<boolean> {
  if (isCommunity()) return true;
  try {
    return (await cookies()).get(EDITION_COOKIE)?.value === "community";
  } catch {
    return false;
  }
}
