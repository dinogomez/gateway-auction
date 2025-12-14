import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Default AI models for the poker game
 * Updated model list with display names
 */
const DEFAULT_MODELS = [
  {
    name: "Sonnet 4.5",
    provider: "anthropic",
    gatewayId: "anthropic/claude-sonnet-4.5",
  },
  {
    name: "Grok 4.1",
    provider: "xai",
    gatewayId: "xai/grok-4.1-fast-reasoning",
  },
  {
    name: "DeepSeek V3.2",
    provider: "deepseek",
    gatewayId: "deepseek/deepseek-v3.2",
  },
  {
    name: "Gemini 2.5 Flash",
    provider: "google",
    gatewayId: "google/gemini-2.5-flash-lite-preview-09-2025",
  },
  {
    name: "Mistral",
    provider: "mistral",
    gatewayId: "mistral/mistral-medium",
  },
  {
    name: "Llama 4 Scout",
    provider: "meta",
    gatewayId: "meta/llama-4-scout",
  },
  {
    name: "GPT 5 Mini",
    provider: "openai",
    gatewayId: "openai/gpt-5-mini",
  },
  {
    name: "Sonar",
    provider: "perplexity",
    gatewayId: "perplexity/sonar",
  },
];

// Dev-only model (cheap for testing)
const DEV_MODEL = {
  name: "GPT-5 Nano",
  provider: "openai",
  gatewayId: "openai/gpt-5-nano",
};

const DEFAULT_STARTING_BALANCE = 5000;

/**
 * Internal mutation to seed models (can be called from other mutations)
 */
export const autoSeedModels = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results: { name: string; created: boolean }[] = [];

    for (const modelData of DEFAULT_MODELS) {
      // Check if model already exists
      const existing = await ctx.db
        .query("models")
        .withIndex("by_gatewayId", (q) =>
          q.eq("gatewayId", modelData.gatewayId),
        )
        .first();

      if (existing) {
        results.push({ name: modelData.name, created: false });
        continue;
      }

      // Create new model
      const now = Date.now();
      await ctx.db.insert("models", {
        name: modelData.name,
        provider: modelData.provider,
        gatewayId: modelData.gatewayId,

        // Cost tracking
        totalCost: 0,

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

      results.push({ name: modelData.name, created: true });
    }

    return results;
  },
});

/**
 * Seed the database with default AI models (public mutation for admin)
 */
export const seedModels = mutation({
  args: {},
  handler: async (ctx) => {
    const results: { name: string; created: boolean }[] = [];

    for (const modelData of DEFAULT_MODELS) {
      // Check if model already exists
      const existing = await ctx.db
        .query("models")
        .withIndex("by_gatewayId", (q) =>
          q.eq("gatewayId", modelData.gatewayId),
        )
        .first();

      if (existing) {
        results.push({ name: modelData.name, created: false });
        continue;
      }

      // Create new model
      const now = Date.now();
      await ctx.db.insert("models", {
        name: modelData.name,
        provider: modelData.provider,
        gatewayId: modelData.gatewayId,

        // Cost tracking
        totalCost: 0,

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

      results.push({ name: modelData.name, created: true });
    }

    return results;
  },
});

/**
 * Reset all model balances to default
 */
export const resetAllBalances = mutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query("models").collect();

    for (const model of models) {
      await ctx.db.patch(model._id, {
        balance: DEFAULT_STARTING_BALANCE,
        totalBuyIns: 0,
        totalCashouts: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        handsPlayed: 0,
        handsWon: 0,
      });
    }

    return { reset: models.length };
  },
});

/**
 * Update a model's gatewayId (for fixing model ID changes)
 */
