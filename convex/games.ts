/**
 * Legacy games.ts - Kept for backwards compatibility with Practice Mode
 * For Ranked Mode, use rankedGames.ts instead
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get a game by ID
 */
export const getGame = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

/**
 * Get active games
 */
export const getActiveGames = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    return await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get recent completed games
 */
export const getRecentGames = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    return await ctx.db
      .query("games")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get game statistics
 */
export const getGameStats = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();

    const completed = games.filter((g) => g.status === "completed");
    const cancelled = games.filter((g) => g.status === "cancelled");
    const active = games.filter((g) => g.status === "active");

    return {
      total: games.length,
      completed: completed.length,
      cancelled: cancelled.length,
      active: active.length,
    };
  },
});
