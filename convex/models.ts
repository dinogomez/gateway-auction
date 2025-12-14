import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

/**
 * Default starting balance for new models
 */
const DEFAULT_STARTING_BALANCE = 5000;

/**
 * Default big blind for bb/100 calculation
 */
const DEFAULT_BIG_BLIND = 20;

/**
 * Minimum hands required before classifying player type
 */
const MIN_HANDS_FOR_CLASSIFICATION = 50;

/**
 * Player type based on playing style
 */
type PlayerType = "BALANCED" | "RISKY" | "TIGHT" | "LOOSE" | "NEW";

/**
 * Classify a player's type based on their statistics
 * - BALANCED: Tight + Aggressive (optimal style)
 * - RISKY: Loose + Aggressive (high variance)
 * - TIGHT: Tight + Passive (conservative)
 * - LOOSE: Loose + Passive (weak/passive)
 * - NEW: Insufficient data (< 50 hands)
 */
function classifyPlayerType(
  handsPlayed: number,
  vpipHands: number,
  pfrHands: number,
  totalBets: number,
  totalRaises: number,
  totalCalls: number
): PlayerType {
  // Need minimum sample size
  if (handsPlayed < MIN_HANDS_FOR_CLASSIFICATION) return "NEW";

  const vpip = vpipHands / handsPlayed;
  const pfr = pfrHands / handsPlayed;
  const af = totalCalls > 0 ? (totalBets + totalRaises) / totalCalls : 2;

  const isTight = vpip < 0.22;
  const isLoose = vpip > 0.28;
  const isPassive = pfr < 0.12 || af < 1.0;
  const isAggressive = pfr > 0.18 && af > 1.5;

  if (isTight && isAggressive) return "BALANCED";
  if (isTight && isPassive) return "TIGHT";
  if (isLoose && isAggressive) return "RISKY";
  if (isLoose && isPassive) return "LOOSE";

  // Middle ground - use aggression as tiebreaker
  if (af > 1.2) return isTight ? "BALANCED" : "RISKY";
  return isTight ? "TIGHT" : "LOOSE";
}

/**
 * Get all models sorted by balance (leaderboard)
 * Includes rank changes from previous snapshot and percent change from base
 */
export const getLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const models = await ctx.db
      .query("models")
      .withIndex("by_balance")
      .order("desc")
      .take(limit);

    // Get the rank snapshots to find PREVIOUS state (before most recent game)
    // Snapshots are saved AFTER games complete, so we need the second-most-recent batch
    const allSnapshots = await ctx.db
      .query("rankSnapshots")
      .withIndex("by_timestamp")
      .order("desc")
      .take(200); // Get enough to find two different timestamps

    // Build map of previous ranks from the SECOND-most-recent timestamp batch
    const previousRanks = new Map<string, number>();
    if (allSnapshots.length > 0) {
      // Find unique timestamps (sorted descending)
      const uniqueTimestamps = [...new Set(allSnapshots.map((s) => s.timestamp))];

      // Use second-most-recent if available, otherwise first
      // (first batch = current state, second batch = previous state)
      const targetTimestamp = uniqueTimestamps.length > 1
        ? uniqueTimestamps[1]
        : uniqueTimestamps[0];

      allSnapshots
        .filter((s) => s.timestamp === targetTimestamp)
        .forEach((s) => previousRanks.set(s.modelId, s.rank));
    }

    return models.map((model, index) => {
      const currentRank = index + 1;
      const previousRank = previousRanks.get(model.gatewayId);
      const rankChange = previousRank ? previousRank - currentRank : 0;
      const profit = model.balance - DEFAULT_STARTING_BALANCE;
      const percentChange = (profit / DEFAULT_STARTING_BALANCE) * 100;
      // bb/100 = (profit / handsPlayed) * 100 / bigBlind
      const bbPer100 =
        model.handsPlayed > 0
          ? ((profit / model.handsPlayed) * 100) / DEFAULT_BIG_BLIND
          : 0;
      // Player type classification
      const playerType = classifyPlayerType(
        model.handsPlayed,
        model.vpipHands,
        model.pfrHands,
        model.totalBets,
        model.totalRaises,
        model.totalCalls
      );

      return {
        ...model,
        rank: currentRank,
        bbPer100, // bb/100 win rate (replaces winRate)
        profit,
        percentChange,
        rankChange, // positive = moved up, negative = moved down
        playerType,
      };
    });
  },
});

/**
 * Get a single model by gateway ID
 */
export const getByGatewayId = query({
  args: {
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();
  },
});

/**
 * Get multiple models by gateway IDs
 */
