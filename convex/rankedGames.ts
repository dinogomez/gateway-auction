import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  startNewHandRef,
  scheduleAITurnRef,
  handleTimeoutRef,
  processAITurnRef,
  settleGameRef,
  getAIDecisionRef,
  syncCreditsInternalRef,
  saveRankSnapshotRef,
  dealNextStreetRef,
} from "./internalRefs";
import { generatePrompt } from "./aiAction";
import {
  createDeck,
  shuffleDeck,
  dealCards,
  evaluateHand,
  calculatePots,
  distributePots,
  getAmountToCall,
  getMinRaise,
  getValidActions,
  getNextActivePlayer,
  countActivePlayers,
  countPlayersInHand,
  isBettingRoundComplete,
  HandRank,
  type Card,
  type PlayerState,
  type EvaluatedHand,
} from "./pokerLogic";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONFIG = {
  buyIn: 1500,
  blinds: { small: 10, big: 20 },
  maxHands: 20,
  turnTimeoutMs: 90000, // 90 seconds - allows slower models (e.g., DeepSeek) time to respond
};

const STARTING_BALANCE = 5000;

// =============================================================================
// TYPE VALIDATORS
// =============================================================================

const cardValidator = v.object({
  suit: v.string(),
  rank: v.string(),
});

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

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get a game by ID with full state for spectating
 */
export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

/**
 * Internal query for getting game state
 */
export const getGameInternal = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

/**
 * Get active ranked games
 */
export const getActiveGames = query({
  args: { limit: v.optional(v.number()) },
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
 * Get recent completed games (excludes dev games)
 */
export const getRecentGames = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const games = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .order("desc")
      .take(limit * 2); // Fetch more to filter

    // Filter out dev games
    return games.filter((g) => !g.isDevGame).slice(0, limit);
  },
});

/**
 * Get count of completed ranked games (excludes dev games)
 */
export const getCompletedGameCount = query({
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();
    return games.filter((g) => !g.isDevGame).length;
  },
});

/**
 * Get recent dev games (for dev mode UI)
 */
export const getDevGames = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const games = await ctx.db
      .query("games")
      .withIndex("by_created")
      .order("desc")
      .take(limit * 3); // Fetch more to filter

    // Filter to dev games only
    return games.filter((g) => g.isDevGame).slice(0, limit);
  },
});

/**
 * Get all games (for admin) - includes active, completed, cancelled
 */
export const getAllGames = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("games")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});

// =============================================================================
// GAME CREATION
// =============================================================================

/**
 * Create a new ranked game
 * Deducts buy-ins and initializes game state
 */
