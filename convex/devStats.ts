/**
 * Dev Stats Module
 * Queries and mutations for dev game statistics (separate from main leaderboard)
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Get all dev game statistics
 */
export const getDevStats = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("devStats").collect();

    // Sort by games played descending
    return stats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  },
});

/**
 * Get dev stats summary (totals across all models)
 */
export const getDevStatsSummary = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("devStats").collect();

    if (stats.length === 0) {
      return {
        totalGames: 0,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalActions: 0,
        uniqueModels: 0,
      };
    }

    return {
      totalGames: stats.reduce((sum, s) => sum + s.gamesPlayed, 0),
      totalCost: stats.reduce((sum, s) => sum + s.totalCost, 0),
      totalInputTokens: stats.reduce((sum, s) => sum + s.totalInputTokens, 0),
      totalOutputTokens: stats.reduce((sum, s) => sum + s.totalOutputTokens, 0),
      totalActions: stats.reduce(
        (sum, s) =>
          sum +
          s.totalBets +
          s.totalRaises +
          s.totalCalls +
          s.totalFolds +
          s.totalChecks,
        0,
      ),
      uniqueModels: stats.length,
    };
  },
});

/**
 * Reset all dev stats (for clean slate testing)
 */
export const resetDevStats = mutation({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("devStats").collect();

    for (const stat of stats) {
      await ctx.db.delete(stat._id);
    }

    return { deleted: stats.length };
  },
});
