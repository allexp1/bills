import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "bills", ts: new Date().toISOString() });
}