export const create = mutation({
  args: {
    modelGatewayIds: v.array(v.string()),
    config: v.optional(
      v.object({
        buyIn: v.optional(v.number()),
        blinds: v.optional(v.object({ small: v.number(), big: v.number() })),
        maxHands: v.optional(v.number()),
        turnTimeoutMs: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const config = {
      buyIn: args.config?.buyIn ?? DEFAULT_CONFIG.buyIn,
      blinds: args.config?.blinds ?? DEFAULT_CONFIG.blinds,
      maxHands: args.config?.maxHands ?? DEFAULT_CONFIG.maxHands,
      turnTimeoutMs: args.config?.turnTimeoutMs ?? DEFAULT_CONFIG.turnTimeoutMs,
    };

    // Validate player count
    if (args.modelGatewayIds.length < 2) {
      throw new Error("Need at least 2 players");
    }
    if (args.modelGatewayIds.length > 8) {
      throw new Error("Maximum 8 players");
    }

    // Validate config values
    if (config.buyIn <= 0) {
      throw new Error("Buy-in must be positive");
    }
    if (config.blinds.small <= 0 || config.blinds.big <= 0) {
      throw new Error("Blinds must be positive");
    }
    if (config.blinds.big < config.blinds.small) {
      throw new Error("Big blind must be >= small blind");
    }
    if (config.maxHands <= 0) {
      throw new Error("Max hands must be positive");
    }
    if (config.turnTimeoutMs < 1000) {
      throw new Error("Turn timeout must be at least 1 second");
    }

    // Verify all models exist and get their info
    const models = await Promise.all(
      args.modelGatewayIds.map(async (gatewayId) => {
        const model = await ctx.db
          .query("models")
          .withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId))
          .first();
        if (!model) {
          throw new Error(`Model not found: ${gatewayId}`);
        }
        return model;
      }),
    );

    // Assign random characters to models (simple random selection)
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

    // Initialize player states
    const playerStates: PlayerState[] = models.map((model, index) => ({
      modelId: model.gatewayId,
      codename: model.name.split(" ").slice(-1)[0].toUpperCase(),
      characterId: shuffledChars[index % shuffledChars.length],
      chips: config.buyIn,
      hand: [],
      currentBet: 0,
      totalBetThisHand: 0,
      folded: false,
      isAllIn: false,
      hasActed: false,
      position: index,
    }));

    // Initialize in-game stats
    const inGameStats = models.map((model) => ({
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

    // Create initial game state
    const initialState = {
      phase: "preflop" as const,
      pot: 0,
      communityCards: [] as Card[],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      deck: [] as Card[],
      currentBet: 0,
      minRaise: config.blinds.big,
      lastRaiseAmount: config.blinds.big,
      lastAggressor: undefined,
      playerStates,
      inGameStats,
    };

    const now = Date.now();

    // Create the game
    const gameId = await ctx.db.insert("games", {
      status: "waiting",
      buyIn: config.buyIn,
      blinds: config.blinds,
      maxHands: config.maxHands,
      turnTimeoutMs: config.turnTimeoutMs,
      currentHand: 0,
      turnNumber: 0,
      playerModelIds: args.modelGatewayIds,
      state: initialState,
      handHistory: [],
      createdAt: now,
    });

    // Deduct buy-ins from each model
    for (const model of models) {
      const newBalance = model.balance - config.buyIn;
      await ctx.db.patch(model._id, {
        balance: newBalance,
        totalBuyIns: model.totalBuyIns + config.buyIn,
      });

      // Record transaction
      await ctx.db.insert("transactions", {
        modelId: model.gatewayId,
        gameId,
        type: "buy_in",
        amount: -config.buyIn,
        balanceAfter: newBalance,
        createdAt: now,
      });
    }

    return gameId;
  },
});

/**
 * Create a dev game (no stats tracking, uses cheap models)
 * Does NOT deduct buy-ins or record any transactions
 */
export const createDevGame = mutation({
  args: {
    modelGatewayIds: v.array(v.string()),
    config: v.optional(
      v.object({
        buyIn: v.optional(v.number()),
        blinds: v.optional(v.object({ small: v.number(), big: v.number() })),
        maxHands: v.optional(v.number()),
        turnTimeoutMs: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const config = {
      buyIn: args.config?.buyIn ?? DEFAULT_CONFIG.buyIn,
      blinds: args.config?.blinds ?? DEFAULT_CONFIG.blinds,
      maxHands: args.config?.maxHands ?? DEFAULT_CONFIG.maxHands,
      turnTimeoutMs: args.config?.turnTimeoutMs ?? DEFAULT_CONFIG.turnTimeoutMs,
    };

    if (args.modelGatewayIds.length < 2) {
      throw new Error("Need at least 2 players");
    }
    if (args.modelGatewayIds.length > 8) {
      throw new Error("Maximum 8 players");
    }

    // Assign random characters to models
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

    // Initialize player states (no model lookup needed for dev game)
    const playerStates: PlayerState[] = args.modelGatewayIds.map(
      (gatewayId, index) => ({
        modelId: gatewayId,
        codename: `NANO_${index + 1}`,
        characterId: shuffledChars[index % shuffledChars.length],
        chips: config.buyIn,
        hand: [],
        currentBet: 0,
        totalBetThisHand: 0,
        folded: false,
        isAllIn: false,
        hasActed: false,
        position: index,
      }),
    );

    // Initialize in-game stats
    const inGameStats = args.modelGatewayIds.map((gatewayId) => ({
      modelId: gatewayId,
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

    // Create initial game state
    const initialState = {
      phase: "preflop" as const,
      pot: 0,
      communityCards: [] as Card[],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      deck: [] as Card[],
      currentBet: 0,
      minRaise: config.blinds.big,
      lastRaiseAmount: config.blinds.big,
      lastAggressor: undefined,
      playerStates,
      inGameStats,
    };

    const now = Date.now();

    // Create the game (no buy-in deductions, no transactions)
    const gameId = await ctx.db.insert("games", {
      status: "waiting",
      buyIn: config.buyIn,
      blinds: config.blinds,
      maxHands: config.maxHands,
      turnTimeoutMs: config.turnTimeoutMs,
      isDevGame: true, // Mark as dev game
      currentHand: 0,
      turnNumber: 0,
      playerModelIds: args.modelGatewayIds,
      state: initialState,
      handHistory: [],
      createdAt: now,
    });

    return gameId;
  },
});

/**
 * Start the game and deal first hand
 */
export const startGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game already started");

    await ctx.db.patch(args.gameId, {
      status: "active",
    });

    // Start the first hand
    await ctx.scheduler.runAfter(0, startNewHandRef, {
      gameId: args.gameId,
    });
  },
});

// =============================================================================
// HAND MANAGEMENT (Internal mutations)
// =============================================================================

/**
 * Start a new hand - shuffle, deal, post blinds
 */
export const startNewHand = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") return;

    const state = game.state;
    const numPlayers = state.playerStates.length;

    // Check if game should end
    const playersWithChips = state.playerStates.filter((p) => p.chips > 0);
    if (playersWithChips.length <= 1 || game.currentHand >= game.maxHands) {
      await ctx.scheduler.runAfter(0, settleGameRef, {
        gameId: args.gameId,
      });
      return;
    }

    // Cast player states to the correct type for helper functions
    const playerStates = state.playerStates as unknown as PlayerState[];

    // Rotate dealer (with infinite loop guard)
    let newDealerIndex = (state.dealerIndex + 1) % numPlayers;
    let dealerIterations = 0;
    while (playerStates[newDealerIndex].chips <= 0) {
      newDealerIndex = (newDealerIndex + 1) % numPlayers;
      dealerIterations++;
      if (dealerIterations >= numPlayers) {
        // All players busted - should not happen due to earlier check
        console.error("[GAME] No players with chips for dealer position");
        await ctx.scheduler.runAfter(0, settleGameRef, { gameId: args.gameId });
        return;
      }
    }

    // Calculate blind positions (use getNextPlayerForBlinds to ignore stale folded state)
    const sbIndex = getNextPlayerForBlinds(
      newDealerIndex,
      playerStates,
      numPlayers,
    );
    const bbIndex = getNextPlayerForBlinds(sbIndex, playerStates, numPlayers);

    // Create and shuffle deck
    const deck = shuffleDeck(createDeck());

    // Deal hole cards
    const newPlayerStates = state.playerStates.map((p, idx) => {
      if (p.chips <= 0) {
        return {
          ...p,
          hand: [],
          currentBet: 0,
          totalBetThisHand: 0,
          folded: true,
          isAllIn: false,
          hasActed: true,
        };
      }

      const { dealt, remaining: _ } = dealCards(deck, 2);
      deck.splice(0, 2); // Remove dealt cards

      return {
        ...p,
        hand: dealt,
        currentBet: 0,
        totalBetThisHand: 0,
        folded: false,
        isAllIn: false,
        hasActed: false,
      };
    });

    // Post blinds
    // Note: actualSmallBlind/actualBigBlind are what's actually posted (may be less if all-in)
    // game.blinds.big is used for minRaise calculations to maintain proper betting structure
    const actualSmallBlind = Math.min(
      game.blinds.small,
      newPlayerStates[sbIndex].chips,
    );
    const actualBigBlind = Math.min(game.blinds.big, newPlayerStates[bbIndex].chips);

    newPlayerStates[sbIndex].currentBet = actualSmallBlind;
    newPlayerStates[sbIndex].totalBetThisHand = actualSmallBlind;
    newPlayerStates[sbIndex].chips -= actualSmallBlind;
    if (newPlayerStates[sbIndex].chips === 0) {
      newPlayerStates[sbIndex].isAllIn = true;
    }

    newPlayerStates[bbIndex].currentBet = actualBigBlind;
    newPlayerStates[bbIndex].totalBetThisHand = actualBigBlind;
    newPlayerStates[bbIndex].chips -= actualBigBlind;
    if (newPlayerStates[bbIndex].chips === 0) {
      newPlayerStates[bbIndex].isAllIn = true;
    }

    // Find first player to act (UTG, or SB in heads-up)
    let firstToAct: number;
    if (playersWithChips.length === 2) {
      // Heads-up: dealer/SB acts first preflop
      firstToAct = sbIndex;
    } else {
      // Normal: UTG (left of BB)
      firstToAct = getNextPlayerWithChips(bbIndex, newPlayerStates, numPlayers);
    }

    // Update in-game stats
    const newInGameStats = state.inGameStats.map((stat) => {
      const playerState = newPlayerStates.find(
        (p) => p.modelId === stat.modelId,
      );
      if (!playerState || playerState.folded) return stat;
      return {
        ...stat,
        stats: {
          ...stat.stats,
          handsDealt: stat.stats.handsDealt + 1,
        },
      };
    });

    // Build action log entries for hand start (append to existing log)
    const now = Date.now();
    const sbPlayer = newPlayerStates[sbIndex];
    const bbPlayer = newPlayerStates[bbIndex];
    const newHandNumber = game.currentHand + 1;
    const newLogEntries = [
      {
        type: "system" as const,
        playerId: "system",
        playerName: "System",
        phase: "preflop",
        timestamp: now,
        content: `━━━ Hand ${newHandNumber} ━━━`,
        handNumber: newHandNumber,
      },
      {
        type: "action" as const,
        playerId: sbPlayer.modelId,
        playerName: sbPlayer.codename,
        action: "post_sb",
        amount: actualSmallBlind,
        phase: "preflop",
        timestamp: now + 1,
        handNumber: newHandNumber,
        position: "SB",
      },
      {
        type: "action" as const,
        playerId: bbPlayer.modelId,
        playerName: bbPlayer.codename,
        action: "post_bb",
        amount: actualBigBlind,
        phase: "preflop",
        timestamp: now + 2,
        handNumber: newHandNumber,
        position: "BB",
      },
    ];

    // Append to existing log, keep last 50 entries
    const existingLog = state.actionLog || [];
    const updatedActionLog = [...existingLog, ...newLogEntries].slice(-200);

    await ctx.db.patch(args.gameId, {
      currentHand: game.currentHand + 1,
      turnNumber: game.turnNumber + 1,
      state: {
        ...state,
        phase: "preflop",
        pot: actualSmallBlind + actualBigBlind,
        communityCards: [],
        currentPlayerIndex: firstToAct,
        dealerIndex: newDealerIndex,
        deck,
        // currentBet is the actual amount posted (may be less if all-in)
        currentBet: actualBigBlind,
        // minRaise and lastRaiseAmount use FULL big blind to maintain proper betting structure
        // even if BB posted all-in for less
        minRaise: game.blinds.big * 2,
        lastRaiseAmount: game.blinds.big,
        lastAggressor: undefined,
        playerStates: newPlayerStates,
        inGameStats: newInGameStats,
        actionLog: updatedActionLog,
      },
    });

    // Schedule AI turn
    await ctx.scheduler.runAfter(0, scheduleAITurnRef, {
      gameId: args.gameId,
      expectedTurn: game.turnNumber + 1,
    });
  },
});

/**
 * Schedule an AI turn with timeout
 */
export const scheduleAITurn = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedTurn: v.number(),
  },
  handler: async (ctx, args) => {
    console.log(
      `[GAME] scheduleAITurn called: expectedTurn=${args.expectedTurn}`,
    );

    const game = await ctx.db.get(args.gameId);
    if (!game) {
      console.log("[GAME] scheduleAITurn: game not found");
      return;
    }
    if (game.status !== "active") {
      console.log(
        `[GAME] scheduleAITurn: game not active (status=${game.status})`,
      );
      return;
    }
    if (game.turnNumber !== args.expectedTurn) {
      console.log(
        `[GAME] scheduleAITurn: turn mismatch (game=${game.turnNumber}, expected=${args.expectedTurn})`,
      );
      return;
    }

    console.log(
      `[GAME] Scheduling turn for player ${game.state.currentPlayerIndex}`,
    );

    const state = game.state;
    const currentPlayer = state.playerStates[state.currentPlayerIndex];

    // Set thinking player for UI
    await ctx.db.patch(args.gameId, {
      state: {
        ...state,
        thinkingPlayerId: currentPlayer.modelId,
      },
    });

    // Schedule timeout
    await ctx.scheduler.runAfter(game.turnTimeoutMs, handleTimeoutRef, {
      gameId: args.gameId,
      expectedTurn: args.expectedTurn,
    });

    // The actual AI call will be handled by a Convex action
    await ctx.scheduler.runAfter(0, processAITurnRef, {
      gameId: args.gameId,
      expectedTurn: args.expectedTurn,
    });
  },
});

/**
 * Process an AI turn - calls AI action to get decision
 */
export const processAITurn = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedTurn: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    if (game.status !== "active") return;
    if (game.turnNumber !== args.expectedTurn) return;

    const state = game.state;
    const currentPlayer = state.playerStates[state.currentPlayerIndex];

    if (currentPlayer.folded || currentPlayer.isAllIn) {
      // Skip to next player
      await advanceToNextPlayer(ctx, args.gameId, game);
      return;
    }

    // Get valid actions for the current player
    const validActions = getValidActions(
      currentPlayer as unknown as PlayerState,
      state.currentBet,
      state.minRaise,
    );

    // Generate the AI prompt
    const prompt = generatePrompt(
      {
        currentHand: game.currentHand,
        maxHands: game.maxHands,
        phase: state.phase,
        pot: state.pot,
        currentBet: state.currentBet,
        minRaise: state.minRaise,
        communityCards: state.communityCards as Card[],
        playerStates: state.playerStates as unknown as PlayerState[],
        dealerIndex: state.dealerIndex,
        currentPlayerIndex: state.currentPlayerIndex,
        blinds: game.blinds,
        inGameStats: state.inGameStats,
      },
      currentPlayer as unknown as PlayerState,
      validActions,
    );

    // Schedule the AI action to get a decision
    await ctx.scheduler.runAfter(0, getAIDecisionRef, {
      gameId: args.gameId,
      modelGatewayId: currentPlayer.modelId,
      prompt,
      validActions: {
        canCheck: validActions.canCheck,
        canCall: validActions.canCall,
        canRaise: validActions.canRaise,
        callAmount: validActions.callAmount,
        minRaiseTotal: validActions.minRaiseTotal,
        maxRaiseTotal: validActions.maxRaiseTotal,
      },
      expectedTurn: args.expectedTurn,
    });
  },
});

