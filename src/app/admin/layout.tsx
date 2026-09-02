import { notFound } from "next/navigation";
import { getAuthContext } from "@/server/identity/auth-context";
import AdminNav from "./admin-nav";
export const dynamic = "force-dynamic";
// Community Edition admin: minimal, org-admin-gated (FinOps). The full operator console
// (roster, entitlements, partners, PAL) is Neo Control only.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { orgRole } = await getAuthContext();
  if (!orgRole || !orgRole.includes("admin")) notFound();
  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AdminNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
