import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ==========================================================================
  // PLAYERS - Persistent model/player stats across all games
  // ==========================================================================
  players: defineTable({
    modelId: v.string(), // AI model ID (e.g., "claude-3-opus")
    modelName: v.string(), // Display name

    // Game statistics
    gamesPlayed: v.number(),
    handsPlayed: v.number(),
    handsWon: v.number(),

    // Financial stats
    totalProfit: v.number(),
    currentBalance: v.number(),
    biggestWin: v.number(),
    biggestLoss: v.number(),

    // Behavioral stats
    foldRate: v.number(), // 0-1
    raiseRate: v.number(), // 0-1
    allInCount: v.number(),
    showdownWinRate: v.number(), // 0-1

    // Timestamps
    lastPlayed: v.number(),
    createdAt: v.number(),
  })
    .index("by_modelId", ["modelId"])
    .index("by_profit", ["totalProfit"])
    .index("by_balance", ["currentBalance"]),

  // ==========================================================================
  // GAMES - Game session records
  // ==========================================================================
  games: defineTable({
    status: v.string(), // "active" | "completed" | "abandoned"
    players: v.array(v.string()), // model IDs participating
    humanPlayerId: v.optional(v.string()), // if human is playing

    // Game progress
    currentHandNumber: v.number(),
    totalHands: v.number(),

    // Winner info (set when game completes)
    winnerId: v.optional(v.string()),
    winnerProfit: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  // ==========================================================================
  // HANDS - Individual hand results within games
  // ==========================================================================
  hands: defineTable({
    gameId: v.id("games"),
    handNumber: v.number(),

    // Winners can be multiple (split pot)
    winners: v.array(
      v.object({
        playerId: v.string(),
        amount: v.number(),
        handRank: v.string(),
        handDescription: v.string(),
      }),
    ),

    // Pot info
    potAmount: v.number(),

    // Community cards (stored as objects for flexibility)
    communityCards: v.array(
      v.object({
        suit: v.string(),
        rank: v.string(),
      }),
    ),

    // Showdown data (players who showed cards)
    showdownPlayers: v.array(
      v.object({
        playerId: v.string(),
        holeCards: v.array(
          v.object({
            suit: v.string(),
            rank: v.string(),
          }),
        ),
        handRank: v.string(),
        handDescription: v.string(),
        profit: v.number(),
      }),
    ),

    // Timestamps
    createdAt: v.number(),
  }).index("by_game", ["gameId"]),

  // ==========================================================================
  // PROFIT HISTORY - Time series data for charts
  // ==========================================================================
  profitHistory: defineTable({
    modelId: v.string(),
    gameId: v.id("games"),
    handNumber: v.number(),
    profit: v.number(), // cumulative profit at this point
    balance: v.number(), // balance at this point
    timestamp: v.number(),
  })
    .index("by_model", ["modelId"])
    .index("by_model_time", ["modelId", "timestamp"])
    .index("by_game", ["gameId"]),

  // ==========================================================================
  // ACTION LOG - Detailed betting action history (for analysis/replay)
  // ==========================================================================
  actions: defineTable({
    gameId: v.id("games"),
    handNumber: v.number(),
    playerId: v.string(),
    playerName: v.string(),
    action: v.string(), // "fold" | "check" | "call" | "raise" | "all-in"
    amount: v.optional(v.number()),
    phase: v.string(), // "preflop" | "flop" | "turn" | "river"
    timestamp: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_hand", ["gameId", "handNumber"]),
});
