/**
 * Game Scheduler Module
 * Handles automatic game creation with rules:
 * - Creates a game every 2 hours (via cron)
 * - Maximum 2 live games at a time
 * - Disabled when credits < 10%
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_CONCURRENT_GAMES = 2;
const MIN_CREDIT_PERCENTAGE = 0.1; // 10%

// All model IDs that participate in scheduled games
const SCHEDULED_GAME_MODELS = [
  "anthropic/claude-sonnet-4.5",
  "xai/grok-4.1-fast-reasoning",
  "deepseek/deepseek-v3.2",
  "google/gemini-2.5-flash-lite-preview-09-2025",
  "mistral/mistral-medium",
  "meta/llama-4-scout",
  "openai/gpt-5-mini",
  "perplexity/sonar",
];

const DEFAULT_CONFIG = {
  buyIn: 1500,
  blinds: { small: 10, big: 20 },
  maxHands: 20,
  turnTimeoutMs: 90000,
};

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get scheduler status for display
 */
export const getSchedulerStatus = query({
  args: {},
  handler: async (ctx) => {
    // Count active/waiting games (non-dev)
    const activeGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const waitingGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    const liveGames = [...activeGames, ...waitingGames].filter(
      (g) => !g.isDevGame,
    );

    // Get credits
    const credits = await ctx.db.query("credits").first();
    const creditPercentage = credits && credits.limit > 0 ? credits.balance / credits.limit : 1;

    return {
      liveGameCount: liveGames.length,
      maxConcurrentGames: MAX_CONCURRENT_GAMES,
      creditPercentage: Math.round(creditPercentage * 100),
      minCreditPercentage: MIN_CREDIT_PERCENTAGE * 100,
      canCreateGame:
        liveGames.length < MAX_CONCURRENT_GAMES &&
        creditPercentage >= MIN_CREDIT_PERCENTAGE,
      disabledReason:
        liveGames.length >= MAX_CONCURRENT_GAMES
          ? "Maximum concurrent games reached"
          : creditPercentage < MIN_CREDIT_PERCENTAGE
            ? "Credits below 10%"
            : null,
    };
  },
});

/**
 * Internal query to check if we can create a game
 */
export const canCreateGame = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Count active/waiting games (non-dev)
    const activeGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const waitingGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    const liveGames = [...activeGames, ...waitingGames].filter(
      (g) => !g.isDevGame,
    );

    if (liveGames.length >= MAX_CONCURRENT_GAMES) {
      return { canCreate: false, reason: "Max concurrent games reached" };
    }

    // Check credits
    const credits = await ctx.db.query("credits").first();
    if (!credits) {
      return { canCreate: false, reason: "Credits not synced" };
    }

    const creditPercentage = credits.limit > 0 ? credits.balance / credits.limit : 1;
    if (creditPercentage < MIN_CREDIT_PERCENTAGE) {
      return {
        canCreate: false,
        reason: `Credits below ${MIN_CREDIT_PERCENTAGE * 100}%`,
      };
    }

    return { canCreate: true, reason: null };
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Internal mutation called by cron to try creating a scheduled game
 */
