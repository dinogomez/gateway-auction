import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get the leaderboard sorted by total profit
 */
export const getLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const players = await ctx.db
      .query("players")
      .withIndex("by_profit")
      .order("desc")
      .take(limit);

    return players;
  },
});

/**
 * Get a single player by model ID
 */
export const getPlayer = query({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_modelId", (q) => q.eq("modelId", args.modelId))
      .first();
  },
});

/**
 * Get multiple players by model IDs
 */
export const getPlayers = query({
  args: {
    modelIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const players = await Promise.all(
      args.modelIds.map((modelId) =>
        ctx.db
          .query("players")
          .withIndex("by_modelId", (q) => q.eq("modelId", modelId))
          .first(),
      ),
    );
    return players.filter(Boolean);
  },
});

/**
 * Get profit history for a player (for charts)
 */
export const getPlayerHistory = query({
  args: {
    modelId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    return await ctx.db
      .query("profitHistory")
      .withIndex("by_model_time", (q) => q.eq("modelId", args.modelId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Create or get a player record for a model
 */
export const getOrCreatePlayer = mutation({
  args: {
    modelId: v.string(),
    modelName: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if player already exists
    const existing = await ctx.db
      .query("players")
      .withIndex("by_modelId", (q) => q.eq("modelId", args.modelId))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new player
    const now = Date.now();
    return await ctx.db.insert("players", {
      modelId: args.modelId,
      modelName: args.modelName,
      gamesPlayed: 0,
      handsPlayed: 0,
      handsWon: 0,
      totalProfit: 0,
      currentBalance: 10000, // Starting balance
      biggestWin: 0,
      biggestLoss: 0,
      foldRate: 0,
      raiseRate: 0,
      allInCount: 0,
      showdownWinRate: 0,
      lastPlayed: now,
      createdAt: now,
    });
  },
});

/**
 * Update player stats after a hand
 */
export const updatePlayerAfterHand = mutation({
  args: {
    modelId: v.string(),
    profit: v.number(),
    didWin: v.boolean(),
    didFold: v.boolean(),
    didRaise: v.boolean(),
    didAllIn: v.boolean(),
    wentToShowdown: v.boolean(),
    wonAtShowdown: v.boolean(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_modelId", (q) => q.eq("modelId", args.modelId))
      .first();

    if (!player) {
      console.error(`Player not found: ${args.modelId}`);
      return;
    }

    const newHandsPlayed = player.handsPlayed + 1;
    const newHandsWon = player.handsWon + (args.didWin ? 1 : 0);
    const newTotalProfit = player.totalProfit + args.profit;
    const newBalance = player.currentBalance + args.profit;

    // Calculate new rates (rolling average)
    const newFoldRate =
      (player.foldRate * player.handsPlayed + (args.didFold ? 1 : 0)) /
      newHandsPlayed;
    const newRaiseRate =
      (player.raiseRate * player.handsPlayed + (args.didRaise ? 1 : 0)) /
      newHandsPlayed;

    // Calculate showdown win rate
    const showdownCount = args.wentToShowdown
      ? Math.round(player.showdownWinRate * player.handsPlayed) + 1
      : Math.round(player.showdownWinRate * player.handsPlayed);
    const showdownWins = args.wonAtShowdown
      ? Math.round(player.showdownWinRate * player.handsPlayed) + 1
      : Math.round(player.showdownWinRate * player.handsPlayed);
    const newShowdownWinRate =
      showdownCount > 0 ? showdownWins / showdownCount : 0;

    await ctx.db.patch(player._id, {
      handsPlayed: newHandsPlayed,
      handsWon: newHandsWon,
      totalProfit: newTotalProfit,
      currentBalance: newBalance,
      biggestWin: Math.max(
        player.biggestWin,
        args.profit > 0 ? args.profit : 0,
      ),
      biggestLoss: Math.min(
        player.biggestLoss,
        args.profit < 0 ? args.profit : 0,
      ),
      foldRate: newFoldRate,
      raiseRate: newRaiseRate,
      allInCount: player.allInCount + (args.didAllIn ? 1 : 0),
      showdownWinRate: newShowdownWinRate,
      lastPlayed: Date.now(),
    });
  },
});

/**
 * Update player at game end
 */
export const updatePlayerAfterGame = mutation({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_modelId", (q) => q.eq("modelId", args.modelId))
      .first();

    if (!player) {
      console.error(`Player not found: ${args.modelId}`);
      return;
    }

    await ctx.db.patch(player._id, {
      gamesPlayed: player.gamesPlayed + 1,
      lastPlayed: Date.now(),
    });
  },
});

/**
 * Record profit history point
 */
export const recordProfitHistory = mutation({
  args: {
    modelId: v.string(),
    gameId: v.id("games"),
    handNumber: v.number(),
    profit: v.number(),
    balance: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("profitHistory", {
      modelId: args.modelId,
      gameId: args.gameId,
      handNumber: args.handNumber,
      profit: args.profit,
      balance: args.balance,
      timestamp: Date.now(),
    });
  },
});

/**
 * Reset a player's balance (admin function)
 */
export const resetPlayerBalance = mutation({
  args: {
    modelId: v.string(),
    newBalance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_modelId", (q) => q.eq("modelId", args.modelId))
      .first();

    if (!player) {
      console.error(`Player not found: ${args.modelId}`);
      return;
    }

    await ctx.db.patch(player._id, {
      currentBalance: args.newBalance ?? 10000,
    });
  },
});

/**
 * Get all-time stats summary
 */
export const getAllTimeStats = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();

    const totalHands = players.reduce((sum, p) => sum + p.handsPlayed, 0);
    const totalGames = players.reduce((sum, p) => sum + p.gamesPlayed, 0);

    // Find top performers
    const byProfit = [...players].sort((a, b) => b.totalProfit - a.totalProfit);
    const byWinRate = [...players]
      .filter((p) => p.handsPlayed >= 10)
      .sort((a, b) => b.handsWon / b.handsPlayed - a.handsWon / a.handsPlayed);

    return {
      totalPlayers: players.length,
      totalHands,
      totalGames,
      topByProfit: byProfit.slice(0, 3),
      topByWinRate: byWinRate.slice(0, 3),
    };
  },
});
