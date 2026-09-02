"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
