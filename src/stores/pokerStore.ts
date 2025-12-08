import { create } from "zustand";
import type {
  Model,
  Card,
  PokerGameState,
  PokerPlayerState,
  PokerAction,
  BettingPhase,
  GameFlowPhase,
  PokerAgentContext,
  AnonymizedPokerOpponent,
  AnonymizedPokerHistoryEntry,
  EvaluatedHand,
  PokerBettingEntry,
} from "@/types/poker";
import { DEFAULT_POKER_CONFIG } from "@/types/poker";
import { createDeck, shuffleDeck, dealCardsImmutable } from "@/lib/cards";
import { ACTION_LOG_LIMIT, DEBUG_LOG_LIMIT } from "@/lib/constants";
import { evaluateHand, determineWinners } from "@/lib/hand-evaluator";
import { calculatePots, distributePots } from "@/lib/pot-manager";
import { calculateOddsAsync, type PlayerOdds } from "@/lib/poker-odds";
import {
  type PokerCharacter,
  assignCharactersToModels,
  randomizePlayerOrder,
} from "@/lib/poker-characters";

// Action log entry type
export interface ActionLogEntry {
  id: string;
  timestamp: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  type: "thinking" | "action" | "phase" | "system";
  content: string;
  action?: string;
  amount?: number;
}

// Thinking state
export interface ThinkingState {
  isThinking: boolean;
  currentPlayerId: string | null;
  thinkingText: string;
  error: string | null;
}

interface PokerStore {
  // Core game state
  gameState: PokerGameState | null;
  models: Model[];
  humanPlayerId: string | null;

  // Character system - hides model identity during game
  characterMap: Record<string, PokerCharacter>;
  displayOrder: string[]; // Randomized order of player IDs
  isRevealed: boolean; // True when game ends and real models are shown

  // Win percentages for each player (updated during game)
  playerOdds: Record<string, PlayerOdds>;
  playerHands: Record<string, EvaluatedHand>;

  // UI state
  actionLog: ActionLogEntry[];
  debugLog: string[];
  lastActions: Record<string, { action: string; amount?: number }>;

  // Thinking state
  thinkingState: ThinkingState;
  isProcessing: boolean;
  lastProcessedTurn: string | null;

  // Actions - Game Setup
  setModels: (models: Model[], humanPlayerId: string | null) => void;
  initializeGame: () => void;
  startNextHand: () => void;

  // Actions - Game Flow
  processAction: (playerId: string, action: PokerAction) => void;
  advancePhase: () => void;
  resolveShowdown: () => void;
  awardPotToWinner: (winnerId: string) => void;

  // Actions - Thinking (unified flow)
  startThinking: (playerId: string) => void;
  completeThinking: (
    playerId: string,
    action: PokerAction,
    thinkingText: string,
  ) => void;
  cancelThinking: () => void;
  setIsProcessing: (value: boolean) => void;
  setLastProcessedTurn: (turnKey: string | null) => void;
  // Batched action to set both processing state values at once (reduces re-renders)
  setProcessingState: (isProcessing: boolean, turnKey: string | null) => void;

  // Game flow phase transitions
  transitionTo: (phase: GameFlowPhase) => void;
  getFlowPhase: () => GameFlowPhase;

  // Batched state updates for reducing re-renders
  completeActionBatch: (
    playerId: string,
    action: { action: string; amount?: number },
    flowPhase: GameFlowPhase,
  ) => void;

  // Actions - UI
  addActionLog: (entry: Omit<ActionLogEntry, "id" | "timestamp">) => void;
  addDebug: (msg: string) => void;
  setLastAction: (
    playerId: string,
    action: { action: string; amount?: number },
  ) => void;
  clearForNextHand: () => void;

  // Selectors
  buildAgentContext: (playerId: string) => PokerAgentContext | null;
  isBettingRoundComplete: () => boolean;
  hasWinnerByFold: () => string | null;
  isGameOver: () => boolean;
  getWinner: () => { playerId: string; chipStack: number } | null;
  getHandWinners: () => Array<{
    playerId: string;
    amount: number;
    hand?: EvaluatedHand;
  }> | null;

  // Track hand results separately for UI
  currentHandWinners: Array<{
    playerId: string;
    amount: number;
    hand?: EvaluatedHand;
  }>;
  setCurrentHandWinners: (
    winners: Array<{ playerId: string; amount: number; hand?: EvaluatedHand }>,
  ) => void;

  // Character/reveal actions
  revealModels: () => void;
  updateOddsAndHands: () => Promise<void>;
  getDisplayName: (playerId: string) => string;
  getDisplayPortrait: (playerId: string) => string;
  getDisplayColor: (playerId: string) => string;
}

