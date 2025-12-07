import { NextResponse } from "next/server";
import { getRateLimitStatus } from "@/lib/ratelimit";

export async function GET() {
  try {
    const status = await getRateLimitStatus();

    return NextResponse.json({
      globalRemaining: status.globalRemaining,
      globalLimit: status.globalLimit,
      estimatedCostLeft: status.estimatedCostLeft,
      percentage: Math.round(
        (status.globalRemaining / status.globalLimit) * 100,
      ),
    });
  } catch (error) {
    console.error("Status API error:", error);
    // Return fallback values if Redis is not configured
    return NextResponse.json({
      globalRemaining: 500,
      globalLimit: 500,
      estimatedCostLeft: 2.5,
      percentage: 100,
      error: "Could not fetch rate limit status",
    });
  }
}
