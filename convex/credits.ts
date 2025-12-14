/**
 * Credits Module
 * Syncs and stores AI Gateway credit balance in Convex for real-time display
 */

import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { gateway } from "@ai-sdk/gateway";

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get current credit balance from database
 */
export const getCredits = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("credits").first();
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Internal mutation to update credits in database
 */
export const updateCredits = internalMutation({
  args: {
    balance: v.number(),
    totalUsed: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("credits").first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        balance: args.balance,
        totalUsed: args.totalUsed,
        limit: args.limit,
        lastSyncedAt: now,
      });
    } else {
      await ctx.db.insert("credits", {
        balance: args.balance,
        totalUsed: args.totalUsed,
        limit: args.limit,
        lastSyncedAt: now,
      });
    }
  },
});

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Public action to sync credits from AI Gateway (for admin manual sync)
 */
export const syncCredits = action({
  args: {},
  handler: async (ctx) => {
    try {
      const credits = await gateway.getCredits();

      // API returns: { balance: "15.736626186", totalUsed: "4.263373814" }
      const balance = parseFloat(credits.balance) || 0;
      const totalUsed = parseFloat(credits.totalUsed) || 0;
      const limit = 20; // Fixed $20 limit

      await ctx.runMutation(internal.credits.updateCredits, {
        balance,
        totalUsed,
        limit,
      });

      console.log(
        `[Credits] Synced: $${balance.toFixed(2)} remaining, $${totalUsed.toFixed(2)} used`,
      );

      return { balance, totalUsed, limit };
    } catch (error) {
      console.error("[Credits] Failed to sync:", error);
      throw error;
    }
  },
});

/**
 * Internal action to sync credits (called after game settlement and by cron)
 */
export const syncCreditsInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    // Skip if AI Gateway API key is not configured
    if (!process.env.AI_GATEWAY_API_KEY) {
      console.log("[Credits] Skipping sync - AI_GATEWAY_API_KEY not configured");
      return;
    }

    try {
      const credits = await gateway.getCredits();

      const balance = parseFloat(credits.balance) || 0;
      const totalUsed = parseFloat(credits.totalUsed) || 0;
      const limit = 20;

      await ctx.runMutation(internal.credits.updateCredits, {
        balance,
        totalUsed,
        limit,
      });

      console.log(
        `[Credits] Auto-synced after game: $${balance.toFixed(2)} remaining`,
      );
    } catch (error) {
      console.error("[Credits] Failed to auto-sync:", error);
      // Don't throw - this is a background operation
    }
  },
});