export const usePokerStore = create<PokerStore>((set, get) => ({
  // Initial state
  gameState: null,
  models: [],
  humanPlayerId: null,
  characterMap: {},
  displayOrder: [],
  isRevealed: false,
  playerOdds: {},
  playerHands: {},
  actionLog: [],
  debugLog: [],
  lastActions: {},
  thinkingState: {
    isThinking: false,
    currentPlayerId: null,
    thinkingText: "",
    error: null,
  },
  isProcessing: false,
  lastProcessedTurn: null,
  currentHandWinners: [],

  // Set models and assign characters (also resets game state for new game)
  setModels: (models, humanPlayerId) => {
    // Assign random characters to each model
    const characterMap = assignCharactersToModels(models.map((m) => m.id));

    // Randomize display order
    const displayOrder = randomizePlayerOrder(models.map((m) => m.id));

    set({
      models,
      humanPlayerId,
      characterMap,
      displayOrder,
      isRevealed: false,
      // Reset game state for new game
      gameState: null,
      actionLog: [],
      debugLog: [],
      lastActions: {},
      playerOdds: {},
      playerHands: {},
      currentHandWinners: [],
      isProcessing: false,
      lastProcessedTurn: null,
      thinkingState: {
        isThinking: false,
        currentPlayerId: null,
        thinkingText: "",
        error: null,
      },
    });
  },

  // Initialize game
  initializeGame: () => {
    const { models, humanPlayerId } = get();
    if (models.length < 2) return;

    const gameId = crypto.randomUUID();
    let deck = shuffleDeck(createDeck());

    const playerStates: Record<string, PokerPlayerState> = {};
    const players = [...models];

    // Heads-up special case: BTN is also SB
    const isHeadsUp = players.length === 2;

    players.forEach((model, index) => {
      const { dealt, remaining } = dealCardsImmutable(deck, 2);
      deck = remaining;

      playerStates[model.id] = {
        playerId: model.id,
        holeCards: dealt,
        chipStack: DEFAULT_POKER_CONFIG.startingChips,
        currentBet: 0,
        totalBetThisHand: 0,
        status: "active",
        isDealer: index === 0,
        // In heads-up: BTN (position 0) is also SB
        isSmallBlind: isHeadsUp ? index === 0 : index === 1,
        isBigBlind: isHeadsUp ? index === 1 : index === 2 % players.length,
        hasActed: false,
        lastAction: null,
        position: index,
        isHuman: model.id === humanPlayerId,
      };
    });

    // Post blinds - different positions for heads-up
    const sbPosition = isHeadsUp ? 0 : 1 % players.length;
    const bbPosition = isHeadsUp ? 1 : 2 % players.length;
    const sbPlayerId = players[sbPosition].id;
    const bbPlayerId = players[bbPosition].id;

    playerStates[sbPlayerId].currentBet = DEFAULT_POKER_CONFIG.smallBlind;
    playerStates[sbPlayerId].totalBetThisHand = DEFAULT_POKER_CONFIG.smallBlind;
    playerStates[sbPlayerId].chipStack -= DEFAULT_POKER_CONFIG.smallBlind;

    playerStates[bbPlayerId].currentBet = DEFAULT_POKER_CONFIG.bigBlind;
    playerStates[bbPlayerId].totalBetThisHand = DEFAULT_POKER_CONFIG.bigBlind;
    playerStates[bbPlayerId].chipStack -= DEFAULT_POKER_CONFIG.bigBlind;

    // In heads-up: BTN/SB acts first preflop
    // In multi-way: player after BB acts first preflop
    const firstToAct = isHeadsUp ? 0 : (bbPosition + 1) % players.length;

    const newGameState: PokerGameState = {
      id: gameId,
      status: "betting",
      flowPhase: "dealing", // Start with dealing phase for card animation
      players,
      playerStates,
      humanPlayerId,
      dealerPosition: 0,
      smallBlindPosition: sbPosition,
      bigBlindPosition: bbPosition,
      currentPlayerIndex: firstToAct,
      deck,
      communityCards: [],
      burnedCards: [],
      currentPhase: "preflop",
      currentBet: DEFAULT_POKER_CONFIG.bigBlind,
      minRaise: DEFAULT_POKER_CONFIG.bigBlind * 2,
      pots: [],
      lastRaiserIndex: bbPosition,
      smallBlindAmount: DEFAULT_POKER_CONFIG.smallBlind,
      bigBlindAmount: DEFAULT_POKER_CONFIG.bigBlind,
      handNumber: 1,
      totalHands: DEFAULT_POKER_CONFIG.totalHands,
      handHistory: [],
      actionHistory: [],
      agentThinking: {},
    };

    set({ gameState: newGameState, currentHandWinners: [] });
    get().addDebug("Game initialized");
  },

  // Process player action
  processAction: (playerId, action) => {
    const { gameState, models } = get();
    if (!gameState) return;

    const playerState = gameState.playerStates[playerId];
    if (!playerState) return;

    const updatedPlayerStates = { ...gameState.playerStates };
    const updatedState = { ...playerState };

    let newCurrentBet = gameState.currentBet;
    let newMinRaise = gameState.minRaise;
    let newLastRaiserIndex = gameState.lastRaiserIndex;

    switch (action.type) {
      case "fold":
        updatedState.status = "folded";
        updatedState.hasActed = true;
        updatedState.lastAction = action;
        break;

      case "check":
        updatedState.hasActed = true;
        updatedState.lastAction = action;
        break;

      case "call": {
        const callAmount = Math.min(
          gameState.currentBet - updatedState.currentBet,
          updatedState.chipStack,
        );
        updatedState.chipStack -= callAmount;
        updatedState.currentBet += callAmount;
        updatedState.totalBetThisHand += callAmount;
        updatedState.hasActed = true;
        updatedState.lastAction = action;

        if (updatedState.chipStack === 0) {
          updatedState.status = "all-in";
        }
        break;
      }

      case "raise": {
        const raiseAmount = action.amount || gameState.minRaise;
        const totalBet = Math.min(
          raiseAmount,
          updatedState.currentBet + updatedState.chipStack,
        );
        const chipsToPut = totalBet - updatedState.currentBet;

        updatedState.chipStack -= chipsToPut;
        updatedState.currentBet = totalBet;
        updatedState.totalBetThisHand += chipsToPut;
        updatedState.hasActed = true;
        updatedState.lastAction = { ...action, amount: totalBet };

        newCurrentBet = totalBet;
        newMinRaise = totalBet + (totalBet - gameState.currentBet);
        newLastRaiserIndex = gameState.players.findIndex(
          (p) => p.id === playerId,
        );

        // Reset hasActed for other players
        Object.keys(updatedPlayerStates).forEach((pid) => {
          if (
            pid !== playerId &&
            updatedPlayerStates[pid].status === "active"
          ) {
            updatedPlayerStates[pid] = {
              ...updatedPlayerStates[pid],
              hasActed: false,
            };
          }
        });

        if (updatedState.chipStack === 0) {
          updatedState.status = "all-in";
        }
        break;
      }

      case "all-in": {
        const allInAmount = updatedState.chipStack;
        const newBet = updatedState.currentBet + allInAmount;

        updatedState.totalBetThisHand += allInAmount;
        updatedState.currentBet = newBet;
        updatedState.chipStack = 0;
        updatedState.status = "all-in";
        updatedState.hasActed = true;
        updatedState.lastAction = { type: "all-in", amount: newBet };

        if (newBet > gameState.currentBet) {
          newCurrentBet = newBet;
          newMinRaise = newBet + (newBet - gameState.currentBet);
          newLastRaiserIndex = gameState.players.findIndex(
            (p) => p.id === playerId,
          );

          Object.keys(updatedPlayerStates).forEach((pid) => {
            if (
              pid !== playerId &&
              updatedPlayerStates[pid].status === "active"
            ) {
              updatedPlayerStates[pid] = {
                ...updatedPlayerStates[pid],
                hasActed: false,
              };
            }
          });
        }
        break;
      }
    }

    updatedPlayerStates[playerId] = updatedState;

    // Find next player (with guard against empty player list)
    if (gameState.players.length === 0) return;

    let nextPlayerIndex =
      (gameState.currentPlayerIndex + 1) % gameState.players.length;
    let attempts = 0;
    while (attempts < gameState.players.length) {
      const nextPlayer = gameState.players[nextPlayerIndex];
      const nextState = updatedPlayerStates[nextPlayer.id];
      if (nextState.status === "active") break;
      nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
      attempts++;
    }

    // Add to action history
    const player = models.find((m) => m.id === playerId);
    const newEntry: PokerBettingEntry = {
      playerId,
      playerName: player?.name || "Unknown",
      action: action.type,
      amount: action.amount,
      phase: gameState.currentPhase,
      timestamp: Date.now(),
    };
    const newActionHistory = [...gameState.actionHistory, newEntry];

    set({
      gameState: {
        ...gameState,
        playerStates: updatedPlayerStates,
        currentPlayerIndex: nextPlayerIndex,
        currentBet: newCurrentBet,
        minRaise: newMinRaise,
        lastRaiserIndex: newLastRaiserIndex,
        actionHistory: newActionHistory,
      },
    });
  },

  // Advance phase
  advancePhase: () => {
    const { gameState } = get();
    if (!gameState) return;

    const phaseOrder: BettingPhase[] = [
      "preflop",
      "flop",
      "turn",
      "river",
      "showdown",
    ];
    const currentIndex = phaseOrder.indexOf(gameState.currentPhase);
    const nextPhase = phaseOrder[currentIndex + 1];

    if (!nextPhase) return;

    let deck = [...gameState.deck];
    let communityCards = [...gameState.communityCards];
    let burnedCards = [...gameState.burnedCards];

    // Deal community cards
    if (nextPhase === "flop") {
      burnedCards.push(deck.shift()!);
      communityCards = deck.splice(0, 3);
    } else if (nextPhase === "turn" || nextPhase === "river") {
      burnedCards.push(deck.shift()!);
      communityCards.push(deck.shift()!);
    }

    // Reset for new betting round
    const updatedPlayerStates = { ...gameState.playerStates };
    Object.keys(updatedPlayerStates).forEach((pid) => {
      if (updatedPlayerStates[pid].status === "active") {
        updatedPlayerStates[pid] = {
          ...updatedPlayerStates[pid],
          currentBet: 0,
          hasActed: false,
        };
      }
    });

    // First to act is after dealer for post-flop
    let firstToAct = (gameState.dealerPosition + 1) % gameState.players.length;
    let attempts = 0;
    while (attempts < gameState.players.length) {
      const player = gameState.players[firstToAct];
      const state = updatedPlayerStates[player.id];
      if (state.status === "active") break;
      firstToAct = (firstToAct + 1) % gameState.players.length;
      attempts++;
    }

    set({
      gameState: {
        ...gameState,
        currentPhase: nextPhase,
        communityCards,
        burnedCards,
        deck,
        currentBet: 0,
        minRaise: gameState.bigBlindAmount,
        currentPlayerIndex: firstToAct,
        playerStates: updatedPlayerStates,
        status: nextPhase === "showdown" ? "showdown" : "betting",
        flowPhase:
          nextPhase === "showdown" ? "awarding_pot" : "awaiting_action",
      },
    });

    get().addDebug(`Advanced to ${nextPhase}`);
  },

  // Resolve showdown with proper side pot distribution
  resolveShowdown: () => {
    const { gameState, actionLog, characterMap } = get();
    if (!gameState) return;

    const activePlayers = gameState.players.filter(
      (p) => gameState.playerStates[p.id].status !== "folded",
    );

    if (activePlayers.length === 0) return;

    // Build player hands map for pot distribution
    const playerHandsMap = new Map<string, EvaluatedHand>();
    const playerHandsArray: Array<{ playerId: string; hand: EvaluatedHand }> =
      [];

    activePlayers.forEach((p) => {
      const state = gameState.playerStates[p.id];
      const hand = evaluateHand(state.holeCards, gameState.communityCards);
      playerHandsMap.set(p.id, hand);
      playerHandsArray.push({ playerId: p.id, hand });
    });

    // Calculate side pots based on all-in amounts
    const pots = calculatePots(gameState.playerStates);

    // Distribute each pot to eligible winners
    const winnings = distributePots(pots, playerHandsMap);

    // Update chip stacks based on winnings
    const updatedPlayerStates = { ...gameState.playerStates };
    for (const [playerId, amount] of winnings) {
      updatedPlayerStates[playerId] = {
        ...updatedPlayerStates[playerId],
        chipStack: updatedPlayerStates[playerId].chipStack + amount,
      };
    }

    // Build winners array with their total winnings
    const winners = Array.from(winnings.entries()).map(
      ([playerId, amount]) => ({
        playerId,
        amount,
        hand: playerHandsMap.get(playerId),
      }),
    );

    // Create win action log entries for each winner
    const winLogEntries: ActionLogEntry[] = winners.map((winner) => {
      const character = characterMap[winner.playerId];
      const handName = winner.hand?.rankName || "Unknown";
      return {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        playerId: "system",
        playerName: "System",
        playerColor: "#22c55e",
        type: "system" as const,
        content: `${character?.name || winner.playerId} wins $${winner.amount} with ${handName}`,
        amount: winner.amount,
      };
    });

    set({
      gameState: {
        ...gameState,
        status: "hand_complete",
        flowPhase: "hand_countdown",
        playerStates: updatedPlayerStates,
        pots, // Store the calculated pots for reference
      },
      currentHandWinners: winners,
      actionLog: [...winLogEntries, ...actionLog].slice(0, ACTION_LOG_LIMIT),
    });
  },

  // Award pot to winner (fold victory)
  awardPotToWinner: (winnerId) => {
    const { gameState, actionLog, characterMap } = get();
    if (!gameState) return;

    const totalPot = Object.values(gameState.playerStates).reduce(
      (sum, p) => sum + p.totalBetThisHand,
      0,
    );

    const updatedPlayerStates = { ...gameState.playerStates };
    updatedPlayerStates[winnerId] = {
      ...updatedPlayerStates[winnerId],
      chipStack: updatedPlayerStates[winnerId].chipStack + totalPot,
    };

    // Create win action log entry
    const character = characterMap[winnerId];
    const winLogEntry: ActionLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      playerId: "system",
      playerName: "System",
      playerColor: "#22c55e",
      type: "system" as const,
      content: `${character?.name || winnerId} wins $${totalPot} — All others folded`,
      amount: totalPot,
    };

    set({
      gameState: {
        ...gameState,
        status: "hand_complete",
        flowPhase: "hand_countdown",
        playerStates: updatedPlayerStates,
      },
      currentHandWinners: [{ playerId: winnerId, amount: totalPot }],
      actionLog: [winLogEntry, ...actionLog].slice(0, ACTION_LOG_LIMIT),
    });
  },

  // Start next hand
  startNextHand: () => {
    const { gameState, models, humanPlayerId } = get();
    if (!gameState) return;

    const newDealerPosition =
      (gameState.dealerPosition + 1) % gameState.players.length;
    let deck = shuffleDeck(createDeck());

    const playerStates: Record<string, PokerPlayerState> = {};

    // Count active players (with chips) to determine if heads-up
    const activePlayers = gameState.players.filter(
      (p) => gameState.playerStates[p.id].chipStack > 0,
    );
    const isHeadsUp = activePlayers.length === 2;

    gameState.players.forEach((model, index) => {
      const prevState = gameState.playerStates[model.id];

      // Skip players with no chips
      if (prevState.chipStack <= 0) {
        playerStates[model.id] = {
          ...prevState,
          holeCards: [],
          currentBet: 0,
          totalBetThisHand: 0,
          status: "folded",
          hasActed: true,
          lastAction: null,
          isDealer: false,
          isSmallBlind: false,
          isBigBlind: false,
        };
        return;
      }

      const { dealt, remaining } = dealCardsImmutable(deck, 2);
      deck = remaining;

      const relativePos =
        (index - newDealerPosition + gameState.players.length) %
        gameState.players.length;

      playerStates[model.id] = {
        playerId: model.id,
        holeCards: dealt,
        chipStack: prevState.chipStack,
        currentBet: 0,
        totalBetThisHand: 0,
        status: "active",
        isDealer: relativePos === 0,
        // In heads-up: BTN (relativePos 0) is also SB
        isSmallBlind: isHeadsUp ? relativePos === 0 : relativePos === 1,
        isBigBlind: isHeadsUp
          ? relativePos === 1
          : relativePos === 2 % gameState.players.length,
        hasActed: false,
        lastAction: null,
        position: index,
        isHuman: model.id === humanPlayerId,
      };
    });

    // Post blinds - different positions for heads-up
    const sbPosition = isHeadsUp
      ? newDealerPosition
      : (newDealerPosition + 1) % gameState.players.length;
    const bbPosition = isHeadsUp
      ? (newDealerPosition + 1) % gameState.players.length
      : (newDealerPosition + 2) % gameState.players.length;
    const sbPlayerId = gameState.players[sbPosition].id;
    const bbPlayerId = gameState.players[bbPosition].id;

    if (playerStates[sbPlayerId].status === "active") {
      const sbAmount = Math.min(
        DEFAULT_POKER_CONFIG.smallBlind,
        playerStates[sbPlayerId].chipStack,
      );
      playerStates[sbPlayerId].currentBet = sbAmount;
      playerStates[sbPlayerId].totalBetThisHand = sbAmount;
      playerStates[sbPlayerId].chipStack -= sbAmount;
    }

    if (playerStates[bbPlayerId].status === "active") {
      const bbAmount = Math.min(
        DEFAULT_POKER_CONFIG.bigBlind,
        playerStates[bbPlayerId].chipStack,
      );
      playerStates[bbPlayerId].currentBet = bbAmount;
      playerStates[bbPlayerId].totalBetThisHand = bbAmount;
      playerStates[bbPlayerId].chipStack -= bbAmount;
    }

    // In heads-up: BTN/SB acts first preflop
    // In multi-way: player after BB acts first preflop
    const firstToAct = isHeadsUp
      ? newDealerPosition
      : (bbPosition + 1) % gameState.players.length;

    set({
      gameState: {
        ...gameState,
        status: "betting",
        flowPhase: "dealing", // Start with dealing phase for card animation
        playerStates,
        dealerPosition: newDealerPosition,
        smallBlindPosition: sbPosition,
        bigBlindPosition: bbPosition,
        currentPlayerIndex: firstToAct,
        deck,
        communityCards: [],
        burnedCards: [],
        currentPhase: "preflop",
        currentBet: DEFAULT_POKER_CONFIG.bigBlind,
        minRaise: DEFAULT_POKER_CONFIG.bigBlind * 2,
        lastRaiserIndex: bbPosition,
        handNumber: gameState.handNumber + 1,
        actionHistory: [],
        agentThinking: {},
      },
      lastActions: {},
      lastProcessedTurn: null,
      isProcessing: false,
      currentHandWinners: [],
    });
  },

  // Set current hand winners
  setCurrentHandWinners: (winners) => {
    set({ currentHandWinners: winners });
  },

  // Thinking state - unified flow
  startThinking: (playerId) => {
    const { models, actionLog, thinkingState } = get();
    const player = models.find((m) => m.id === playerId);
    if (!player) return;

    // Already thinking for this player? Skip (idempotent)
    if (
      thinkingState.isThinking &&
      thinkingState.currentPlayerId === playerId
    ) {
      return;
    }

    // Check if THINKING entry already exists for this player
    const existingThinking = actionLog.find(
      (e) => e.playerId === playerId && e.type === "thinking",
    );

    set((prev) => ({
      // Set thinking state
      thinkingState: {
        isThinking: true,
        currentPlayerId: playerId,
        thinkingText: "",
        error: null,
      },
      // Only add THINKING entry if one doesn't exist
      actionLog: existingThinking
        ? prev.actionLog
        : [
            {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              playerId,
              playerName: player.name,
              playerColor: player.color,
              type: "thinking" as const,
              content: "Analyzing the situation...",
            },
            ...prev.actionLog,
          ].slice(0, ACTION_LOG_LIMIT),
    }));
  },

  completeThinking: (playerId, action, thinkingText) => {
    const { models, actionLog } = get();
    const player = models.find((m) => m.id === playerId);
    if (!player) return;

    const actionText = `${action.type.toUpperCase()}${action.amount ? ` $${action.amount}` : ""}`;

    // Find the existing THINKING entry ID (we'll transform it, not remove it)
    const thinkingEntry = actionLog.find(
      (e) => e.playerId === playerId && e.type === "thinking",
    );
    const entryIdToTransform = thinkingEntry?.id;

    // Immediately: clear thinking state + update lastAction for badge
    // Keep THINKING entry visible until summary is ready
    set((prev) => ({
      thinkingState: {
        isThinking: false,
        currentPlayerId: null,
        thinkingText: "",
        error: null,
      },
      // Update last action for player card badge
      lastActions: {
        ...prev.lastActions,
        [playerId]: { action: action.type, amount: action.amount },
      },
    }));

    // Async: fetch summary then TRANSFORM the THINKING entry into ACTION entry
    fetchSummaryAndAddAction(
      playerId,
      player,
      actionText,
      action,
      thinkingText,
      entryIdToTransform,
      get,
      set,
    );
  },

  cancelThinking: () => {
    const { thinkingState } = get();
    const playerId = thinkingState.currentPlayerId;

    // Batch all resets together to minimize re-renders
    set((prev) => ({
      thinkingState: {
        isThinking: false,
        currentPlayerId: null,
        thinkingText: "",
        error: null,
      },
      isProcessing: false,
      lastProcessedTurn: null,
      // Remove any THINKING entry
      actionLog: playerId
        ? prev.actionLog.filter(
            (e) => !(e.playerId === playerId && e.type === "thinking"),
          )
        : prev.actionLog,
    }));
  },

  setIsProcessing: (value) => {
    set({ isProcessing: value });
  },

  setLastProcessedTurn: (turnKey) => {
    set({ lastProcessedTurn: turnKey });
  },

  // Batched action to set both processing state values at once
  setProcessingState: (isProcessing, turnKey) => {
    set({ isProcessing, lastProcessedTurn: turnKey });
  },

  // Game flow phase transitions - validates transitions to prevent invalid states
  transitionTo: (phase) => {
    const { gameState, addDebug } = get();
    if (!gameState) {
      // Allow transition to 'loading' or 'idle' without game state
      if (phase === "loading" || phase === "idle") {
        return;
      }
      return;
    }

    // Update flow phase in game state
    set({
      gameState: {
        ...gameState,
        flowPhase: phase,
      },
    });
    addDebug(`Flow phase: ${phase}`);
  },

  getFlowPhase: () => {
    const { gameState } = get();
    return gameState?.flowPhase ?? "idle";
  },

  // Batched action completion - updates multiple state values in single render
  // Use this instead of calling setIsProcessing, setLastProcessedTurn, setLastAction separately
  completeActionBatch: (playerId, action, flowPhase) => {
    const { gameState } = get();
    if (!gameState) return;

    set({
      gameState: {
        ...gameState,
        flowPhase,
      },
      isProcessing: false,
      lastProcessedTurn: null,
      lastActions: {
        ...get().lastActions,
        [playerId]: action,
      },
    });
  },

  // UI Actions
  addActionLog: (entry) => {
    set((prev) => ({
      actionLog: [
        {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
        ...prev.actionLog,
      ].slice(0, 100),
    }));
  },

  addDebug: (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    set((prev) => ({
      debugLog: [`[${timestamp}] ${msg}`, ...prev.debugLog].slice(
        0,
        DEBUG_LOG_LIMIT,
      ),
    }));
  },

  setLastAction: (playerId, action) => {
    set((prev) => ({
      lastActions: { ...prev.lastActions, [playerId]: action },
    }));
  },

  clearForNextHand: () => {
    set({
      lastActions: {},
      lastProcessedTurn: null,
      isProcessing: false,
    });
  },

  // Selectors
  buildAgentContext: (playerId) => {
    const { gameState } = get();
    if (!gameState) return null;

    const playerState = gameState.playerStates[playerId];
    if (!playerState) return null;

    const totalPlayers = gameState.players.length;
    const dealerIndex = gameState.players.findIndex(
      (p) => gameState.playerStates[p.id].isDealer,
    );

    // Helper to calculate position relative to dealer
    const getPositionLabel = (
      playerIdx: number,
    ): "early" | "middle" | "late" | "blinds" => {
      const pState = gameState.playerStates[gameState.players[playerIdx].id];
      if (pState.isSmallBlind || pState.isBigBlind) {
        return "blinds";
      }
      if (pState.isDealer) {
        return "late";
      }

      // Calculate seats from dealer (dealer is position 0)
      const seatsFromDealer =
        (playerIdx - dealerIndex + totalPlayers) % totalPlayers;

      // In a full table: positions 1-3 from dealer are late, 4-6 middle, 7+ early
      // Scale based on table size
      const lateThreshold = Math.max(1, Math.floor(totalPlayers * 0.3));
      const middleThreshold = Math.max(2, Math.floor(totalPlayers * 0.6));

      if (seatsFromDealer <= lateThreshold) {
        return "late";
      } else if (seatsFromDealer <= middleThreshold) {
        return "middle";
      }
      return "early";
    };

    // Create stable opponent ID to label mapping (alphabetical by original index)
    const opponentPlayers = gameState.players.filter((p) => p.id !== playerId);
    const opponentIdToLabel: Record<string, string> = {};
    opponentPlayers.forEach((p, i) => {
      opponentIdToLabel[p.id] = `Opponent ${String.fromCharCode(65 + i)}`;
    });

    // Anonymize opponents with position info
    const opponents: AnonymizedPokerOpponent[] = opponentPlayers.map((p) => {
      const oppState = gameState.playerStates[p.id];
      const oppIndex = gameState.players.findIndex((pl) => pl.id === p.id);
      return {
        label: opponentIdToLabel[p.id],
        chipStack: oppState.chipStack,
        currentBet: oppState.currentBet,
        status: oppState.status,
        position: getPositionLabel(oppIndex),
        hasActed: oppState.hasActed,
      };
    });

    // Anonymize betting history using stable ID mapping
    const bettingHistory: AnonymizedPokerHistoryEntry[] =
      gameState.actionHistory.map((entry) => {
        if (entry.playerId === playerId) {
          return { ...entry, label: "You" };
        }
        const label = opponentIdToLabel[entry.playerId] || "Unknown";
        return {
          ...entry,
          label,
        };
      });

    // Calculate current player's position
    const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
    const position = getPositionLabel(playerIndex);

    // Count active players yet to act after current player in betting order
    const activePlayers = gameState.players.filter(
      (p) => gameState.playerStates[p.id].status === "active",
    );
    const playerOrderIndex = activePlayers.findIndex((p) => p.id === playerId);
    const playersAfter = activePlayers.filter((p, i) => {
      if (i <= playerOrderIndex) return false;
      return !gameState.playerStates[p.id].hasActed;
    }).length;

    return {
      holeCards: playerState.holeCards,
      communityCards: gameState.communityCards,
      currentPhase: gameState.currentPhase,
      potSize: Object.values(gameState.playerStates).reduce(
        (sum, p) => sum + p.totalBetThisHand,
        0,
      ),
      currentBet: gameState.currentBet,
      minRaise: gameState.minRaise,
      ownChipStack: playerState.chipStack,
      ownCurrentBet: playerState.currentBet,
      amountToCall: Math.max(0, gameState.currentBet - playerState.currentBet),
      position,
      isDealer: playerState.isDealer,
      playersToActAfterMe: playersAfter,
      opponents,
      bettingHistory,
      handNumber: gameState.handNumber,
      totalHands: gameState.totalHands,
    };
  },

  isBettingRoundComplete: () => {
    const { gameState } = get();
    if (!gameState) return false;

    const activePlayers = Object.values(gameState.playerStates).filter(
      (p) => p.status === "active",
    );

    if (activePlayers.length <= 1) return true;

    const allActed = activePlayers.every((p) => p.hasActed);
    const allMatchedBet = activePlayers.every(
      (p) => p.currentBet === gameState.currentBet || p.status === "all-in",
    );

    return allActed && allMatchedBet;
  },

  hasWinnerByFold: () => {
    const { gameState } = get();
    if (!gameState) return null;

    const remaining = Object.values(gameState.playerStates).filter(
      (p) => p.status !== "folded",
    );

    if (remaining.length === 1) {
      return remaining[0].playerId;
    }
    return null;
  },

  isGameOver: () => {
    const { gameState } = get();
    if (!gameState) return false;

    const playersWithChips = Object.values(gameState.playerStates).filter(
      (p) => p.chipStack > 0,
    );

    return (
      playersWithChips.length <= 1 ||
      gameState.handNumber >= gameState.totalHands
    );
  },

  getWinner: () => {
    const { gameState } = get();
    if (!gameState) return null;

    const sorted = Object.values(gameState.playerStates).sort(
      (a, b) => b.chipStack - a.chipStack,
    );

    if (sorted.length > 0) {
      return { playerId: sorted[0].playerId, chipStack: sorted[0].chipStack };
    }
    return null;
  },

  getHandWinners: () => {
    const { currentHandWinners } = get();
    if (currentHandWinners.length === 0) return null;
    return currentHandWinners;
  },

  // Reveal real model identities
  revealModels: () => {
    set({ isRevealed: true });
  },

  // Update odds and hand evaluations for active players
  // Uses Web Worker for Monte Carlo calculation to avoid blocking main thread
  updateOddsAndHands: async () => {
    const { gameState } = get();
    if (!gameState) return;

    const activePlayers = gameState.players.filter((p) => {
      const state = gameState.playerStates[p.id];
      return state && state.status !== "folded" && state.holeCards.length === 2;
    });

    // Calculate odds asynchronously via Web Worker
    let playerOdds: Record<string, PlayerOdds> = {};
    if (activePlayers.length === 1) {
      // Only one player remaining - they have 100% win probability
      playerOdds[activePlayers[0].id] = {
        playerId: activePlayers[0].id,
        winPercentage: 100,
        tiePercentage: 0,
      };
    } else if (activePlayers.length >= 2) {
      try {
        // Non-blocking: runs in Web Worker thread
        const odds = await calculateOddsAsync(
          activePlayers.map((p) => ({
            playerId: p.id,
            holeCards: gameState.playerStates[p.id].holeCards,
          })),
          gameState.communityCards,
        );
        playerOdds = odds.reduce(
          (acc, o) => {
            acc[o.playerId] = o;
            return acc;
          },
          {} as Record<string, PlayerOdds>,
        );
      } catch {
        // Ignore calculation errors
      }
    }

    // Calculate hand evaluations (fast, stays on main thread)
    const playerHands: Record<string, EvaluatedHand> = {};
    if (gameState.communityCards.length >= 3) {
      activePlayers.forEach((p) => {
        const state = gameState.playerStates[p.id];
        if (state.holeCards.length === 2) {
          try {
            playerHands[p.id] = evaluateHand(
              state.holeCards,
              gameState.communityCards,
            );
          } catch {
            // Ignore evaluation errors
          }
        }
      });
    }

    set({ playerOdds, playerHands });
  },

  // Get display name (character name or real model name if revealed)
  getDisplayName: (playerId) => {
    const { isRevealed, characterMap, models } = get();

    // System messages
    if (playerId === "system") return "System";

    // When revealed, show real model name
    if (isRevealed) {
      const model = models.find((m) => m.id === playerId);
      return model?.name || "Unknown";
    }

    // Everyone (including human) uses character name
    return characterMap[playerId]?.name || "Unknown";
  },

  // Get display portrait
  getDisplayPortrait: (playerId) => {
    const { characterMap } = get();

    // Everyone uses character portrait
    return (
      characterMap[playerId]?.portrait || "/assets/portraits/placeholder.svg"
    );
  },

  // Get display color
  getDisplayColor: (playerId) => {
    const { isRevealed, characterMap, models } = get();

    // System messages use neutral color
    if (playerId === "system") return "#666666";

    // When revealed, show real model color
    if (isRevealed) {
      const model = models.find((m) => m.id === playerId);
      return model?.color || "#888888";
    }

    // Everyone uses character color
    return characterMap[playerId]?.color || "#888888";
  },
}));

