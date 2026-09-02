"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND, onRequestPricing } from "@/lib/brand";

const EXPERT_LINK = process.env.NEXT_PUBLIC_STRIPE_EXPERT_LINK ?? "";

const CARDS = [
  {
    key: "community",
    label: "Community",
    price: "$0",
    period: "free forever",
    paid: false,
    features: [
      "Bring your own model key (Anthropic or Amazon Bedrock)",
      "3 active use cases",
      "Classify, risk-tier, stack-aware controls, red team",
      "All framework crosswalks",
      "Your model spend stays on your account",
    ],
    cta: "Start free",
  },
  {
    key: "trial",
    label: "Free trial",
    price: "$0",
    period: "14 days",
    paid: false,
    features: [
      "2 active use cases",
      "Every feature unlocked — nothing held back",
      "AI Control Graph, Supply Chain + AI-BOM, Red Team, vendor risk",
      "Stack-aware controls, all crosswalks, generated code",
      "No credit card required",
    ],
    cta: "Start trial",
  },
  {
    key: "practitioner",
    label: "Practitioner",
    price: "$29.99",
    priceAnnual: "$15.99",
    period: "/month",
    paid: true,
    features: [
      "Every feature, for the individual",
      "3 active use cases · one run each",
      "AI Control Graph, Supply Chain + AI-BOM, Red Team",
      "Vendor risk, integrations, build/deploy code",
      "Manual control attestation",
    ],
    cta: "Choose Practitioner",
  },
  {
    key: "starter",
    label: "Starter",
    price: "$1,500",
    priceAnnual: "$1,250",
    period: "/month",
    paid: true,
    highlighted: true,
    features: [
      "Everything in Practitioner, at portfolio scale",
      "10 active use cases · 5 runs per stage",
      "Same full feature set — nothing held back",
      "10 vendor AI reviews",
      "Generated code: Terraform, policy, config, detections",
      `Ask ${BRAND.name} (help + portfolio), email support`,
    ],
    cta: "Choose Starter",
  },
  {
    key: "enterprise",
    label: "Enterprise",
    price: "Custom",
    period: "annual quote",
    paid: false,
    features: [
      "Everything in Starter",
      "Unlimited use cases",
      "SSO (SAML / OIDC)",
      "Multiple client workspaces",
      "Advanced / executive reporting",
      "Live verification across your stack, named contact + SLA",
    ],
    cta: "Request a quote",
  },
  {
    key: "expert",
    label: "Expert Services",
    price: "$14,000",
    period: "40-hour block",
    expert: true,
    features: [
      "Senior AI control architecture advisory",
      "$350 / hour, 40-hour minimum",
      "Guided first assessment or architecture review",
      "Add to any plan",
    ],
    cta: "Buy a block",
  },
];

