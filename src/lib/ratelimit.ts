import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Initialize Redis from environment variables
const redis = Redis.fromEnv();

/**
 * Layer 1: Per-IP rate limit
 * Prevents single user abuse
 * 10 requests per minute per IP
 */
export const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
  prefix: "auction:ip",
});

/**
 * Layer 2: Per-Game rate limit
 * Prevents runaway games
 * 50 requests per 10 minutes per game session
 */
export const gameRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, "10 m"),
  analytics: true,
  prefix: "auction:game",
});

/**
 * Layer 3: Global rate limit (MOST IMPORTANT)
 * Protects the $20 budget
 * 500 total requests per hour
 */
export const globalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(500, "1 h"),
  analytics: true,
  prefix: "auction:global",
});

/**
 * Check all rate limits
 * Returns the most restrictive result
 */
export async function checkAllRateLimits(
  ip: string,
  gameId: string,
): Promise<{
  success: boolean;
  remaining: {
    ip: number;
    game: number;
    global: number;
  };
  error?: string;
  resetIn?: number;
}> {
  const [ipResult, gameResult, globalResult] = await Promise.all([
    ipRatelimit.limit(ip),
    gameRatelimit.limit(gameId),
    globalRatelimit.limit("global"),
  ]);

  // Global limit is most critical - check first
  if (!globalResult.success) {
    const resetIn = Math.ceil((globalResult.reset - Date.now()) / 1000);
    return {
      success: false,
      remaining: {
        ip: ipResult.remaining,
        game: gameResult.remaining,
        global: 0,
      },
      error: `Global rate limit reached. Demo paused to save credits. Try again in ${Math.ceil(resetIn / 60)} minutes!`,
      resetIn,
    };
  }

  if (!ipResult.success) {
    const resetIn = Math.ceil((ipResult.reset - Date.now()) / 1000);
    return {
      success: false,
      remaining: {
        ip: 0,
        game: gameResult.remaining,
        global: globalResult.remaining,
      },
      error: `Slow down! Try again in ${resetIn}s`,
      resetIn,
    };
  }

  if (!gameResult.success) {
    return {
      success: false,
      remaining: {
        ip: ipResult.remaining,
        game: 0,
        global: globalResult.remaining,
      },
      error: "This game session hit its limit. Start a new game!",
    };
  }

  return {
    success: true,
    remaining: {
      ip: ipResult.remaining,
      game: gameResult.remaining,
      global: globalResult.remaining,
    },
  };
}

/**
 * Get current rate limit status (read-only)
 */
export async function getRateLimitStatus(): Promise<{
  globalRemaining: number;
  globalLimit: number;
  estimatedCostLeft: number;
}> {
  // Use a dummy check to get remaining count
  const result = await globalRatelimit.limit("global");

  // Rough estimate: $0.005 per request average
  const estimatedCostPerRequest = 0.005;
  const estimatedCostLeft = result.remaining * estimatedCostPerRequest;

  return {
    globalRemaining: result.remaining,
    globalLimit: 500,
    estimatedCostLeft,
  };
}