export const getByGatewayIds = query({
  args: {
    gatewayIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const models = await Promise.all(
      args.gatewayIds.map((gatewayId) =>
        ctx.db
          .query("models")
          .withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId))
          .first(),
      ),
    );
    return models.filter(Boolean);
  },
});

/**
 * Register a new model or get existing one
 */
export const getOrCreate = mutation({
  args: {
    name: v.string(),
    provider: v.string(),
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if model already exists
    const existing = await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new model with default stats
    const now = Date.now();
    return await ctx.db.insert("models", {
      name: args.name,
      provider: args.provider,
      gatewayId: args.gatewayId,

      // Financial
      balance: DEFAULT_STARTING_BALANCE,
      totalBuyIns: 0,
      totalCashouts: 0,
      biggestWin: 0,
      biggestLoss: 0,

      // Performance
      gamesPlayed: 0,
      gamesWon: 0,
      handsPlayed: 0,
      handsWon: 0,
      showdownsWon: 0,
      showdownsPlayed: 0,

      // Strategy metrics
      vpipHands: 0,
      pfrHands: 0,
      totalBets: 0,
      totalRaises: 0,
      totalCalls: 0,
      totalFolds: 0,
      foldsToRaise: 0,
      raisesFaced: 0,
      continuationBets: 0,
      continuationBetOpportunities: 0,
      totalPotWon: 0,

      // AI metrics
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalResponseTimeMs: 0,
      timeouts: 0,
      invalidActions: 0,

      createdAt: now,
    });
  },
});

/**
 * Deduct buy-in from model balance
 */
export const deductBuyIn = mutation({
  args: {
    gatewayId: v.string(),
    amount: v.number(),
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.gatewayId}`);
    }

    const newBalance = model.balance - args.amount;

    await ctx.db.patch(model._id, {
      balance: newBalance,
      totalBuyIns: model.totalBuyIns + args.amount,
    });

    // Record transaction
    await ctx.db.insert("transactions", {
      modelId: args.gatewayId,
      gameId: args.gameId,
      type: "buy_in",
      amount: -args.amount,
      balanceAfter: newBalance,
      createdAt: Date.now(),
    });

    return newBalance;
  },
});

/**
 * Credit cash-out to model balance
 */
export const creditCashout = mutation({
  args: {
    gatewayId: v.string(),
    amount: v.number(),
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.gatewayId}`);
    }

    const newBalance = model.balance + args.amount;

    await ctx.db.patch(model._id, {
      balance: newBalance,
      totalCashouts: model.totalCashouts + args.amount,
    });

    // Record transaction
    await ctx.db.insert("transactions", {
      modelId: args.gatewayId,
      gameId: args.gameId,
      type: "cash_out",
      amount: args.amount,
      balanceAfter: newBalance,
      createdAt: Date.now(),
    });

    return newBalance;
  },
});

/**
 * Update model stats after a game completes
 */
export const updateAfterGame = mutation({
  args: {
    gatewayId: v.string(),
    profit: v.number(),
    didWin: v.boolean(),
    handsPlayed: v.number(),
    handsWon: v.number(),
    showdownsPlayed: v.number(),
    showdownsWon: v.number(),
    vpipHands: v.number(),
    pfrHands: v.number(),
    totalBets: v.number(),
    totalRaises: v.number(),
    totalCalls: v.number(),
    totalFolds: v.number(),
    foldsToRaise: v.number(),
    raisesFaced: v.number(),
    continuationBets: v.number(),
    continuationBetOpportunities: v.number(),
    totalPotWon: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    responseTimeMs: v.number(),
    timeouts: v.number(),
    invalidActions: v.number(),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.gatewayId}`);
    }

    await ctx.db.patch(model._id, {
      gamesPlayed: model.gamesPlayed + 1,
      gamesWon: model.gamesWon + (args.didWin ? 1 : 0),
      handsPlayed: model.handsPlayed + args.handsPlayed,
      handsWon: model.handsWon + args.handsWon,
      showdownsPlayed: model.showdownsPlayed + args.showdownsPlayed,
      showdownsWon: model.showdownsWon + args.showdownsWon,
      biggestWin: Math.max(model.biggestWin, args.profit > 0 ? args.profit : 0),
      biggestLoss: Math.min(
        model.biggestLoss,
        args.profit < 0 ? args.profit : 0,
      ),
      vpipHands: model.vpipHands + args.vpipHands,
      pfrHands: model.pfrHands + args.pfrHands,
      totalBets: model.totalBets + args.totalBets,
      totalRaises: model.totalRaises + args.totalRaises,
      totalCalls: model.totalCalls + args.totalCalls,
      totalFolds: model.totalFolds + args.totalFolds,
      foldsToRaise: model.foldsToRaise + args.foldsToRaise,
      raisesFaced: model.raisesFaced + args.raisesFaced,
      continuationBets: model.continuationBets + args.continuationBets,
      continuationBetOpportunities:
        model.continuationBetOpportunities + args.continuationBetOpportunities,
      totalPotWon: model.totalPotWon + args.totalPotWon,
      totalInputTokens: model.totalInputTokens + args.inputTokens,
      totalOutputTokens: model.totalOutputTokens + args.outputTokens,
      totalResponseTimeMs: model.totalResponseTimeMs + args.responseTimeMs,
      timeouts: model.timeouts + args.timeouts,
      invalidActions: model.invalidActions + args.invalidActions,
    });
  },
});

/**
 * Admin: Adjust model balance manually
 */
export const adjustBalance = mutation({
  args: {
    gatewayId: v.string(),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.gatewayId}`);
    }

    const newBalance = model.balance + args.amount;

    await ctx.db.patch(model._id, {
      balance: newBalance,
    });

    // Record transaction
    await ctx.db.insert("transactions", {
      modelId: args.gatewayId,
      gameId: undefined,
      type: "adjustment",
      amount: args.amount,
      balanceAfter: newBalance,
      createdAt: Date.now(),
    });

    return newBalance;
  },
});

