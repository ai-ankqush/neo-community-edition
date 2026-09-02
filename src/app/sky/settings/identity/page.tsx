import { skyContext } from "../../_auth";
import IdentityManager from "./manager";
import MfaSection from "./mfa";
import MembersSection from "./members";

export const dynamic = "force-dynamic";

/**
 * Self-serve identity for a Sky tenant: register your own SSO provider (after proving you own the domain)
 * and issue service keys for agents that have no IdP of their own.
 */
export default async function SkyIdentityPage() {
  const { principal } = await skyContext();
  const isAdmin = principal.roles.includes("org_admin");

  return (
    <div className="mx-auto max-w-3xl">
      <a href="/" className="text-[12px] font-medium text-[var(--brand)] hover:underline">← Back to Neo Sky</a>
      <h1 className="mt-3 text-[24px] font-bold tracking-tight text-[var(--text)]">Identity &amp; access</h1>
      <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-[var(--muted)]">
        Bring your own identity provider for your people, and issue keys for the machines that don&apos;t have one.
        Either way, everything resolves to the same governed identity underneath.
      </p>

      {/* Everyone manages their own second factor. */}
      <div className="mt-7">
        <MfaSection />
      </div>

      {isAdmin ? (
        <div className="mt-6 space-y-6">
          <MembersSection />
          <IdentityManager />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-[13px] text-[var(--muted)]">
          Only an organization admin can manage SSO, service keys, and roles.
        </div>
      )}
    </div>
  );
}
