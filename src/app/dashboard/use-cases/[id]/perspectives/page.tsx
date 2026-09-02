import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { auth } from "@clerk/nextjs/server";
import { ensureOrg } from "@/lib/org";
import { loadControlPictures } from "@/server/control-graph/load-pictures";
import PerspectivesView from "./perspectives-view";

export const dynamic = "force-dynamic";

export default async function PerspectivesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;

  const pics = await loadControlPictures(internalOrgId);
  const uc = pics.find((p) => p.id === id);
  if (!uc) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h2 className="text-lg font-bold text-[var(--text)]">Use case not found</h2>
        <p className="mt-2 text-[13px] text-[var(--muted)]">It may have been archived. <Link href="/dashboard/use-cases" className="text-[#3b82f6] underline">Back to use cases</Link>.</p>
      </div>
    );
  }

  return <PerspectivesView name={uc.name} tier={uc.tier} picture={uc.picture} ucId={uc.id} />;
}
