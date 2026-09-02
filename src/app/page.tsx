import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/identity/auth-context";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await getAuthContext();
  if (userId) redirect("/dashboard");

  // Built-in (Sky) auth uses /sky/*; Clerk uses /sign-*.
  const ce = AUTH_PROVIDER === "builtin";
  const signUpHref = ce ? "/sky/signup" : "/sign-up";
  const signInHref = ce ? "/sky/login" : "/sign-in";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.wordmarkUrl} alt={BRAND.name} className="mb-6 h-14 w-auto max-w-[280px] object-contain" />
      <p className="mb-2 text-sm font-bold uppercase tracking-widest text-cyan-brand">
        {BRAND.tagline ? `${BRAND.name} | ${BRAND.tagline}` : BRAND.name}
      </p>
      <h1 className="mb-4 text-4xl font-bold">AI Control Platform</h1>
      <p className="mb-8 max-w-md text-center text-[var(--muted)]">
        Onboard your AI use cases. Know what they can see, decide, and do -
        and prove they are under control.
      </p>
      <div className="flex gap-3">
        <Link
          href={signUpHref}
          className="rounded-md bg-cyan-brand px-6 py-2.5 font-semibold text-navy"
        >
          Start free
        </Link>
        <Link
          href={signInHref}
          className="rounded-md border border-[var(--border)] px-6 py-2.5 font-semibold text-[var(--text)]"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
