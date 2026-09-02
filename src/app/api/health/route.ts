import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "neo-platform", phase: 0 });
}
