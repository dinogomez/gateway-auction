import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Create a new game session
 */
export const createGame = mutation({
  args: {
    players: v.array(v.string()), // model IDs
    humanPlayerId: v.optional(v.string()),
    totalHands: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const gameId = await ctx.db.insert("games", {
      status: "active",
      players: args.players,
      humanPlayerId: args.humanPlayerId,
      currentHandNumber: 0,
      totalHands: args.totalHands,
      createdAt: now,
    });

    return gameId;
  },
});

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
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});

/**
 * Update game hand number
 */
export const updateHandNumber = mutation({
  args: {
    gameId: v.id("games"),
    handNumber: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      currentHandNumber: args.handNumber,
    });
  },
});

/**
 * Complete a game
 */
export const completeGame = mutation({
  args: {
    gameId: v.id("games"),
    winnerId: v.string(),
    winnerProfit: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      status: "completed",
      winnerId: args.winnerId,
      winnerProfit: args.winnerProfit,
      completedAt: Date.now(),
    });
  },
});

/**
 * Abandon a game (when interrupted)
 */
export const abandonGame = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      status: "abandoned",
      completedAt: Date.now(),
    });
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
    const abandoned = games.filter((g) => g.status === "abandoned");
    const active = games.filter((g) => g.status === "active");

    // Count games by player
    const playerGameCounts: Record<string, number> = {};
    for (const game of completed) {
      for (const playerId of game.players) {
        playerGameCounts[playerId] = (playerGameCounts[playerId] || 0) + 1;
      }
    }

    // Count wins
    const playerWins: Record<string, number> = {};
    for (const game of completed) {
      if (game.winnerId) {
        playerWins[game.winnerId] = (playerWins[game.winnerId] || 0) + 1;
      }
    }

    return {
      total: games.length,
      completed: completed.length,
      abandoned: abandoned.length,
      active: active.length,
      playerGameCounts,
      playerWins,
    };
  },
});
