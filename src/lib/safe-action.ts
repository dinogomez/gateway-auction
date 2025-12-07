import { createSafeActionClient } from "next-safe-action";
import { headers } from "next/headers";
import { checkAllRateLimits } from "./ratelimit";

/**
 * Base action client
 * Handles errors gracefully
 */
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    // Pass through rate limit messages
    if (e.message.includes("rate limit") || e.message.includes("Rate limit")) {
      return e.message;
    }
    console.error("Action error:", e.message);
    return "Something went wrong. Please try again.";
  },
});

/**
 * Rate-limited action client
 * Use this for any action that calls AI APIs
 */
export const rateLimitedAction = actionClient.use(
  async ({ next, clientInput }) => {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";

    // Extract gameId from input if available
    const gameId =
      ((clientInput as Record<string, unknown>)?.gameId as string) ?? "global";

    // Check all rate limits
    const rateLimitResult = await checkAllRateLimits(ip, gameId);

    if (!rateLimitResult.success) {
      throw new Error(rateLimitResult.error ?? "Rate limit exceeded");
    }

    // Pass remaining counts to the action via context
    return next({
      ctx: {
        ip,
        gameId,
        remaining: rateLimitResult.remaining,
      },
    });
  },
);
