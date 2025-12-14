import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// =============================================================================
// CARD VALIDATORS
// =============================================================================
const cardValidator = v.object({
  suit: v.string(), // "h" | "d" | "c" | "s"
  rank: v.string(), // "2"-"10", "j", "q", "k", "a"
});

// =============================================================================
// PLAYER STATE VALIDATOR (within a game)
// =============================================================================
const playerStateValidator = v.object({
  modelId: v.string(),
  codename: v.string(),
  characterId: v.string(),
  chips: v.number(),
  hand: v.array(cardValidator),
  currentBet: v.number(),
  totalBetThisHand: v.number(),
  folded: v.boolean(),
  isAllIn: v.boolean(),
  hasActed: v.boolean(),
  position: v.number(),
});

// =============================================================================
// IN-GAME STATS VALIDATOR (per-player tendency tracking)
// =============================================================================
const inGameStatsValidator = v.object({
  handsDealt: v.number(),
  handsPlayed: v.number(),
  preflopRaises: v.number(),
  preflopCalls: v.number(),
  preflopFolds: v.number(),
  totalBets: v.number(),
  totalRaises: v.number(),
  totalCalls: v.number(),
  totalFolds: v.number(),
  totalChecks: v.number(),
  showdownsReached: v.number(),
  showdownsWon: v.number(),
  foldedToRaise: v.number(),
  raisesFaced: v.number(),
  timeouts: v.number(),
});

