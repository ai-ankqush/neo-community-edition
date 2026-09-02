import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { BRAND } from "@/lib/brand";

// Community Edition (built-in auth) wears the Neo brand; the hosted Sky portal keeps its Gravity identity.
const CE = AUTH_PROVIDER === "builtin";

export const metadata: Metadata = {
  title: CE ? BRAND.name : "Neo Sky",
  description: CE
    ? "Self-hostable AI governance — classify, tier, select controls, and prove them for every AI use case."
    : "Your world, above the physics — bring your framework, connect your stack, author your own controls.",
};

/**
 * Neo Sky portal (served at sky.neocontrol.ai via host rewrite, or /sky directly).
 *
 * DAWN color system — the locked light identity. Warm linen canvas, warm greige neutrals, Gravity indigo
 * as the brand, and a coral horizon that bridges Gravity and Sky. Light by mandate: depth comes from
 * luminosity, never from going dark.
 */
const DAWN = {
  "--bg": "#F5F1E9", // canvas · page
  "--panel": "#FCFAF5", // surface
  "--surface": "#EDE7DB", // panel
  "--surface-2": "#E7E0D2", // sunken
  "--panel-hover": "#F1EBE0",
  "--row": "#EDE7DB",
  "--border": "#DCD4C4",
  "--border-strong": "#C6BCA7",
  "--text": "#26242E", // ink
  "--muted": "#7C7768",
  "--faint": "#A29C8C",
  "--brand": "#5D53E0", // Gravity indigo
  "--brand-deep": "#22243F",
  "--horizon": "#EE7548", // shared horizon coral
  "--horizon-deep": "#D9662F",
  "--teal": "#46AEBE",
  "--good": "#2FA968",
  "--warn": "#E0952A",
  "--bad": "#E5544E",
  "--font-display": "'Space Grotesk', sans-serif",
  "--font-text": "'Hanken Grotesk', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
} as React.CSSProperties;

export default function SkyLayout({ children }: { children: ReactNode }) {
  // CE inherits the app's own (Neo console) theme; the hosted Sky portal keeps the DAWN identity.
  return (
    <div style={CE ? undefined : DAWN} className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Dawn typography: Space Grotesk display, Hanken Grotesk text, JetBrains Mono. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--panel)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-6 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {CE ? (
            <>
              <img src={BRAND.logoUrl} alt={BRAND.name} width={32} height={32} className="h-8 w-auto max-w-[150px] object-contain" />
              <span className="text-[16px] font-extrabold tracking-tight text-[var(--text)]">{BRAND.name}</span>
            </>
          ) : (
            <>
              <img src="/neo-sky-mark.svg" alt="" width={40} height={40} />
              <span className="text-[16px] font-extrabold tracking-tight text-[var(--text)]">Neo <span className="font-medium text-[var(--horizon-deep)]">Sky</span></span>
              <span className="ml-1 text-[11.5px] text-[var(--faint)]">on Neo Gravity</span>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
