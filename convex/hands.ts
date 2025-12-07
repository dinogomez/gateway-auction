import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Card object validator
 */
const cardValidator = v.object({
  suit: v.string(),
  rank: v.string(),
});

/**
 * Record a completed hand
 */
export const recordHand = mutation({
  args: {
    gameId: v.id("games"),
    handNumber: v.number(),
    winners: v.array(
      v.object({
        playerId: v.string(),
        amount: v.number(),
        handRank: v.string(),
        handDescription: v.string(),
      }),
    ),
    potAmount: v.number(),
    communityCards: v.array(cardValidator),
    showdownPlayers: v.array(
      v.object({
        playerId: v.string(),
        holeCards: v.array(cardValidator),
        handRank: v.string(),
        handDescription: v.string(),
        profit: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("hands", {
      gameId: args.gameId,
      handNumber: args.handNumber,
      winners: args.winners,
      potAmount: args.potAmount,
      communityCards: args.communityCards,
      showdownPlayers: args.showdownPlayers,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get hand history for a game
 */
export const getGameHands = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("hands")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

/**
 * Get a specific hand
 */
export const getHand = query({
  args: {
    gameId: v.id("games"),
    handNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const hands = await ctx.db
      .query("hands")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return hands.find((h) => h.handNumber === args.handNumber) || null;
  },
});

/**
 * Record a betting action
 */
export const recordAction = mutation({
  args: {
    gameId: v.id("games"),
    handNumber: v.number(),
    playerId: v.string(),
    playerName: v.string(),
    action: v.string(),
    amount: v.optional(v.number()),
    phase: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("actions", {
      gameId: args.gameId,
      handNumber: args.handNumber,
      playerId: args.playerId,
      playerName: args.playerName,
      action: args.action,
      amount: args.amount,
      phase: args.phase,
      timestamp: Date.now(),
    });
  },
});

/**
 * Get actions for a specific hand
 */
export const getHandActions = query({
  args: {
    gameId: v.id("games"),
    handNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("actions")
      .withIndex("by_game_hand", (q) =>
        q.eq("gameId", args.gameId).eq("handNumber", args.handNumber),
      )
      .collect();
  },
});

/**
 * Get all actions for a game
 */
export const getGameActions = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("actions")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

/**
 * Get recent hands across all games (for activity feed)
 */
export const getRecentHands = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // Get recent hands - note: this isn't indexed by time, so we get all and sort
    const allHands = await ctx.db.query("hands").collect();

    return allHands.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },
});

/**
 * Get hand statistics summary
 */
export const getHandStats = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const hands = await ctx.db
      .query("hands")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    if (hands.length === 0) {
      return {
        totalHands: 0,
        totalPot: 0,
        avgPot: 0,
        biggestPot: 0,
        showdownRate: 0,
        winsByPlayer: {},
      };
    }

    const totalPot = hands.reduce((sum, h) => sum + h.potAmount, 0);
    const showdowns = hands.filter((h) => h.showdownPlayers.length > 1);

    // Count wins by player
    const winsByPlayer: Record<string, number> = {};
    for (const hand of hands) {
      for (const winner of hand.winners) {
        winsByPlayer[winner.playerId] =
          (winsByPlayer[winner.playerId] || 0) + 1;
      }
    }

    return {
      totalHands: hands.length,
      totalPot,
      avgPot: Math.round(totalPot / hands.length),
      biggestPot: Math.max(...hands.map((h) => h.potAmount)),
      showdownRate: showdowns.length / hands.length,
      winsByPlayer,
    };
  },
});

/**
 * Get player's hand history across all games
 */
export const getPlayerHandHistory = query({
  args: {
    playerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Get all hands and filter for this player's showdowns
    const allHands = await ctx.db.query("hands").collect();

    const playerHands = allHands
      .filter(
        (h) =>
          h.showdownPlayers.some((p) => p.playerId === args.playerId) ||
          h.winners.some((w) => w.playerId === args.playerId),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return playerHands.map((h) => ({
      ...h,
      playerData: h.showdownPlayers.find((p) => p.playerId === args.playerId),
      wasWinner: h.winners.some((w) => w.playerId === args.playerId),
    }));
  },
});