export const tryCreateScheduledGame = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if we can create a game
    const activeGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const waitingGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    const liveGames = [...activeGames, ...waitingGames].filter(
      (g) => !g.isDevGame,
    );

    if (liveGames.length >= MAX_CONCURRENT_GAMES) {
      console.log(
        `[Scheduler] Skipping: ${liveGames.length}/${MAX_CONCURRENT_GAMES} games active`,
      );
      return { created: false, reason: "Max concurrent games reached" };
    }

    // Check credits
    const credits = await ctx.db.query("credits").first();
    if (!credits) {
      console.log("[Scheduler] Skipping: Credits not synced");
      return { created: false, reason: "Credits not synced" };
    }

    const creditPercentage = credits.limit > 0 ? credits.balance / credits.limit : 1;
    if (creditPercentage < MIN_CREDIT_PERCENTAGE) {
      console.log(
        `[Scheduler] Skipping: Credits at ${(creditPercentage * 100).toFixed(1)}%`,
      );
      return {
        created: false,
        reason: `Credits below ${MIN_CREDIT_PERCENTAGE * 100}%`,
      };
    }

    // Verify all models exist
    const models = await Promise.all(
      SCHEDULED_GAME_MODELS.map(async (gatewayId) => {
        const model = await ctx.db
          .query("models")
          .withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId))
          .first();
        return model;
      }),
    );

    const missingModels = SCHEDULED_GAME_MODELS.filter(
      (_, i) => !models[i],
    );
    if (missingModels.length > 0) {
      console.log(`[Scheduler] Skipping: Missing models: ${missingModels.join(", ")}`);
      return { created: false, reason: `Missing models: ${missingModels.join(", ")}` };
    }

    // Create the game
    const now = Date.now();
    const config = DEFAULT_CONFIG;

    // Initialize player states
    const validModels = models.filter((m) => m !== null);
    const characterIds = [
      "sherlock",
      "yoda",
      "gandalf",
      "darth_vader",
      "jack_sparrow",
      "einstein",
      "tesla",
      "tyrion",
    ];
    const shuffledChars = [...characterIds].sort(() => Math.random() - 0.5);

    const playerStates = validModels.map((model, index) => ({
      modelId: model.gatewayId,
      codename: model.name,
      characterId: shuffledChars[index % shuffledChars.length],
      chips: config.buyIn,
      hand: [] as { suit: string; rank: string }[],
      currentBet: 0,
      totalBetThisHand: 0,
      folded: false,
      isAllIn: false,
      hasActed: false,
      position: index,
    }));

    // Initialize in-game stats
    const inGameStats = validModels.map((model) => ({
      modelId: model.gatewayId,
      stats: {
        handsDealt: 0,
        handsPlayed: 0,
        preflopRaises: 0,
        preflopCalls: 0,
        preflopFolds: 0,
        totalBets: 0,
        totalRaises: 0,
        totalCalls: 0,
        totalFolds: 0,
        totalChecks: 0,
        showdownsReached: 0,
        showdownsWon: 0,
        foldedToRaise: 0,
        raisesFaced: 0,
        timeouts: 0,
      },
    }));

    const initialState = {
      phase: "preflop" as const,
      deck: [] as { suit: string; rank: string }[],
      communityCards: [] as { suit: string; rank: string }[],
      playerStates,
      pot: 0,
      currentBet: 0,
      currentPlayerIndex: 0,
      dealerIndex: 0,
      minRaise: config.blinds.big,
      lastRaiseAmount: config.blinds.big,
      lastAggressor: undefined as number | undefined,
      thinkingPlayerId: undefined as string | undefined,
      actionLog: [] as {
        type?: "action" | "phase" | "system";
        playerId: string;
        action: string;
        amount?: number;
        timestamp: number;
      }[],
      inGameStats,
    };

    // Create the game
    const gameId = await ctx.db.insert("games", {
      status: "waiting",
      buyIn: config.buyIn,
      blinds: config.blinds,
      maxHands: config.maxHands,
      turnTimeoutMs: config.turnTimeoutMs,
      currentHand: 0,
      turnNumber: 0,
      playerModelIds: SCHEDULED_GAME_MODELS,
      state: initialState,
      handHistory: [],
      createdAt: now,
    });

    // Deduct buy-ins from each model
    for (const model of validModels) {
      const newBalance = model.balance - config.buyIn;
      await ctx.db.patch(model._id, {
        balance: newBalance,
        totalBuyIns: model.totalBuyIns + config.buyIn,
      });

      // Record buy-in transaction
      await ctx.db.insert("transactions", {
        modelId: model.gatewayId,
        gameId,
        type: "buy_in",
        amount: -config.buyIn,
        balanceAfter: newBalance,
        createdAt: now,
      });
    }

    // Start the game immediately
    await ctx.db.patch(gameId, {
      status: "active",
    });

    // Schedule the first hand
    await ctx.scheduler.runAfter(0, internal.rankedGames.startNewHand, {
      gameId,
    });

    console.log(`[Scheduler] Created and started game: ${gameId}`);
    return { created: true, gameId };
  },
});

/**
 * Manual trigger to create a scheduled game (for admin use)
 */
export const forceCreateGame = internalMutation({
  args: {
    skipChecks: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.skipChecks) {
      // Run normal checks
      const activeGames = await ctx.db
        .query("games")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
      const waitingGames = await ctx.db
        .query("games")
        .withIndex("by_status", (q) => q.eq("status", "waiting"))
        .collect();

      const liveGames = [...activeGames, ...waitingGames].filter(
        (g) => !g.isDevGame,
      );

      if (liveGames.length >= MAX_CONCURRENT_GAMES) {
        throw new Error(
          `Cannot create game: ${liveGames.length}/${MAX_CONCURRENT_GAMES} games already active`,
        );
      }

      const credits = await ctx.db.query("credits").first();
      if (credits) {
        const creditPercentage = credits.limit > 0 ? credits.balance / credits.limit : 1;
        if (creditPercentage < MIN_CREDIT_PERCENTAGE) {
          throw new Error(
            `Cannot create game: Credits at ${(creditPercentage * 100).toFixed(1)}%`,
          );
        }
      }
    }

    // Delegate to tryCreateScheduledGame
    // Note: We can't call another mutation directly, so we duplicate the logic
    // or use scheduler.runAfter with 0 delay
    await ctx.scheduler.runAfter(0, internal.scheduler.tryCreateScheduledGame, {});
    return { scheduled: true };
  },
});
