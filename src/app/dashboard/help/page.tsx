import { HELP_ARTICLES } from "@/lib/help-content";
import SupportTicket from "./support-ticket";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Help & support · ${BRAND.name}` };

export default function HelpPage() {
  // group articles by category, preserving first-seen order
  const categories: string[] = [];
  for (const a of HELP_ARTICLES) if (!categories.includes(a.category)) categories.push(a.category);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Help &amp; support</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Guides for using {BRAND.name}. Prefer to ask? Use{" "}
          <span className="font-medium text-[#3b82f6]">Ask {BRAND.name}</span> (bottom-right, Product help mode) for instant
          answers — it draws on these same articles.
        </p>
      </div>

      {categories.map((cat) => (
        <section key={cat} className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">{cat}</h3>
          <div className="grid grid-cols-2 gap-3">
            {HELP_ARTICLES.filter((a) => a.category === cat).map((a) => (
              <article key={a.slug} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
                <h4 className="text-sm font-bold text-[var(--text)]">{a.title}</h4>
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[var(--muted)]">{a.body}</p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-2">
        <SupportTicket />
      </div>
    </div>
  );
}