/**
 * Handle turn timeout - auto check/fold
 */
export const handleTimeout = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedTurn: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    if (game.status !== "active") return;
    if (game.turnNumber !== args.expectedTurn) return;

    const state = game.state;
    const currentPlayer = state.playerStates[state.currentPlayerIndex];

    // Auto check if possible, otherwise fold
    const canCheck = currentPlayer.currentBet >= state.currentBet;
    const action = canCheck ? { type: "check" } : { type: "fold" };

    // Update timeout stats - track timeouts and the resulting action
    const newInGameStats = state.inGameStats.map((stat) => {
      if (stat.modelId !== currentPlayer.modelId) return stat;
      const newStats = { ...stat.stats };

      // Track timeout
      newStats.timeouts = (newStats.timeouts || 0) + 1;

      // Track the action that resulted from timeout
      if (action.type === "fold") {
        newStats.totalFolds++;
        if (state.phase === "preflop") {
          newStats.preflopFolds++;
        }
      } else if (action.type === "check") {
        newStats.totalChecks++;
      }

      return {
        ...stat,
        stats: newStats,
      };
    });

    // Add timeout action to action log
    const timeoutActionLogEntry = {
      type: "action" as const,
      playerId: currentPlayer.modelId,
      playerName: currentPlayer.codename,
      action: action.type,
      phase: state.phase,
      timestamp: Date.now(),
      reasoning: "Timed out",
      handNumber: game.currentHand,
      position: getPositionName(
        state.currentPlayerIndex,
        state.dealerIndex,
        state.playerStates.length,
      ),
    };
    const existingLog = state.actionLog || [];
    const newActionLog = [...existingLog, timeoutActionLogEntry].slice(-200);

    await ctx.db.patch(args.gameId, {
      state: {
        ...state,
        inGameStats: newInGameStats,
        actionLog: newActionLog,
      },
    });

    await applyAction(ctx, args.gameId, game, action);
  },
});

// =============================================================================
// ACTION PROCESSING
// =============================================================================

/**
 * Apply a player action to the game state
 */
async function applyAction(
  ctx: any,
  gameId: any,
  game: any,
  action: { type: string; amount?: number },
) {
  const state = game.state;
  const playerIndex = state.currentPlayerIndex;
  const player = state.playerStates[playerIndex];
  const newPlayerStates = [...state.playerStates];
  const currentPlayer = { ...newPlayerStates[playerIndex] };

  let newPot = state.pot;
  let newCurrentBet = state.currentBet;
  let newMinRaise = state.minRaise;
  let newLastRaiseAmount = state.lastRaiseAmount;
  let newLastAggressor = state.lastAggressor;

  switch (action.type) {
    case "fold":
      currentPlayer.folded = true;
      break;

    case "check":
      // No change to bets
      break;

    case "call": {
      const callAmount = Math.min(
        state.currentBet - currentPlayer.currentBet,
        currentPlayer.chips,
      );
      currentPlayer.chips -= callAmount;
      currentPlayer.currentBet += callAmount;
      currentPlayer.totalBetThisHand += callAmount;
      newPot += callAmount;
      if (currentPlayer.chips === 0) {
        currentPlayer.isAllIn = true;
      }
      break;
    }

    case "raise": {
      const raiseTotal = action.amount ?? state.minRaise;
      const raiseAmount = raiseTotal - currentPlayer.currentBet;
      const actualRaise = Math.min(raiseAmount, currentPlayer.chips);

      currentPlayer.chips -= actualRaise;
      const previousBet = currentPlayer.currentBet;
      currentPlayer.currentBet += actualRaise;
      currentPlayer.totalBetThisHand += actualRaise;
      newPot += actualRaise;

      if (currentPlayer.currentBet > newCurrentBet) {
        const raiseIncrement = currentPlayer.currentBet - newCurrentBet;
        const isFullRaise = raiseIncrement >= newLastRaiseAmount;

        newLastRaiseAmount = raiseIncrement;
        newCurrentBet = currentPlayer.currentBet;
        newMinRaise = newCurrentBet + Math.max(raiseIncrement, newLastRaiseAmount);
        newLastAggressor = playerIndex;

        // Only reset hasActed if this is a FULL raise (reopens betting)
        // A partial all-in that exceeds current bet but isn't a full raise
        // does NOT reopen betting for other players
        if (isFullRaise) {
          for (let i = 0; i < newPlayerStates.length; i++) {
            if (
              i !== playerIndex &&
              !newPlayerStates[i].folded &&
              !newPlayerStates[i].isAllIn
            ) {
              newPlayerStates[i] = { ...newPlayerStates[i], hasActed: false };
            }
          }
        }
      }

      if (currentPlayer.chips === 0) {
        currentPlayer.isAllIn = true;
      }
      break;
    }
  }

  currentPlayer.hasActed = true;
  newPlayerStates[playerIndex] = currentPlayer;

  // Update game state
  await ctx.db.patch(gameId, {
    turnNumber: game.turnNumber + 1,
    state: {
      ...state,
      pot: newPot,
      currentBet: newCurrentBet,
      minRaise: newMinRaise,
      lastRaiseAmount: newLastRaiseAmount,
      lastAggressor: newLastAggressor,
      playerStates: newPlayerStates,
    },
  });

  // Advance game
  const updatedGame = await ctx.db.get(gameId);
  await advanceToNextPlayer(ctx, gameId, updatedGame);
}

