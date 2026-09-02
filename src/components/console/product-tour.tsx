"use client";

/** Guided product tour — dependency-free overlay.
 *
 *  Spotlights the element matching each step's selector, dims the rest, and shows a tooltip with
 *  Back / Next / Skip. Navigates between routes itself. Starts when the URL has `?tour=1` (so the
 *  website CTA can deep-link straight into it) or when startTour() is dispatched. If a step's
 *  target isn't on the page, the tooltip centres instead of breaking. */

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TOUR_STEPS } from "@/lib/tour-steps";

const PAD = 6; // spotlight padding around the target

export default function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // the tour runs in the authed app (/dashboard/*) and in the public guided tour (/tour/*);
  // rewrite each step's route to whichever base we're currently under.
  const inDemo = pathname.startsWith("/tour");
  // In the public guided tour everything lives on one page (/tour), so the tour scrolls between
  // anchored sections instead of navigating; in the app it maps to the real /dashboard routes.
  const routeFor = (r?: string) => (!r ? r : inDemo ? "/tour" : r.replace(/^\/dashboard/, "/dashboard"));

  const raw = active ? TOUR_STEPS[i] : null;
  const step = raw ? { ...raw, route: routeFor(raw.route) } : null;

  // start from ?tour=1, or a custom event (e.g. a "Take the tour" button dispatches it)
  useEffect(() => {
    if (search.get("tour") === "1") { setI(0); setActive(true); }
  }, [search]);
  useEffect(() => {
    const on = () => { setI(0); setActive(true); };
    window.addEventListener("neo:start-tour", on);
    return () => window.removeEventListener("neo:start-tour", on);
  }, []);

  // navigate to the step's route if we're not there yet
  useEffect(() => {
    if (!step) return;
    if (step.route && pathname !== step.route) router.push(step.route);
  }, [step, pathname, router]);

  // locate the target once we're on the right route (retry while the page settles)
  useEffect(() => {
    if (!step) return;
    if (step.route && pathname !== step.route) { setRect(null); return; }
    let tries = 0;
    const find = () => {
      const el = step.selector ? document.querySelector<HTMLElement>(step.selector) : null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setRect(el.getBoundingClientRect());
        return true;
      }
      setRect(null);
      return false;
    };
    if (find()) return;
    const t = setInterval(() => { if (find() || ++tries > 20) clearInterval(t); }, 150);
    return () => clearInterval(t);
  }, [step, pathname]);

  // keep the spotlight aligned on scroll / resize
  useEffect(() => {
    if (!step?.selector) return;
    const on = () => {
      const el = document.querySelector<HTMLElement>(step.selector!);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); };
  }, [step]);

  const end = useCallback(() => { setActive(false); setRect(null); }, []);
  const next = useCallback(() => setI((n) => (n < TOUR_STEPS.length - 1 ? n + 1 : (end(), n))), [end]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // keyboard: →/Enter next, ← back, Esc skip
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [active, next, back, end]);

  if (!step) return null;

  // tooltip placement: below the target if there's room, else above; centred when no target
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const W = Math.min(340, vw - 24);
  let top = vh / 2 - 90, left = vw / 2 - W / 2;
  if (rect) {
    const below = rect.bottom + 12;
    const above = rect.top - 12;
    top = below + 180 < vh ? below : Math.max(12, above - 170);
    left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12);
  }

  return (
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {/* dim + spotlight hole via a big box-shadow; pointer-events none so the page still shows through */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - PAD, left: rect.left - PAD,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(2,6,20,0.72)", outline: "2px solid var(--accent,#06d6d6)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(2,6,20,0.72)" }} />
      )}

      {/* tooltip */}
      <div
        className="absolute w-[340px] max-w-[calc(100vw-24px)] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl"
        style={{ top, left }}
      >
        <div className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#06d6d6" }}>{step.chapter}</div>
        <div className="mt-1 text-[15px] font-bold text-[var(--text)]">{step.title}</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-[var(--faint)]">{i + 1} / {TOUR_STEPS.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={end} className="text-[12px] text-[var(--muted)] hover:text-[var(--text)]">Skip</button>
            {i > 0 && (
              <button onClick={back} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel)]">Back</button>
            )}
            <button onClick={next} className="rounded-md bg-[#06d6d6] px-3 py-1 text-[12px] font-bold text-[#04121a] hover:opacity-90">
              {i < TOUR_STEPS.length - 1 ? "Next" : "Start free"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
