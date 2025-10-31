import { NextResponse } from "next/server";

// 预留：未来接 IBKR / 网关
export async function GET() {
  return NextResponse.json(
    { ok: false, provider: "ibkr", message: "IBKR API not implemented yet" },
    { status: 501 }
  );
}