/**
 * Advance to the next player or phase
 */
async function advanceToNextPlayer(ctx: any, gameId: any, game: any) {
  const state = game.state;
  const activePlayers = countActivePlayers(state.playerStates);
  const playersInHand = countPlayersInHand(state.playerStates);

  // Check if only one player remains (everyone else folded)
  if (playersInHand <= 1) {
    await handleAllFolded(ctx, gameId, game);
    return;
  }

  // Check if betting round is complete
  if (isBettingRoundComplete(state.playerStates, state.currentBet)) {
    await advanceToNextPhase(ctx, gameId, game);
    return;
  }

  // Find next active player
  const nextPlayerIndex = getNextActivePlayer(
    state.currentPlayerIndex,
    state.playerStates,
  );

  if (nextPlayerIndex === -1) {
    // No active players (everyone is all-in or folded)
    await advanceToNextPhase(ctx, gameId, game);
    return;
  }

  // Update current player and schedule next turn
  await ctx.db.patch(gameId, {
    state: {
      ...state,
      currentPlayerIndex: nextPlayerIndex,
    },
  });

  // game.turnNumber is already the current turn (was incremented in applyAction)
  await ctx.scheduler.runAfter(0, scheduleAITurnRef, {
    gameId,
    expectedTurn: game.turnNumber,
  });
}

/**
 * Advance to the next betting phase
 */
async function advanceToNextPhase(ctx: any, gameId: any, game: any) {
  const state = game.state;
  const phases = ["preflop", "flop", "turn", "river", "showdown"];
  const currentPhaseIndex = phases.indexOf(state.phase);

  if (currentPhaseIndex >= 3) {
    // River complete, go to showdown
    await handleShowdown(ctx, gameId, game);
    return;
  }

  // Check if betting is even possible (need at least 2 active players who can bet)
  const activePlayersCount = countActivePlayers(state.playerStates);

  // If 0 or 1 active players, no more betting is possible - run out the board
  if (activePlayersCount <= 1) {
    console.log(
      `[GAME] Only ${activePlayersCount} active player(s), skipping to showdown`,
    );
    await handleShowdown(ctx, gameId, game);
    return;
  }

  // Deal community cards
  const deck = [...state.deck];
  let newCommunityCards = [...state.communityCards];

  if (currentPhaseIndex === 0) {
    // Flop: deal 3 cards (burn 1)
    deck.shift(); // Burn
    newCommunityCards = [...newCommunityCards, ...deck.splice(0, 3)];
  } else {
    // Turn/River: deal 1 card (burn 1)
    deck.shift(); // Burn
    newCommunityCards.push(deck.shift()!);
  }

  // Reset betting for new round
  const newPlayerStates = state.playerStates.map((p: PlayerState) => ({
    ...p,
    currentBet: 0,
    hasActed: p.folded || p.isAllIn,
  }));

  // Double-check after reset: if only 0 or 1 can act, go to showdown
  const newActiveCount = countActivePlayers(newPlayerStates);
  if (newActiveCount <= 1) {
    console.log(
      `[GAME] After reset, only ${newActiveCount} active player(s), skipping to showdown`,
    );
    // Update state with dealt cards before going to showdown
    await ctx.db.patch(gameId, {
      state: {
        ...state,
        deck,
        communityCards: newCommunityCards,
        playerStates: newPlayerStates,
      },
    });
    const updatedGame = await ctx.db.get(gameId);
    await handleShowdown(ctx, gameId, updatedGame);
    return;
  }

  // Find first active player after dealer
  const firstToAct = getNextPlayerWithChips(
    state.dealerIndex,
    newPlayerStates,
    newPlayerStates.length,
  );

  const newPhase = phases[currentPhaseIndex + 1];
  const phaseNames: Record<string, string> = {
    flop: "FLOP",
    turn: "TURN",
    river: "RIVER",
  };

  // Add phase change to action log
  const phaseLogEntry = {
    type: "phase" as const,
    playerId: "system",
    playerName: "System",
    phase: newPhase,
    timestamp: Date.now(),
    content: `Dealing ${phaseNames[newPhase] || newPhase.toUpperCase()}`,
    handNumber: game.currentHand,
  };
  const existingLog = state.actionLog || [];
  const newActionLog = [...existingLog, phaseLogEntry].slice(-200);

  await ctx.db.patch(gameId, {
    turnNumber: game.turnNumber + 1,
    state: {
      ...state,
      phase: newPhase,
      deck,
      communityCards: newCommunityCards,
      currentBet: 0,
      minRaise: game.blinds.big,
      lastRaiseAmount: game.blinds.big,
      lastAggressor: undefined,
      currentPlayerIndex: firstToAct,
      playerStates: newPlayerStates,
      actionLog: newActionLog,
    },
  });

  // Schedule next turn
  // turnNumber was just incremented in the patch above
  await ctx.scheduler.runAfter(0, scheduleAITurnRef, {
    gameId,
    expectedTurn: game.turnNumber + 1,
  });
}

/**
 * Handle showdown - evaluate hands and award pots
 * If cards need to be dealt (all-in showdown), use incremental reveal
 */
async function handleShowdown(ctx: any, gameId: any, game: any) {
  const state = game.state;

  // Check if we need incremental card reveal (all-in situation with cards to deal)
  if (state.communityCards.length < 5) {
    // Determine starting phase based on current community cards
    let targetPhase: string;
    if (state.communityCards.length === 0) {
      targetPhase = "flop";
    } else if (state.communityCards.length === 3) {
      targetPhase = "turn";
    } else if (state.communityCards.length === 4) {
      targetPhase = "river";
    } else {
      // Shouldn't happen, but handle gracefully
      targetPhase = "evaluate";
    }

    // Schedule the first street deal with 2 second delay for drama
    await ctx.scheduler.runAfter(2000, dealNextStreetRef, {
      gameId,
      targetPhase,
    });
    return;
  }

  // All cards already dealt - proceed directly to evaluation
  await evaluateShowdownAndAwardPots(ctx, gameId, game);
}

/**
 * Evaluate hands and award pots (extracted for reuse after incremental reveal)
 */
