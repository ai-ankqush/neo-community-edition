import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Watchdog: fail any engine job stuck in running/queued past the max runtime.
 * Without this, a Vercel function timeout leaves a job as 'running' forever
 * (the success/failure update never executes). Runs on a Vercel Cron schedule
 * (see vercel.json). Protected by CRON_SECRET so only the cron can call it.
 */
export const dynamic = "force-dynamic";

const MAX_RUNTIME_MIN = 12;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - MAX_RUNTIME_MIN * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from("engine_jobs")
    .update({
      status: "failed",
      error: "Timed out — the run exceeded the maximum time. Please retry.",
      finished_at: new Date().toISOString(),
    })
    .in("status", ["running", "queued"])
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("REAP JOBS FAILED", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reaped: data?.length ?? 0 });
}
