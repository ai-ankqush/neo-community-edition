/**
 * The universal front door. Every customer lands here before any personalization, so it carries the Neo
 * Gravity brand — the trust kernel behind Neo Sky.
 */
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { BRAND } from "@/lib/brand";

const CE = AUTH_PROVIDER === "builtin";

export default function GravityAuthBrand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={CE ? BRAND.logoUrl : "/neo-gravity-mark.svg"} alt={CE ? BRAND.name : "Neo Gravity"} width={46} height={46} className="h-[46px] w-auto max-w-[150px] rounded-xl object-contain" />
      <div>
        <div className="text-[17px] font-extrabold leading-tight text-[var(--text)]">
          {CE ? <>Welcome to {BRAND.name}</> : <>Welcome to Neo <span className="font-medium text-[var(--brand)]">Gravity</span></>}
        </div>
        <div className="text-[12.5px] text-[var(--muted)]">{subtitle}</div>
      </div>
    </div>
  );
}