async function evaluateShowdownAndAwardPots(ctx: any, gameId: any, game: any) {
  const state = game.state;
  const communityCards = state.communityCards;

  // Evaluate hands for non-folded players
  const playerHands = new Map<string, EvaluatedHand>();
  for (const player of state.playerStates) {
    if (!player.folded && player.hand.length === 2) {
      try {
        const hand = evaluateHand(player.hand, communityCards);
        playerHands.set(player.modelId, hand);
      } catch (e) {
        // Critical: Hand evaluation failed - log error and assign worst possible hand
        // This ensures the player is still eligible for the pot but will lose to any valid hand
        console.error(
          `[GAME] CRITICAL: Failed to evaluate hand for ${player.modelId}:`,
          e,
          `Hand: ${JSON.stringify(player.hand)}, Community: ${JSON.stringify(communityCards)}`,
        );
        // Create worst possible hand (high card with lowest score)
        playerHands.set(player.modelId, {
          rank: HandRank.HIGH_CARD,
          rankName: "High Card",
          score: 0,
          cards: [],
          description: "Evaluation Error - High Card",
        });
      }
    }
  }

  // Calculate and distribute pots
  // Pass player order and dealer index for proper remainder distribution
  const pots = calculatePots(state.playerStates);
  const playerOrder = state.playerStates.map((p: PlayerState) => p.modelId);
  const winnings = distributePots(pots, playerHands, playerOrder, state.dealerIndex);

  // Update player chips
  const newPlayerStates = state.playerStates.map((p: PlayerState) => {
    const won = winnings.get(p.modelId) || 0;
    return {
      ...p,
      chips: p.chips + won,
    };
  });

  // Record hand in history
  const winnerIds = Array.from(winnings.keys()).filter(
    (id) => (winnings.get(id) || 0) > 0,
  );
  const handRecord = {
    handNumber: game.currentHand,
    pot: state.pot,
    communityCards,
    winnerModelIds: winnerIds,
    winCondition: "showdown",
    actions: [], // TODO: track actions throughout hand
  };

  const handHistory = [...(game.handHistory || []), handRecord];

  // Add win system messages to action log
  const existingLog = state.actionLog || [];
  const winLogEntries = winnerIds.map((winnerId) => {
    const hand = playerHands.get(winnerId);
    const amount = winnings.get(winnerId) || 0;
    const winnerPlayer = state.playerStates.find((p: PlayerState) => p.modelId === winnerId);
    const winnerName = winnerPlayer?.codename || winnerId;
    return {
      type: "system" as const,
      playerId: winnerId,
      playerName: winnerName,
      content: `${winnerName} wins $${amount}${hand ? ` with ${hand.rankName}` : ""}`,
      timestamp: Date.now(),
      handNumber: game.currentHand,
    };
  });
  const updatedActionLog = [...existingLog, ...winLogEntries].slice(-200);

  await ctx.db.patch(gameId, {
    state: {
      ...state,
      phase: "showdown",
      playerStates: newPlayerStates,
      actionLog: updatedActionLog,
    },
    handHistory,
  });

  // Start next hand after delay (5 seconds to match frontend countdown)
  await ctx.scheduler.runAfter(5000, startNewHandRef, {
    gameId,
  });
}

/**
 * Handle when all players fold to one winner
 */
async function handleAllFolded(ctx: any, gameId: any, game: any) {
  const state = game.state;

  // Find the winner (only non-folded player)
  const winner = state.playerStates.find((p: PlayerState) => !p.folded);
  if (!winner) return;

  // Award pot to winner
  const newPlayerStates = state.playerStates.map((p: PlayerState) => {
    if (p.modelId === winner.modelId) {
      return { ...p, chips: p.chips + state.pot };
    }
    return p;
  });

  // Record hand
  const handRecord = {
    handNumber: game.currentHand,
    pot: state.pot,
    communityCards: state.communityCards,
    winnerModelIds: [winner.modelId],
    winCondition: "all_folded",
    actions: [],
  };

  const handHistory = [...(game.handHistory || []), handRecord];

  // Add win system message to action log
  const existingLog = state.actionLog || [];
  const winnerName = winner.codename || winner.modelId;
  const winLogEntry = {
    type: "system" as const,
    playerId: winner.modelId,
    playerName: winnerName,
    content: `${winnerName} wins $${state.pot} (all others folded)`,
    timestamp: Date.now(),
    handNumber: game.currentHand,
  };
  const updatedActionLog = [...existingLog, winLogEntry].slice(-200);

  await ctx.db.patch(gameId, {
    state: {
      ...state,
      pot: 0,
      playerStates: newPlayerStates,
      actionLog: updatedActionLog,
    },
    handHistory,
  });

  // Start next hand (5 seconds to match frontend countdown)
  await ctx.scheduler.runAfter(5000, startNewHandRef, {
    gameId,
  });
}

// =============================================================================
// INCREMENTAL CARD REVEAL (All-in Showdown)
// =============================================================================

/**
 * Deal next street during all-in showdown with incremental reveal
 * Called with 2s delays between each street for dramatic effect
 */
export const dealNextStreet = internalMutation({
  args: {
    gameId: v.id("games"),
    targetPhase: v.string(), // "flop" | "turn" | "river" | "evaluate"
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    if (game.status !== "active") return;

    const state = game.state;
    const deck = [...state.deck];
    let newCommunityCards = [...state.communityCards];
    let newPhase = state.phase;

    // Phase display names for action log
    const phaseNames: Record<string, string> = {
      flop: "FLOP",
      turn: "TURN",
      river: "RIVER",
    };

    // Deal cards based on target phase
    if (args.targetPhase === "flop") {
      // Deal flop (burn 1, deal 3)
      deck.shift(); // Burn
      newCommunityCards = [...newCommunityCards, ...deck.splice(0, 3)];
      newPhase = "flop";
    } else if (args.targetPhase === "turn") {
      // Deal turn (burn 1, deal 1)
      deck.shift(); // Burn
      newCommunityCards.push(deck.shift()!);
      newPhase = "turn";
    } else if (args.targetPhase === "river") {
      // Deal river (burn 1, deal 1)
      deck.shift(); // Burn
      newCommunityCards.push(deck.shift()!);
      newPhase = "river";
    } else if (args.targetPhase === "evaluate") {
      // All cards dealt, proceed to evaluation
      const updatedGame = await ctx.db.get(args.gameId);
      if (updatedGame) {
        await evaluateShowdownAndAwardPots(ctx, args.gameId, updatedGame);
      }
      return;
    }

    // Add phase change to action log
    const existingLog = state.actionLog || [];
    const phaseLogEntry = {
      type: "phase" as const,
      playerId: "system",
      playerName: "System",
      phase: newPhase,
      timestamp: Date.now(),
      content: `Dealing ${phaseNames[newPhase] || newPhase.toUpperCase()}`,
      handNumber: game.currentHand,
    };
    const newActionLog = [...existingLog, phaseLogEntry].slice(-200);

    // Update game state with new cards
    await ctx.db.patch(args.gameId, {
      state: {
        ...state,
        phase: newPhase,
        deck,
        communityCards: newCommunityCards,
        actionLog: newActionLog,
      },
    });

    // Determine next phase and schedule with 2s delay
    let nextTargetPhase: string;
    if (newCommunityCards.length === 3) {
      // Just dealt flop, next is turn
      nextTargetPhase = "turn";
    } else if (newCommunityCards.length === 4) {
      // Just dealt turn, next is river
      nextTargetPhase = "river";
    } else if (newCommunityCards.length >= 5) {
      // Just dealt river, next is evaluate
      nextTargetPhase = "evaluate";
    } else {
      // Shouldn't happen
      nextTargetPhase = "evaluate";
    }

    // Schedule next street deal or evaluation after 2 seconds
    await ctx.scheduler.runAfter(2000, dealNextStreetRef, {
      gameId: args.gameId,
      targetPhase: nextTargetPhase,
    });
  },
});

// =============================================================================
// GAME SETTLEMENT
// =============================================================================

/**
 * Settle the game - credit balances and record stats
 * Dev games don't update model balances or record transactions
 */