export const updateModelGatewayId = mutation({
  args: {
    oldGatewayId: v.string(),
    newGatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("models")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.oldGatewayId))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.oldGatewayId}`);
    }

    await ctx.db.patch(model._id, {
      gatewayId: args.newGatewayId,
    });

    return { updated: true, name: model.name };
  },
});

/**
 * Delete all models and reset (for dev)
 */
export const deleteAllModels = mutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query("models").collect();
    for (const model of models) {
      await ctx.db.delete(model._id);
    }
    return { deleted: models.length };
  },
});

/**
 * Delete a specific game and reverse its effects on model stats
 */
export const deleteGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    // If game has results, reverse the balance changes
    if (game.results && game.status === "completed") {
      // Find the winner (highest profit)
      const sortedResults = [...game.results].sort(
        (a, b) => b.profit - a.profit,
      );
      const winnerProfit = sortedResults[0]?.profit ?? 0;

      for (const result of game.results) {
        const model = await ctx.db
          .query("models")
          .withIndex("by_gatewayId", (q) => q.eq("gatewayId", result.modelId))
          .first();

        if (model) {
          // Reverse the cash-out (subtract finalChips from balance)
          // Also add back the buy-in that was deducted when joining
          const newBalance = model.balance - result.finalChips + game.buyIn;

          await ctx.db.patch(model._id, {
            balance: newBalance,
            totalCashouts: Math.max(0, model.totalCashouts - result.finalChips),
            totalBuyIns: Math.max(0, model.totalBuyIns - game.buyIn),
            gamesPlayed: Math.max(0, model.gamesPlayed - 1),
            gamesWon:
              result.profit === winnerProfit
                ? Math.max(0, model.gamesWon - 1)
                : model.gamesWon,
          });
        }
      }
    } else if (game.status === "active" || game.status === "waiting") {
      // Game not completed - just refund buy-ins
      for (const modelId of game.playerModelIds) {
        const model = await ctx.db
          .query("models")
          .withIndex("by_gatewayId", (q) => q.eq("gatewayId", modelId))
          .first();

        if (model) {
          await ctx.db.patch(model._id, {
            balance: model.balance + game.buyIn,
            totalBuyIns: Math.max(0, model.totalBuyIns - game.buyIn),
          });
        }
      }
    }

    // Delete all transactions for this game
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    for (const tx of transactions) {
      await ctx.db.delete(tx._id);
    }

    // Delete all hands for this game
    const hands = await ctx.db
      .query("hands")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    for (const hand of hands) {
      await ctx.db.delete(hand._id);
    }

    // Delete all actions for this game
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    for (const action of actions) {
      await ctx.db.delete(action._id);
    }

    // Delete profit history for this game
    const profitHistory = await ctx.db
      .query("profitHistory")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    for (const ph of profitHistory) {
      await ctx.db.delete(ph._id);
    }

    // Delete the game itself
    await ctx.db.delete(args.gameId);

    return { deleted: true };
  },
});

/**
 * Delete all games and their related data
 */
export const deleteAllGames = mutation({
  args: {},
  handler: async (ctx) => {
    // Delete all transactions
    const transactions = await ctx.db.query("transactions").collect();
    for (const tx of transactions) {
      await ctx.db.delete(tx._id);
    }

    // Delete all hands
    const hands = await ctx.db.query("hands").collect();
    for (const hand of hands) {
      await ctx.db.delete(hand._id);
    }

    // Delete all actions
    const actions = await ctx.db.query("actions").collect();
    for (const action of actions) {
      await ctx.db.delete(action._id);
    }

    // Delete all profit history
    const profitHistory = await ctx.db.query("profitHistory").collect();
    for (const ph of profitHistory) {
      await ctx.db.delete(ph._id);
    }

    // Delete all rank snapshots (reset trends)
    const rankSnapshots = await ctx.db.query("rankSnapshots").collect();
    for (const snapshot of rankSnapshots) {
      await ctx.db.delete(snapshot._id);
    }

    // Delete all games
    const games = await ctx.db.query("games").collect();
    for (const game of games) {
      await ctx.db.delete(game._id);
    }

    // Reset all model stats
    const models = await ctx.db.query("models").collect();
    for (const model of models) {
      await ctx.db.patch(model._id, {
        balance: 5000,
        totalCost: 0,
        totalBuyIns: 0,
        totalCashouts: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        handsPlayed: 0,
        handsWon: 0,
        showdownsWon: 0,
        showdownsPlayed: 0,
        biggestWin: 0,
        biggestLoss: 0,
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
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalResponseTimeMs: 0,
        timeouts: 0,
        invalidActions: 0,
      });
    }

    return {
      deletedGames: games.length,
      deletedTransactions: transactions.length,
      deletedRankSnapshots: rankSnapshots.length,
      modelsReset: models.length,
    };
  },
});
