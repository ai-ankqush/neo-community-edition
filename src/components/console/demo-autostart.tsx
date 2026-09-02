"use client";

import { useEffect } from "react";

/** Kicks off the guided tour shortly after the public demo page loads. */
export default function DemoAutostart() {
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("neo:start-tour")), 500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
