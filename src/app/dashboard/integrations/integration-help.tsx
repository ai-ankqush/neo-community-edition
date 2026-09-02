import type { IntegrationHelp } from "@/lib/integration-help";
import { BRAND } from "@/lib/brand";

/** Collapsible per-provider help shown on each connect page. */
export default function IntegrationHelpPanel({ name, help }: { name: string; help: IntegrationHelp }) {
  return (
    <details className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-semibold text-[var(--text)]">
        Setup help &amp; troubleshooting — {name}
      </summary>
      <div className="space-y-3 border-t border-[var(--border)] p-4 text-[12.5px] text-[var(--muted)]">
        <div>
          <p className="font-semibold text-[var(--text)]">Before you start</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {help.prerequisites.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-[var(--text)]">What {BRAND.name} reads</p>
          <p className="mt-1">{help.whatWeRead}</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--text)]">A PASS means</p>
          <p className="mt-1">{help.passMeans}</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--text)]">Troubleshooting</p>
          <div className="mt-1 flex flex-col divide-y divide-[var(--border)]">
            {help.troubleshooting.map((t, i) => (
              <div key={i} className="py-1.5">
                <p className="text-[var(--text)]">{t.problem}</p>
                <p className="text-[var(--faint)]">→ {t.fix}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
