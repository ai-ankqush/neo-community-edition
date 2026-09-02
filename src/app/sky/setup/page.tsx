"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import AuthShell from "../_authshell";

type Check = { ok: boolean; detail: string };
type Health = { ok: boolean; checks: { db: Check; jobs: Check; model: Check } };

const LABELS: Record<string, string> = {
  db: "Database",
  jobs: "Background jobs",
  model: "Model provider",
};

export default function SetupPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function check() {
    setLoading(true);
    try {
      const r = await fetch("/api/sky/setup/health", { cache: "no-store" });
      if (r.ok) setHealth(await r.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  async function saveKey() {
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const r = await fetch("/api/org/model-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "anthropic", key: apiKey.trim() }),
      });
      if (r.ok) {
        setApiKey("");
        await check(); // re-validate — the model check should now go green
        return;
      }
      const j = await r.json().catch(() => ({}));
      setSaveErr(typeof j.error === "string" ? j.error : "Could not save the key.");
    } catch {
      setSaveErr("Could not save the key.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  const checks = health?.checks;
  const allOk = !!health?.ok;

  return (
    <AuthShell heading="You're in — let's check your setup" subtitle="A quick health check of your deployment before you start.">
      <div className="space-y-2.5">
        {(["db", "jobs", "model"] as const).map((key) => {
          const c = checks?.[key];
          const state = loading || !c ? "pending" : c.ok ? "ok" : "bad";
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <span className="mt-0.5 shrink-0">
                {state === "pending" && <Loader2 size={18} className="animate-spin text-[var(--muted)]" />}
                {state === "ok" && <CheckCircle2 size={18} className="text-[#22c55e]" />}
                {state === "bad" && <XCircle size={18} className="text-[var(--bad)]" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[var(--text)]">{LABELS[key]}</div>
                <div className={`text-[12px] leading-relaxed ${state === "bad" ? "text-[var(--bad)]" : "text-[var(--muted)]"}`}>
                  {loading || !c ? "Checking…" : c.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && checks && !checks.model.ok && (
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3.5">
          <div className="mb-1 text-[13px] font-semibold text-[var(--text)]">Add your Anthropic API key</div>
          <p className="mb-2.5 text-[12px] leading-relaxed text-[var(--muted)]">
            Paste it here — it&apos;s stored encrypted for this organization and used to run assessments.
            Get one at <span className="text-[var(--text)]">console.anthropic.com → API Keys</span>.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="sk-ant-api03-..."
              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]"
            />
            <button
              onClick={saveKey}
              disabled={saving || !apiKey.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}Save &amp; check
            </button>
          </div>
          {saveErr && <p className="mt-2 text-[12px] text-[var(--bad)]">{saveErr}</p>}
          <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
            Prefer config files or Amazon Bedrock? Set <code className="rounded bg-[var(--surface)] px-1">ANTHROPIC_API_KEY</code>
            {" "}or <code className="rounded bg-[var(--surface)] px-1">MODEL_PROVIDER=bedrock</code> in <code className="rounded bg-[var(--surface)] px-1">.env</code> instead.
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2.5">
        <button
          onClick={check}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--panel-hover)] disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}Re-check
        </button>
        <a
          href="/dashboard"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_rgba(93,83,224,0.24)] transition hover:brightness-110"
        >
          {allOk ? "Enter Neo" : "Continue anyway"} <ArrowRight size={15} />
        </a>
      </div>

      {!loading && !allOk && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
          You can continue, but anything with a red mark won't work until it's fixed — the model check is required to run assessments.
        </p>
      )}
    </AuthShell>
  );
}
