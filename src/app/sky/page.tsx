import { Boxes, Landmark, Plug } from "lucide-react";
import { skyContext } from "./_auth";
import LogoutButton from "./_logout";
import PasskeysManager from "./_passkeys-manager";

export const dynamic = "force-dynamic";

/**
 * Neo Sky portal landing. Now gated by the Neo-native Sky session (no Clerk) — unauthenticated visitors are
 * redirected to /login. Authoring (overlay/constitution, framework mapping, integration composing) is the
 * deferred build; this is the signed-in front door.
 */
export default async function SkyPortalPage() {
  const { email, displayName } = await skyContext();
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[12px] text-[var(--muted)]">Signed in as <span className="font-semibold text-[var(--text)]">{displayName || email}</span></span>
        <div className="flex items-center gap-2">
          <a href="/settings/identity" className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">Identity &amp; access</a>
          <LogoutButton />
        </div>
      </div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand)]">Neo Sky</div>
      <h1 className="mt-1 text-[26px] font-bold text-[var(--text)]">Your world, above the physics.</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--muted)]">
        This is where you bend Neo to your enterprise — bring your own governance framework, connect your own
        stack, and author controls for your own technology. Everything you do here is yours and only yours,
        and none of it can break the invariants underneath: you defy gravity without breaking it.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card icon={<Boxes size={16} />} step="Create" title="Your tech" body="Controls built for your exact technology stack — not a generic checklist." />
        <Card icon={<Landmark size={16} />} step="Map" title="Your framework" body="Bring the governance framework you already run; Neo maps its controls to it." />
        <Card icon={<Plug size={16} />} step="Connect" title="Your integrations" body="Connect your own stack — any enterprise platform, no fixed connector catalog." />
      </div>

      <PasskeysManager />
    </div>
  );
}

function Card({ icon, step, title, body }: { icon: React.ReactNode; step: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex items-center gap-1.5 text-[var(--brand)]">
        {icon}
        <span className="text-[10.5px] font-bold uppercase tracking-wide">{step}</span>
      </div>
      <div className="mt-1.5 text-[15px] font-bold text-[var(--text)]">{title}</div>
      <div className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{body}</div>
    </div>
  );
}