/**
 * Fetch summary from API then TRANSFORM existing THINKING entry into ACTION entry
 * Called by completeThinking - keeps same list item ID for smooth transition
 *
 * Uses sequence tracking to prevent race conditions when multiple summaries
 * are fetched concurrently - only the latest request updates the UI.
 */
let summarySequence = 0;
const SUMMARY_TIMEOUT_MS = 5000;

async function fetchSummaryAndAddAction(
  playerId: string,
  player: Model,
  actionText: string,
  action: PokerAction,
  thinkingText: string,
  entryIdToTransform: string | undefined,
  get: () => PokerStore,
  set: (
    partial: Partial<PokerStore> | ((state: PokerStore) => Partial<PokerStore>),
  ) => void,
) {
  // Track sequence to prevent race conditions
  const mySequence = ++summarySequence;
  let summary = "";

  try {
    // Add timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

    const response = await fetch("/api/game/summarize-thinking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thinking: thinkingText, action: action.type }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      summary = data.summary?.replace(/^["']|["']$/g, "") || "";
    }
  } catch (error) {
    // Use fallback on error or timeout
    if ((error as Error).name === "AbortError") {
      // Timeout - use quick fallback
      summary = "";
    } else {
      summary = extractThinkingSummary(thinkingText);
    }
  }

  // Only update if this is still the latest request
  // This prevents out-of-order updates when multiple AI players act quickly
  if (mySequence !== summarySequence) {
    return;
  }

  // Transform THINKING entry into ACTION entry (same ID = smooth transition)
  const content = summary ? `${actionText} — "${summary}"` : actionText;

  set((prev: PokerStore) => {
    // If we have an entry to transform, update it in place
    if (entryIdToTransform) {
      return {
        actionLog: prev.actionLog.map((entry) =>
          entry.id === entryIdToTransform
            ? {
                ...entry,
                type: "action" as const,
                content,
                action: action.type,
                amount: action.amount,
                timestamp: Date.now(),
              }
            : entry,
        ),
      };
    }

    // Fallback: add new entry if no entry to transform (shouldn't happen normally)
    return {
      actionLog: [
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          playerId,
          playerName: player.name,
          playerColor: player.color,
          type: "action" as const,
          content,
          action: action.type,
          amount: action.amount,
        },
        ...prev.actionLog,
      ].slice(0, 100),
    };
  });
}

