import { NextResponse } from "next/server";
import { processRecomputeBacklog } from "@/lib/recompute";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const results = await processRecomputeBacklog(5);
  return NextResponse.json({ processed: results.length, results });
}