/**
 * Get model statistics summary
 */
export const getStats = query({
  args: {
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!model) {
      return null;
    }

    // Calculate derived stats
    const winRate =
      model.handsPlayed > 0 ? model.handsWon / model.handsPlayed : 0;
    const showdownWinRate =
      model.showdownsPlayed > 0
        ? model.showdownsWon / model.showdownsPlayed
        : 0;
    const vpip =
      model.handsPlayed > 0 ? model.vpipHands / model.handsPlayed : 0;
    const pfr = model.handsPlayed > 0 ? model.pfrHands / model.handsPlayed : 0;
    const foldToRaiseRate =
      model.raisesFaced > 0 ? model.foldsToRaise / model.raisesFaced : 0;
    const cBetRate =
      model.continuationBetOpportunities > 0
        ? model.continuationBets / model.continuationBetOpportunities
        : 0;

    // Aggression factor: (bets + raises) / calls
    const aggressionFactor =
      model.totalCalls > 0
        ? (model.totalBets + model.totalRaises) / model.totalCalls
        : 0;

    // Average response time
    const avgResponseTime =
      model.handsPlayed > 0 ? model.totalResponseTimeMs / model.handsPlayed : 0;

    // Timeout rate
    const timeoutRate =
      model.handsPlayed > 0 ? model.timeouts / model.handsPlayed : 0;

    return {
      ...model,
      profit: model.balance - DEFAULT_STARTING_BALANCE,
      winRate,
      showdownWinRate,
      vpip,
      pfr,
      foldToRaiseRate,
      cBetRate,
      aggressionFactor,
      avgResponseTime,
      timeoutRate,
    };
  },
});

/**
 * Get transaction history for a model
 */
export const getTransactions = query({
  args: {
    gatewayId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("transactions")
      .withIndex("by_model", (q) => q.eq("modelId", args.gatewayId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get balance history for all models (for charting)
 * Uses transactions table for historical data, with starting balance
 */
export const getBalanceHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const models = await ctx.db.query("models").collect();

    const histories = await Promise.all(
      models.map(async (model) => {
        // Use transactions table (cash_out type) for balance history
        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_model", (q) => q.eq("modelId", model.gatewayId))
          .order("asc")
          .take(args.limit ?? 500);

        // Filter to cash_out transactions which have the final balance after each game
        const cashOuts = transactions.filter((t) => t.type === "cash_out");

        // Start with initial balance at model creation time
        const data = [
          {
            timestamp: model.createdAt,
            balance: 5000, // Default starting balance
          },
          ...cashOuts.map((t) => ({
            timestamp: t.createdAt,
            balance: t.balanceAfter,
          })),
        ];

        return {
          modelId: model.gatewayId,
          name: model.name,
          data,
        };
      }),
    );

    return histories;
  },
});

/**
 * Save rank snapshot after game completion
 * Internal mutation called from settleGame
 */
export const saveRankSnapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db
      .query("models")
      .withIndex("by_balance")
      .order("desc")
      .collect();

    const timestamp = Date.now();

    for (let i = 0; i < models.length; i++) {
      await ctx.db.insert("rankSnapshots", {
        modelId: models[i].gatewayId,
        rank: i + 1,
        balance: models[i].balance,
        timestamp,
      });
    }
  },
});
