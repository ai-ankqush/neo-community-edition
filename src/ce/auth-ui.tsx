"use client";

// Clerk-optional UI shim. Clerk is "active" only when a publishable key is present.
// NEXT_PUBLIC_* is inlined into the client bundle, so this resolves on the client too.
// Key present (hosted / production)  -> render Clerk widgets exactly as before.
// No key (Community Edition self-host) -> render Neo-native equivalents; never touch Clerk.
//
// Importing the Clerk components is safe with no key — only *rendering* <ClerkProvider>
// and friends requires one, and that only happens on the CLERK_ACTIVE branch.

import type { ReactNode } from "react";
import {
  ClerkProvider,
  UserButton,
  OrganizationSwitcher,
  CreateOrganization,
  useUser,
  useOrganization,
} from "@clerk/nextjs";
import BuiltinOrgSwitcher from "@/ce/org-switcher";

export const CLERK_ACTIVE = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function AuthProvider({ children }: { children: ReactNode }) {
  return CLERK_ACTIVE ? <ClerkProvider>{children}</ClerkProvider> : <>{children}</>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function UserMenu(props: any) {
  if (CLERK_ACTIVE) return <UserButton {...props} />;
  return <BuiltinUserMenu />;
}

function BuiltinUserMenu() {
  async function signOut() {
    try {
      const r = await fetch("/api/sky/auth/logout", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      window.location.href = j?.redirect || "/login";
    } catch {
      window.location.href = "/login";
    }
  }
  return (
    <button
      onClick={signOut}
      title="Sign out"
      aria-label="Sign out"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
    >
      ⎋
    </button>
  );
}

export function OrgSwitcher(props: any) {
  if (CLERK_ACTIVE) return <OrganizationSwitcher {...props} />;
  // Built-in auth: Neo-native multi-org switcher (list, switch, create).
  return <BuiltinOrgSwitcher />;
}

export function CreateOrg(props: any) {
  if (CLERK_ACTIVE) return <CreateOrganization {...props} />;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 text-[13px] text-[var(--muted)]">
      Your organization was created when you signed up. Community Edition runs a single organization.
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Hook variant is chosen once at module load (CLERK_ACTIVE never changes), so the same
// hooks run on every render — Rules of Hooks stay satisfied.
export const useIdentity: () => { email: string; name: string; orgName: string } = CLERK_ACTIVE
  ? () => {
      const { user } = useUser();
      const { organization } = useOrganization();
      return {
        email: user?.primaryEmailAddress?.emailAddress ?? "",
        name: user?.fullName ?? user?.firstName ?? "",
        orgName: organization?.name ?? "",
      };
    }
  : () => ({ email: "", name: "", orgName: "" });