export const settleGame = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    if (game.status !== "active") return;

    const state = game.state;
    const now = Date.now();

    // Calculate results
    const results = state.playerStates.map((p) => ({
      modelId: p.modelId,
      buyIn: game.buyIn,
      finalChips: p.chips,
      profit: p.chips - game.buyIn,
    }));

    // Find winner (highest chips)
    const sortedResults = [...results].sort(
      (a, b) => b.finalChips - a.finalChips,
    );
    const winnerProfit = sortedResults[0].profit;

    if (!game.isDevGame) {
      // Ranked game - update main models table and transactions
      for (const result of results) {
        const model = await ctx.db
          .query("models")
          .withIndex("by_gatewayId", (q) => q.eq("gatewayId", result.modelId))
          .first();

        // Find this player's in-game stats
        const playerInGameStats = state.inGameStats.find(
          (s) => s.modelId === result.modelId,
        )?.stats;

        if (model) {
          const newBalance = model.balance + result.finalChips;
          await ctx.db.patch(model._id, {
            balance: newBalance,
            totalCashouts: model.totalCashouts + result.finalChips,
            gamesPlayed: model.gamesPlayed + 1,
            gamesWon: model.gamesWon + (result.profit === winnerProfit ? 1 : 0),
            biggestWin: Math.max(
              model.biggestWin,
              result.profit > 0 ? result.profit : 0,
            ),
            biggestLoss: Math.min(
              model.biggestLoss,
              result.profit < 0 ? result.profit : 0,
            ),
            // Persist hand stats from in-game tracking
            handsPlayed:
              model.handsPlayed + (playerInGameStats?.handsDealt ?? 0),
            handsWon: model.handsWon + (playerInGameStats?.showdownsWon ?? 0),
            showdownsPlayed:
              model.showdownsPlayed +
              (playerInGameStats?.showdownsReached ?? 0),
            showdownsWon:
              model.showdownsWon + (playerInGameStats?.showdownsWon ?? 0),
            vpipHands: model.vpipHands + (playerInGameStats?.handsPlayed ?? 0),
            pfrHands: model.pfrHands + (playerInGameStats?.preflopRaises ?? 0),
            totalBets: model.totalBets + (playerInGameStats?.totalBets ?? 0),
            totalRaises:
              model.totalRaises + (playerInGameStats?.totalRaises ?? 0),
            totalCalls: model.totalCalls + (playerInGameStats?.totalCalls ?? 0),
            totalFolds: model.totalFolds + (playerInGameStats?.totalFolds ?? 0),
            foldsToRaise:
              model.foldsToRaise + (playerInGameStats?.foldedToRaise ?? 0),
            raisesFaced:
              model.raisesFaced + (playerInGameStats?.raisesFaced ?? 0),
          });

          // Record transaction
          await ctx.db.insert("transactions", {
            modelId: result.modelId,
            gameId: args.gameId,
            type: "cash_out",
            amount: result.finalChips,
            balanceAfter: newBalance,
            createdAt: now,
          });

          // Record profit history for balance chart
          await ctx.db.insert("profitHistory", {
            modelId: result.modelId,
            gameId: args.gameId,
            handNumber: game.currentHand,
            profit: result.profit,
            balance: newBalance,
            timestamp: now,
          });
        }
      }
    } else {
      // Dev game - update devStats table (separate from leaderboard)
      for (const result of results) {
        const devStat = await ctx.db
          .query("devStats")
          .withIndex("by_gatewayId", (q) => q.eq("gatewayId", result.modelId))
          .first();

        const isWinner = result.profit === winnerProfit;

        if (devStat) {
          await ctx.db.patch(devStat._id, {
            gamesPlayed: devStat.gamesPlayed + 1,
            gamesWon: devStat.gamesWon + (isWinner ? 1 : 0),
            totalProfit: devStat.totalProfit + result.profit,
            biggestWin: Math.max(
              devStat.biggestWin,
              result.profit > 0 ? result.profit : 0,
            ),
            biggestLoss: Math.min(
              devStat.biggestLoss,
              result.profit < 0 ? result.profit : 0,
            ),
            updatedAt: now,
          });
        } else {
          // Create new devStats entry if it doesn't exist
          await ctx.db.insert("devStats", {
            gatewayId: result.modelId,
            gamesPlayed: 1,
            gamesWon: isWinner ? 1 : 0,
            handsPlayed: 0,
            handsWon: 0,
            totalProfit: result.profit,
            biggestWin: result.profit > 0 ? result.profit : 0,
            biggestLoss: result.profit < 0 ? result.profit : 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalResponseTimeMs: 0,
            totalCost: 0,
            totalBets: 0,
            totalRaises: 0,
            totalCalls: 0,
            totalFolds: 0,
            totalChecks: 0,
            updatedAt: now,
          });
        }
      }
    }

    // Mark game as completed with duration
    await ctx.db.patch(args.gameId, {
      status: "completed",
      results,
      completedAt: now,
      durationMs: now - game.createdAt,
    });

    // Sync credits from AI Gateway after game completes
    await ctx.scheduler.runAfter(0, syncCreditsInternalRef, {});

    // Save rank snapshot after ranked game completes (for leaderboard tracking)
    if (!game.isDevGame) {
      await ctx.scheduler.runAfter(0, saveRankSnapshotRef, {});
    }
  },
});

/**
 * Cancel a game and refund buy-ins
 */
export const cancelGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status === "completed" || game.status === "cancelled") {
      throw new Error("Game already ended");
    }

    const now = Date.now();

    // Refund buy-ins
    for (const modelId of game.playerModelIds) {
      const model = await ctx.db
        .query("models")
        .withIndex("by_gatewayId", (q) => q.eq("gatewayId", modelId))
        .first();

      if (model) {
        const newBalance = model.balance + game.buyIn;
        await ctx.db.patch(model._id, {
          balance: newBalance,
        });

        await ctx.db.insert("transactions", {
          modelId,
          gameId: args.gameId,
          type: "adjustment",
          amount: game.buyIn,
          balanceAfter: newBalance,
          createdAt: now,
        });
      }
    }

    await ctx.db.patch(args.gameId, {
      status: "cancelled",
      completedAt: now,
    });
  },
});

// =============================================================================
// AI DECISION APPLICATION
// =============================================================================

/**
 * Apply an AI decision to the game state
 */
