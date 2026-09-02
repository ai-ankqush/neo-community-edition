"use client";

/** Starts the guided product tour (ProductTour listens for this event). */
export default function TourButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("neo:start-tour"))}
      title="Take a 2-minute guided tour"
      className="hidden rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--panel)] hover:text-[var(--text)] md:inline-flex"
    >
      Take the tour
    </button>
  );
}
