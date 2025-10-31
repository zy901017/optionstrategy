import { NextResponse } from "next/server";

// 预留：未来接 Finnhub
export async function GET() {
  return NextResponse.json(
    { ok: false, provider: "finnhub", message: "Finnhub API not implemented yet" },
    { status: 501 }
  );
}