/**
 * Extract a brief summary from AI thinking text (fallback)
 * Prioritizes reasoning about the decision being made
 */
function extractThinkingSummary(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const lowerText = text.toLowerCase();

  // Check what action is being taken
  const isFolding = /action:\s*fold/i.test(text);
  const isRaising = /action:\s*raise/i.test(text);
  const isCalling = /action:\s*call/i.test(text);
  const isChecking = /action:\s*check/i.test(text);

  // Priority keywords based on action
  const foldReasons = [
    "weak hand",
    "not worth",
    "too risky",
    "poor odds",
    "bad position",
    "can't justify",
    "folding",
    "no pair",
    "garbage",
    "junk",
    "unlikely to improve",
    "dominated",
    "behind",
    "losing",
  ];

  const raiseReasons = [
    "strong hand",
    "value bet",
    "bluff",
    "aggression",
    "position advantage",
    "premium",
    "pocket",
    "top pair",
    "monster",
    "nuts",
  ];

  const callReasons = [
    "pot odds",
    "drawing",
    "implied odds",
    "worth calling",
    "see the",
    "might improve",
    "reasonable price",
  ];

  // Find the best reasoning line
  const priorityKeywords = isFolding
    ? foldReasons
    : isRaising
      ? raiseReasons
      : isCalling
        ? callReasons
        : [];

  // First, look for priority keywords
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      priorityKeywords.some((kw) => lower.includes(kw)) &&
      line.length > 15 &&
      line.length < 150
    ) {
      // Clean up the line
      let summary = line.trim();
      // Remove markdown formatting
      summary = summary.replace(/^[#*-]+\s*/, "");
      // Remove "I think" type prefixes
      summary = summary.replace(
        /^(i think|i'll|i will|i should|let me|therefore|so|thus)\s*/i,
        "",
      );
      return summary.slice(0, 120) + (summary.length > 120 ? "..." : "");
    }
  }

  // Look for conclusion/decision phrases
  const conclusionPatterns = [
    /(?:therefore|so|thus|hence|conclusion|decision)[,:]?\s*(.+)/i,
    /(?:i'll|i will|going to|best to)\s+(.+)/i,
    /(?:makes sense to|smart to|wise to)\s+(.+)/i,
  ];

  for (const pattern of conclusionPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length > 10) {
      const summary = match[1].trim().replace(/\.+$/, "");
      return summary.slice(0, 100) + (summary.length > 100 ? "..." : "");
    }
  }

  // General strategy keywords
  const generalKeywords = [
    "should",
    "because",
    "since",
    "given",
    "with",
    "holding",
    "odds",
    "position",
    "stack",
    "opponent",
  ];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      generalKeywords.some((kw) => lower.includes(kw)) &&
      line.length > 20 &&
      line.length < 150
    ) {
      let summary = line.trim().replace(/^[#*-]+\s*/, "");
      return summary.slice(0, 100) + (summary.length > 100 ? "..." : "");
    }
  }

  // Last resort: find any meaningful sentence before the ACTION
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].length > 20 && !lines[i].toUpperCase().includes("ACTION:")) {
      return lines[i].trim().slice(0, 100) + "...";
    }
  }

  // Final fallback
  return text.slice(0, 80) + "...";
}