export default function PlanCards({
  currentPlan,
  requestedPlan,
  onboarding = false,
}: {
  currentPlan: string;
  requestedPlan: string | null;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("checkout");
    if (p === "success") setMessage("Subscription active — your plan will update within a few seconds.");
    else if (p === "cancelled") setMessage("Checkout cancelled. You're still on your current plan.");
  }, []);

  async function choose(card: (typeof CARDS)[number]) {
    setBusy(card.key);
    setMessage(null);
    try {
      if (card.expert) {
        if (EXPERT_LINK) window.location.href = EXPERT_LINK;
        else window.location.href = `mailto:${BRAND.contactEmail}?subject=${encodeURIComponent(`${BRAND.name} Expert Services`)}`;
        return;
      }
      if (onRequestPricing) {
        // White-label / MSP: no Stripe. Any tier starts an INSTANT 2-week trial; the partner-admin then
        // decides whether to extend it (30/90 days or indefinite) once the customer commits. No wait.
        const res = await fetch("/api/billing/try-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: card.key }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not start");
        if (card.key === "trial") setMessage("Trial active. Create your first use case!");
        else setMessage(`${card.label} — 2-week trial started, full access now. Your account team will confirm continued access.`);
        router.refresh();
        return;
      }
      if (card.paid) {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: card.key, cadence }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not start checkout");
        window.location.href = json.url; // redirect to Stripe Checkout
        return;
      }
      // trial + enterprise keep the lightweight select-plan flow
      const res = await fetch("/api/billing/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: card.key }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed");
      if (json.activated) {
        if (onboarding) {
          window.location.href = json.plan === "community" ? "/dashboard/settings?tab=model-provider" : "/dashboard";
          return;
        }
        setMessage(json.plan === "community" ? "Community activated. Add your model key to begin." : "Trial active. Create your first use case!");
      } else if (json.next === "quote")
        setMessage(`Quote request recorded — we'll reach out within one business day. You can also email ${BRAND.contactEmail}.`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy("portal");
    setMessage(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not open portal");
      window.location.href = json.url;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  const onPaidPlan = currentPlan === "starter" || currentPlan === "practitioner";

  return (
    <div>
      {message && (
        <div className="mb-4 rounded-lg border border-[#3b82f640] bg-[#3b82f61a] px-4 py-3 text-sm text-[var(--text)]">
          {message}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="inline-flex rounded-lg bg-[var(--panel)] p-[3px]">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCadence(c)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium capitalize ${
                cadence === c ? "bg-[var(--border)] text-[var(--text)]" : "text-[var(--faint)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {cadence === "annual" && <span className="text-[12px] text-[var(--good)]">Two months free, billed yearly</span>}
        {onPaidPlan && (
          <button onClick={manageBilling} disabled={busy !== null} className="ml-auto rounded-md border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--text)] disabled:opacity-50">
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {CARDS.map((c) => {
          const isCurrent = currentPlan === c.key;
          const isRequested = requestedPlan === c.key && !isCurrent;
          const onReq = onRequestPricing && c.key !== "trial";
          const showPrice = onReq ? "On request" : c.paid && cadence === "annual" && c.priceAnnual ? c.priceAnnual : c.price;
          const showPeriod = onReq ? "" : c.paid ? (cadence === "annual" ? "/mo, billed yearly" : "/month") : c.period;
          return (
            <div
              key={c.key}
              className={`flex flex-col rounded-[10px] border p-5 ${
                c.highlighted ? "border-[#3b82f6] bg-[#3b82f60d]" : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--text)]">{c.label}</span>
                {c.highlighted && (
                  <span className="rounded-full bg-[#3b82f6] px-2 py-0.5 text-[10px] font-bold text-white">POPULAR</span>
                )}
              </div>
              <div className="mb-4">
                <span className="text-2xl font-bold text-[var(--text)]">{showPrice}</span>{" "}
                <span className="text-xs text-[var(--faint)]">{showPeriod}</span>
              </div>
              <ul className="mb-5 flex-1 space-y-2 text-[12.5px] text-[var(--muted)]">
                {c.features.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--good)]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="rounded-md border border-[#22c55e40] bg-[#22c55e1f] px-4 py-2 text-center text-sm font-semibold text-[var(--good)]">
                  Current plan
                </span>
              ) : isRequested ? (
                <span className="rounded-md border border-[#f59e0b40] bg-[#f59e0b1f] px-4 py-2 text-center text-sm font-semibold text-[#f59e0b]">
                  Requested
                </span>
              ) : (
                <button
                  onClick={() => choose(c)}
                  disabled={busy !== null}
                  className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                    c.highlighted ? "bg-[#3b82f6] text-white" : "border border-[var(--border)] bg-[var(--border)] text-[var(--text)]"
                  }`}
                >
                  {busy === c.key ? "…" : c.expert ? (onRequestPricing ? "Contact us" : c.cta) : onRequestPricing ? (c.key === "trial" ? "Start trial" : "Start 2-week trial") : c.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-[#4b5563]">
        {onRequestPricing
          ? `Every feature is on every plan — pick by how many AI use cases you govern. Any tier starts a free 2-week trial with full access; your account team confirms continued access. Questions? ${BRAND.contactEmail}.`
          : "Every feature is on every plan — pick by how many AI use cases you govern. Enterprise adds SSO, multiple workspaces, advanced reporting, and live verification. Use-case limits count active (non-archived) use cases per account; archive one to free a slot. Manage, switch, or cancel anytime from the billing portal. Have a discount code? Enter it at checkout."}
      </p>
    </div>
  );
}