export const applyAIDecision = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedTurn: v.number(),
    action: v.string(),
    amount: v.optional(v.number()),
    reasoning: v.string(),
    responseTimeMs: v.number(),
    tokensUsed: v.object({
      input: v.number(),
      output: v.number(),
    }),
    cost: v.optional(v.number()), // Actual USD cost from AI Gateway
  },
  handler: async (ctx, args) => {
    console.log(
      `[GAME] applyAIDecision called: action=${args.action}, expectedTurn=${args.expectedTurn}`,
    );

    const game = await ctx.db.get(args.gameId);
    if (!game) {
      console.log("[GAME] applyAIDecision: game not found");
      return;
    }
    if (game.status !== "active") {
      console.log(
        `[GAME] applyAIDecision: game not active (status=${game.status})`,
      );
      return;
    }
    if (game.turnNumber !== args.expectedTurn) {
      console.log(
        `[GAME] applyAIDecision: turn mismatch (game=${game.turnNumber}, expected=${args.expectedTurn})`,
      );
      return;
    }

    console.log(
      `[GAME] Applying ${args.action} for player at index ${game.state.currentPlayerIndex}`,
    );

    const state = game.state;
    const playerIndex = state.currentPlayerIndex;
    const player = state.playerStates[playerIndex];
    const newPlayerStates = [...state.playerStates];
    const currentPlayer = { ...newPlayerStates[playerIndex] };

    let newPot = state.pot;
    let newCurrentBet = state.currentBet;
    let newMinRaise = state.minRaise;
    let newLastRaiseAmount = state.lastRaiseAmount;
    let newLastAggressor = state.lastAggressor;

    // Validate action type at runtime (args.action comes from AI response)
    const validActions = ["fold", "check", "call", "raise"] as const;
    if (!validActions.includes(args.action as typeof validActions[number])) {
      console.error(`[GAME] Invalid action type: ${args.action}, defaulting to fold`);
      args = { ...args, action: "fold" };
    }

    // Apply the action - track actual amount for action log
    let actualActionAmount: number | undefined = args.amount;
    let actualAction: "fold" | "check" | "call" | "raise" = args.action as
      | "fold"
      | "check"
      | "call"
      | "raise";

    // Validate CHECK is legal (player's bet must match current bet)
    if (args.action === "check" && currentPlayer.currentBet !== state.currentBet) {
      // Invalid check - convert to call (partial call/all-in allowed) or fold
      const amountToCall = state.currentBet - currentPlayer.currentBet;
      if (amountToCall > 0 && currentPlayer.chips > 0) {
        // Player has chips - they can call (even if partial/all-in for less)
        actualAction = "call";
        console.log(`[GAME] Invalid check converted to call (player bet: ${currentPlayer.currentBet}, current bet: ${state.currentBet}, chips: ${currentPlayer.chips})`);
      } else {
        // Player has no chips and can't match - fold
        actualAction = "fold";
        console.log(`[GAME] Invalid check converted to fold (player bet: ${currentPlayer.currentBet}, current bet: ${state.currentBet}, no chips)`);
      }
    }

    // Update in-game stats based on actual action (after validation)
    const newInGameStats = state.inGameStats.map((stat) => {
      if (stat.modelId !== player.modelId) return stat;
      const newStats = { ...stat.stats };

      const isPreflop = state.phase === "preflop";
      const facingRaise = state.currentBet > player.currentBet;

      if (facingRaise) {
        newStats.raisesFaced++;
      }

      switch (actualAction) {
        case "fold":
          newStats.totalFolds++; // Count ALL folds
          if (isPreflop) newStats.preflopFolds++;
          if (facingRaise) newStats.foldedToRaise++;
          break;
        case "check":
          newStats.totalChecks++;
          break;
        case "call":
          if (isPreflop) {
            newStats.preflopCalls++;
            newStats.handsPlayed++;
          } else {
            newStats.totalCalls++;
          }
          break;
        case "raise":
          if (isPreflop) {
            newStats.preflopRaises++;
            newStats.handsPlayed++;
          } else {
            newStats.totalRaises++;
          }
          break;
      }

      return { ...stat, stats: newStats };
    });

    switch (actualAction) {
      case "fold":
        currentPlayer.folded = true;
        actualActionAmount = undefined;
        break;

      case "check":
        // No change to bets (only valid if player.currentBet === state.currentBet)
        actualActionAmount = undefined;
        break;

      case "call": {
        const callAmount = Math.min(
          state.currentBet - currentPlayer.currentBet,
          currentPlayer.chips,
        );
        currentPlayer.chips -= callAmount;
        currentPlayer.currentBet += callAmount;
        currentPlayer.totalBetThisHand += callAmount;
        newPot += callAmount;
        actualActionAmount = callAmount; // Track actual call amount
        if (currentPlayer.chips === 0) {
          currentPlayer.isAllIn = true;
        }
        break;
      }

      case "raise": {
        // Calculate minimum raise from first principles to avoid stale state issues
        const minRaiseIncrement = Math.max(
          state.lastRaiseAmount || game.blinds.big,
          game.blinds.big,
        );
        const calculatedMinRaise = state.currentBet + minRaiseIncrement;

        // Ensure raise is at least the minimum (or all-in if can't meet minimum)
        const requestedTotal = args.amount ?? calculatedMinRaise;
        // Use the higher of state.minRaise and calculated to be safe
        const effectiveMinRaise = Math.max(state.minRaise, calculatedMinRaise);
        const raiseTotal = Math.max(requestedTotal, effectiveMinRaise);
        const raiseAmount = raiseTotal - currentPlayer.currentBet;

        // Validate: raiseAmount should be positive, otherwise this should be a call
        if (raiseAmount <= 0) {
          // Invalid raise amount - treat as call instead
          const callAmount = Math.min(
            state.currentBet - currentPlayer.currentBet,
            currentPlayer.chips,
          );
          currentPlayer.chips -= callAmount;
          currentPlayer.currentBet += callAmount;
          currentPlayer.totalBetThisHand += callAmount;
          newPot += callAmount;
          actualActionAmount = callAmount;
          if (currentPlayer.chips === 0) {
            currentPlayer.isAllIn = true;
          }
          break;
        }

        let actualRaise = Math.min(raiseAmount, currentPlayer.chips);
        const originalRequestedRaise = actualRaise;

        // If not going all-in, ensure the final bet meets minimum raise
        const finalBet = currentPlayer.currentBet + actualRaise;
        if (finalBet < effectiveMinRaise && currentPlayer.chips > actualRaise) {
          // Round up to minimum
          const additionalNeeded = Math.min(
            effectiveMinRaise - finalBet,
            currentPlayer.chips - actualRaise,
          );
          actualRaise += additionalNeeded;
          console.log(
            `[GAME] Raise rounded up: requested ${requestedTotal}, effective min ${effectiveMinRaise}, ` +
              `adjusted from ${originalRequestedRaise} to ${actualRaise} for ${player.modelId}`,
          );
        }

        currentPlayer.chips -= actualRaise;
        currentPlayer.currentBet += actualRaise;
        currentPlayer.totalBetThisHand += actualRaise;
        newPot += actualRaise;
        actualActionAmount = currentPlayer.currentBet; // Track total bet amount for raise

        if (currentPlayer.currentBet > newCurrentBet) {
          const raiseIncrement = currentPlayer.currentBet - newCurrentBet;
          const isFullRaise = raiseIncrement >= newLastRaiseAmount;

          newLastRaiseAmount = raiseIncrement;
          newCurrentBet = currentPlayer.currentBet;
          newMinRaise = newCurrentBet + Math.max(raiseIncrement, newLastRaiseAmount);
          newLastAggressor = playerIndex;

          // Only reset hasActed if this is a FULL raise (reopens betting)
          // A partial all-in that exceeds current bet but isn't a full raise
          // does NOT reopen betting for other players
          if (isFullRaise) {
            for (let i = 0; i < newPlayerStates.length; i++) {
              if (
                i !== playerIndex &&
                !newPlayerStates[i].folded &&
                !newPlayerStates[i].isAllIn
              ) {
                newPlayerStates[i] = { ...newPlayerStates[i], hasActed: false };
              }
            }
          }
        }

        if (currentPlayer.chips === 0) {
          currentPlayer.isAllIn = true;
        }
        break;
      }
    }

    currentPlayer.hasActed = true;
    newPlayerStates[playerIndex] = currentPlayer;

    // Update model's AI metrics (tokens and cost)
    if (!game.isDevGame) {
      // Ranked game - update main models table
      const model = await ctx.db
        .query("models")
        .withIndex("by_gatewayId", (q) => q.eq("gatewayId", player.modelId))
        .first();

      if (model) {
        await ctx.db.patch(model._id, {
          totalInputTokens: model.totalInputTokens + args.tokensUsed.input,
          totalOutputTokens: model.totalOutputTokens + args.tokensUsed.output,
          totalResponseTimeMs: model.totalResponseTimeMs + args.responseTimeMs,
          totalCost: (model.totalCost ?? 0) + (args.cost ?? 0),
        });
      }
    } else {
      // Dev game - update devStats table (separate from leaderboard)
      const devStat = await ctx.db
        .query("devStats")
        .withIndex("by_gatewayId", (q) => q.eq("gatewayId", player.modelId))
        .first();

      // Track action type for strategy metrics
      // Note: "bet" action doesn't exist in our system - raises from 0 are still "raise"
      // We track opening bets (raise when currentBet=0) under totalBets for stats
      const isOpeningBet = actualAction === "raise" && state.currentBet === 0;
      const actionUpdates = {
        totalBets: isOpeningBet ? 1 : 0,
        totalRaises: actualAction === "raise" && !isOpeningBet ? 1 : 0,
        totalCalls: actualAction === "call" ? 1 : 0,
        totalFolds: actualAction === "fold" ? 1 : 0,
        totalChecks: actualAction === "check" ? 1 : 0,
      };

      if (devStat) {
        await ctx.db.patch(devStat._id, {
          totalInputTokens: devStat.totalInputTokens + args.tokensUsed.input,
          totalOutputTokens: devStat.totalOutputTokens + args.tokensUsed.output,
          totalResponseTimeMs:
            devStat.totalResponseTimeMs + args.responseTimeMs,
          totalCost: devStat.totalCost + (args.cost ?? 0),
          totalBets: devStat.totalBets + actionUpdates.totalBets,
          totalRaises: devStat.totalRaises + actionUpdates.totalRaises,
          totalCalls: devStat.totalCalls + actionUpdates.totalCalls,
          totalFolds: devStat.totalFolds + actionUpdates.totalFolds,
          totalChecks: devStat.totalChecks + actionUpdates.totalChecks,
          updatedAt: Date.now(),
        });
      } else {
        // Create new devStats entry
        await ctx.db.insert("devStats", {
          gatewayId: player.modelId,
          gamesPlayed: 0,
          gamesWon: 0,
          handsPlayed: 0,
          handsWon: 0,
          totalProfit: 0,
          biggestWin: 0,
          biggestLoss: 0,
          totalInputTokens: args.tokensUsed.input,
          totalOutputTokens: args.tokensUsed.output,
          totalResponseTimeMs: args.responseTimeMs,
          totalCost: args.cost ?? 0,
          ...actionUpdates,
          updatedAt: Date.now(),
        });
      }
    }

    // Add action to actionLog (keep last 50 entries)
    const newActionLogEntry = {
      type: "action" as const,
      playerId: player.modelId,
      playerName: player.codename,
      action: actualAction,
      amount: actualActionAmount, // Use actual calculated amount for call/raise
      phase: state.phase,
      timestamp: Date.now(),
      reasoning: args.reasoning.slice(0, 200), // Truncate reasoning for UI
      handNumber: game.currentHand,
      isAllIn: currentPlayer.isAllIn, // Track if this action was an all-in
      position: getPositionName(playerIndex, state.dealerIndex, state.playerStates.length),
    };
    const existingLog = state.actionLog || [];
    const newActionLog = [...existingLog, newActionLogEntry].slice(-200);

    // Update game state (including per-game AI cost)
    await ctx.db.patch(args.gameId, {
      turnNumber: game.turnNumber + 1,
      totalAICost: (game.totalAICost ?? 0) + (args.cost ?? 0),
      state: {
        ...state,
        pot: newPot,
        currentBet: newCurrentBet,
        minRaise: newMinRaise,
        lastRaiseAmount: newLastRaiseAmount,
        lastAggressor: newLastAggressor,
        playerStates: newPlayerStates,
        inGameStats: newInGameStats,
        actionLog: newActionLog,
        thinkingPlayerId: undefined, // Clear thinking state
      },
    });

    // Advance game
    const updatedGame = await ctx.db.get(args.gameId);
    if (updatedGame) {
      await advanceToNextPlayerAfterAI(ctx, args.gameId, updatedGame);
    }
  },
});