export default defineSchema({
  // ==========================================================================
  // MODELS - AI model registry with lifetime stats
  // ==========================================================================
  models: defineTable({
    // Identity
    name: v.string(), // "Claude Sonnet 4"
    provider: v.string(), // "anthropic"
    gatewayId: v.string(), // "anthropic/claude-sonnet-4-20250514"

    // Cost tracking (actual USD from AI Gateway)
    totalCost: v.optional(v.number()), // Total USD spent on this model

    // Legacy pricing fields (optional, will be removed after data cleanup)
    inputTokenPrice: v.optional(v.number()),
    outputTokenPrice: v.optional(v.number()),

    // Financial
    balance: v.number(), // Current global balance
    totalBuyIns: v.number(),
    totalCashouts: v.number(),
    biggestWin: v.number(),
    biggestLoss: v.number(),

    // Performance
    gamesPlayed: v.number(),
    gamesWon: v.number(),
    handsPlayed: v.number(),
    handsWon: v.number(),
    showdownsWon: v.number(),
    showdownsPlayed: v.number(),

    // Strategy metrics
    vpipHands: v.number(), // Hands where VPIP'd
    pfrHands: v.number(), // Hands where PFR'd
    totalBets: v.number(),
    totalRaises: v.number(),
    totalCalls: v.number(),
    totalFolds: v.number(),
    foldsToRaise: v.number(),
    raisesFaced: v.number(),
    continuationBets: v.number(),
    continuationBetOpportunities: v.number(),
    totalPotWon: v.number(),

    // AI metrics
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalResponseTimeMs: v.number(),
    timeouts: v.number(),
    invalidActions: v.number(),

    createdAt: v.number(),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_balance", ["balance"]),

  // ==========================================================================
  // GAMES - Game sessions with live state for spectating
  // ==========================================================================
  games: defineTable({
    status: v.union(
      v.literal("waiting"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),

    // Config
    buyIn: v.number(),
    blinds: v.object({ small: v.number(), big: v.number() }),
    maxHands: v.number(),
    turnTimeoutMs: v.number(),
    isDevGame: v.optional(v.boolean()), // Dev games don't track stats

    // Cost tracking
    totalAICost: v.optional(v.number()), // Total USD spent on AI calls for this game

    // Progress
    currentHand: v.number(),
    turnNumber: v.number(), // Global turn counter for race-safety

    // Players (model IDs)
    playerModelIds: v.array(v.string()),

    // Player results (set when game completes)
    results: v.optional(
      v.array(
        v.object({
          modelId: v.string(),
          buyIn: v.number(),
          finalChips: v.number(),
          profit: v.number(),
        }),
      ),
    ),

    // Live game state (for spectating)
    state: v.object({
      phase: v.string(), // "preflop" | "flop" | "turn" | "river" | "showdown"
      pot: v.number(),
      communityCards: v.array(cardValidator),
      currentPlayerIndex: v.number(),
      dealerIndex: v.number(),
      deck: v.array(cardValidator),
      currentBet: v.number(),
      minRaise: v.number(),
      lastRaiseAmount: v.number(),
      lastAggressor: v.optional(v.number()),
      playerStates: v.array(playerStateValidator),
      inGameStats: v.array(
        v.object({
          modelId: v.string(),
          stats: inGameStatsValidator,
        }),
      ),
      // Live action log for spectator feed (last 30 entries)
      actionLog: v.optional(
        v.array(
          v.object({
            type: v.optional(
              v.union(v.literal("action"), v.literal("phase"), v.literal("system")),
            ), // Optional for backwards compat with old entries
            playerId: v.optional(v.string()), // Optional for system messages
            playerName: v.optional(v.string()), // Optional for system messages
            action: v.optional(v.string()),
            amount: v.optional(v.number()),
            phase: v.optional(v.string()), // Optional for system messages
            timestamp: v.number(),
            reasoning: v.optional(v.string()),
            content: v.optional(v.string()), // For system messages
            handNumber: v.optional(v.number()), // Hand number for filtering
            isAllIn: v.optional(v.boolean()), // Whether this action was an all-in
            position: v.optional(v.string()), // Position like "BTN", "SB", "BB", "UTG", etc.
          }),
        ),
      ),
      // Current thinking state (who is thinking)
      thinkingPlayerId: v.optional(v.string()),
    }),

    // Hand history (for replay)
    handHistory: v.optional(
      v.array(
        v.object({
          handNumber: v.number(),
          pot: v.number(),
          communityCards: v.array(cardValidator),
          winnerModelIds: v.array(v.string()),
          winCondition: v.string(), // "showdown" | "all_folded"
          actions: v.array(
            v.object({
              modelId: v.string(),
              action: v.string(),
              amount: v.optional(v.number()),
              phase: v.string(),
              timestamp: v.number(),
            }),
          ),
        }),
      ),
    ),

    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()), // Game duration in milliseconds
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_dev", ["isDevGame"]),

  // ==========================================================================
  // TRANSACTIONS - Buy-in/cash-out ledger
  // ==========================================================================
  transactions: defineTable({
    modelId: v.string(),
    gameId: v.optional(v.id("games")),
    type: v.union(
      v.literal("buy_in"),
      v.literal("cash_out"),
      v.literal("adjustment"),
    ),
    amount: v.number(), // Negative for buy-in, positive for cash-out
    balanceAfter: v.number(),
    createdAt: v.number(),
  })
    .index("by_model", ["modelId"])
    .index("by_game", ["gameId"]),

  // ==========================================================================
  // LEGACY TABLES (for Practice Mode compatibility)
  // ==========================================================================

  // Players - kept for backwards compatibility with Practice Mode
  players: defineTable({
    modelId: v.string(),
    modelName: v.string(),
    gamesPlayed: v.number(),
    handsPlayed: v.number(),
    handsWon: v.number(),
    totalProfit: v.number(),
    currentBalance: v.number(),
    biggestWin: v.number(),
    biggestLoss: v.number(),
    foldRate: v.number(),
    raiseRate: v.number(),
    allInCount: v.number(),
    showdownWinRate: v.number(),
    lastPlayed: v.number(),
    createdAt: v.number(),
  })
    .index("by_modelId", ["modelId"])
    .index("by_profit", ["totalProfit"])
    .index("by_balance", ["currentBalance"]),

  // Hands - individual hand results
  hands: defineTable({
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
    createdAt: v.number(),
  }).index("by_game", ["gameId"]),

  // Profit history for charts
  profitHistory: defineTable({
    modelId: v.string(),
    gameId: v.id("games"),
    handNumber: v.number(),
    profit: v.number(),
    balance: v.number(),
    timestamp: v.number(),
  })
    .index("by_model", ["modelId"])
    .index("by_model_time", ["modelId", "timestamp"])
    .index("by_game", ["gameId"]),

  // Action log for replay
  actions: defineTable({
    gameId: v.id("games"),
    handNumber: v.number(),
    playerId: v.string(),
    playerName: v.string(),
    action: v.string(),
    amount: v.optional(v.number()),
    phase: v.string(),
    timestamp: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_hand", ["gameId", "handNumber"]),

  // ==========================================================================
  // CREDITS - AI Gateway credit balance (synced from Vercel)
  // ==========================================================================
  credits: defineTable({
    balance: v.number(), // Current balance in USD
    totalUsed: v.number(), // Total used in USD
    limit: v.number(), // Credit limit ($20)
    lastSyncedAt: v.number(), // Last sync timestamp
  }),

  // ==========================================================================
  // DEV STATS - Statistics for dev games (separate from leaderboard)
  // ==========================================================================
  devStats: defineTable({
    gatewayId: v.string(), // Model gateway ID (e.g., "openai/gpt-5-nano")

    // Performance
    gamesPlayed: v.number(),
    gamesWon: v.number(),
    handsPlayed: v.number(),
    handsWon: v.number(),

    // Financial (virtual, not affecting real balances)
    totalProfit: v.number(),
    biggestWin: v.number(),
    biggestLoss: v.number(),

    // AI metrics
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalResponseTimeMs: v.number(),
    totalCost: v.number(), // Actual USD spent

    // Strategy metrics
    totalBets: v.number(),
    totalRaises: v.number(),
    totalCalls: v.number(),
    totalFolds: v.number(),
    totalChecks: v.number(),

    updatedAt: v.number(),
  }).index("by_gatewayId", ["gatewayId"]),

  // ==========================================================================
  // RANK SNAPSHOTS - Track rank position changes over time
  // ==========================================================================
  rankSnapshots: defineTable({
    modelId: v.string(), // gatewayId
    rank: v.number(), // Position (1, 2, 3...)
    balance: v.number(), // Balance at snapshot time
    timestamp: v.number(), // When snapshot was taken
  })
    .index("by_model", ["modelId"])
    .index("by_timestamp", ["timestamp"]),
});