/**
 * Advance to next player after AI decision (separate from normal flow)
 */
async function advanceToNextPlayerAfterAI(ctx: any, gameId: any, game: any) {
  const state = game.state;
  const playersInHand = countPlayersInHand(state.playerStates);

  console.log(
    `[GAME] advanceToNextPlayerAfterAI: playersInHand=${playersInHand}, phase=${state.phase}, currentBet=${state.currentBet}`,
  );

  // Check if only one player remains
  if (playersInHand <= 1) {
    console.log("[GAME] Only one player remains, handling fold win");
    await handleAllFolded(ctx, gameId, game);
    return;
  }

  // Check if betting round is complete
  const bettingComplete = isBettingRoundComplete(
    state.playerStates,
    state.currentBet,
  );
  console.log(`[GAME] Betting round complete: ${bettingComplete}`);

  if (bettingComplete) {
    console.log("[GAME] Advancing to next phase");
    await advanceToNextPhase(ctx, gameId, game);
    return;
  }

  // Find next active player
  const nextPlayerIndex = getNextActivePlayer(
    state.currentPlayerIndex,
    state.playerStates,
  );

  console.log(`[GAME] Next active player index: ${nextPlayerIndex}`);

  if (nextPlayerIndex === -1) {
    console.log("[GAME] No active players, advancing to next phase");
    await advanceToNextPhase(ctx, gameId, game);
    return;
  }

  // Update current player and schedule next turn
  await ctx.db.patch(gameId, {
    state: {
      ...state,
      currentPlayerIndex: nextPlayerIndex,
    },
  });

  // Schedule next AI turn
  // Note: game.turnNumber is already the current turn (was incremented in applyAIDecision)
  console.log(
    `[GAME] Scheduling next AI turn: player=${nextPlayerIndex}, turn=${game.turnNumber}`,
  );
  await ctx.scheduler.runAfter(500, scheduleAITurnRef, {
    gameId,
    expectedTurn: game.turnNumber,
  });
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get position name (BTN, SB, BB, UTG, etc.) for a player
 */
function getPositionName(
  playerIndex: number,
  dealerIndex: number,
  totalPlayers: number,
): string {
  const offset = (playerIndex - dealerIndex + totalPlayers) % totalPlayers;

  // Heads-up special case
  if (totalPlayers === 2) {
    return offset === 0 ? "BTN" : "BB";
  }

  if (offset === 0) return "BTN";
  if (offset === 1) return "SB";
  if (offset === 2) return "BB";
  if (offset === totalPlayers - 1) return "CO";
  if (offset === totalPlayers - 2 && totalPlayers >= 6) return "HJ";

  const positionFromBB = offset - 2;
  if (totalPlayers <= 5) return "UTG";
  if (totalPlayers === 6) return "UTG";
  if (totalPlayers === 7) {
    if (positionFromBB === 1) return "UTG";
    return "MP";
  }

  // 8+ players
  if (positionFromBB === 1) return "UTG";
  if (positionFromBB === 2) return "UTG+1";
  const middlePositions = totalPlayers - 6;
  if (positionFromBB <= middlePositions + 2) return "MP";
  return "MP";
}

/**
 * Get next player with chips (skipping busted AND folded players)
 * Used for finding who acts next during a hand
 */
function getNextPlayerWithChips(
  currentIndex: number,
  players: PlayerState[],
  numPlayers: number,
): number {
  let next = (currentIndex + 1) % numPlayers;
  const start = next;
  let iterations = 0;

  while (players[next].chips <= 0 || players[next].folded) {
    next = (next + 1) % numPlayers;
    iterations++;
    if (next === start || iterations >= numPlayers) {
      console.warn(
        `[GAME] getNextPlayerWithChips: No valid player found after ${iterations} iterations`,
      );
      break;
    }
  }

  return next;
}

/**
 * Get next player with chips for blind positions (only checks chips, ignores folded)
 * Used at start of new hand when folded state is stale from previous hand
 */
function getNextPlayerForBlinds(
  currentIndex: number,
  players: PlayerState[],
  numPlayers: number,
): number {
  let next = (currentIndex + 1) % numPlayers;
  const start = next;
  let iterations = 0;

  // Only check chips - folded state is stale from previous hand
  while (players[next].chips <= 0) {
    next = (next + 1) % numPlayers;
    iterations++;
    if (next === start || iterations >= numPlayers) {
      console.warn(
        `[GAME] getNextPlayerForBlinds: No valid player found after ${iterations} iterations`,
      );
      break;
    }
  }

  return next;
}
