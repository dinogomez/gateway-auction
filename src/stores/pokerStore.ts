import { create } from "zustand";
import type {
  Model,
  Card,
  PokerGameState,
  PokerPlayerState,
  PokerAction,
  BettingPhase,
  PokerAgentContext,
  AnonymizedPokerOpponent,
  AnonymizedPokerHistoryEntry,
  EvaluatedHand,
  PokerBettingEntry,
} from "@/types/poker";
import { DEFAULT_POKER_CONFIG } from "@/types/poker";
import { createDeck, shuffleDeck, dealCardsImmutable } from "@/lib/cards";
import { evaluateHand, determineWinners } from "@/lib/hand-evaluator";
import { calculateOdds, type PlayerOdds } from "@/lib/poker-odds";
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
  updateOddsAndHands: () => void;
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
        isSmallBlind: index === 1,
        isBigBlind: index === 2 % players.length,
        hasActed: false,
        lastAction: null,
        position: index,
        isHuman: model.id === humanPlayerId,
      };
    });

    // Post blinds
    const sbPosition = 1 % players.length;
    const bbPosition = 2 % players.length;
    const sbPlayerId = players[sbPosition].id;
    const bbPlayerId = players[bbPosition].id;

    playerStates[sbPlayerId].currentBet = DEFAULT_POKER_CONFIG.smallBlind;
    playerStates[sbPlayerId].totalBetThisHand = DEFAULT_POKER_CONFIG.smallBlind;
    playerStates[sbPlayerId].chipStack -= DEFAULT_POKER_CONFIG.smallBlind;

    playerStates[bbPlayerId].currentBet = DEFAULT_POKER_CONFIG.bigBlind;
    playerStates[bbPlayerId].totalBetThisHand = DEFAULT_POKER_CONFIG.bigBlind;
    playerStates[bbPlayerId].chipStack -= DEFAULT_POKER_CONFIG.bigBlind;

    const firstToAct = (bbPosition + 1) % players.length;

    const newGameState: PokerGameState = {
      id: gameId,
      status: "betting",
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

    // Find next player
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
      },
    });

    get().addDebug(`Advanced to ${nextPhase}`);
  },

  // Resolve showdown
  resolveShowdown: () => {
    const { gameState } = get();
    if (!gameState) return;

    const activePlayers = gameState.players.filter(
      (p) => gameState.playerStates[p.id].status !== "folded",
    );

    if (activePlayers.length === 0) return;

    // Evaluate hands
    const playerHands = activePlayers.map((p) => {
      const state = gameState.playerStates[p.id];
      const hand = evaluateHand(state.holeCards, gameState.communityCards);
      return { playerId: p.id, hand };
    });

    // Determine winners
    const winnerIds = determineWinners(playerHands);

    // Calculate pot
    const totalPot = Object.values(gameState.playerStates).reduce(
      (sum, p) => sum + p.totalBetThisHand,
      0,
    );
    const winAmount = Math.floor(totalPot / winnerIds.length);

    // Update chip stacks
    const updatedPlayerStates = { ...gameState.playerStates };
    winnerIds.forEach((winnerId) => {
      updatedPlayerStates[winnerId] = {
        ...updatedPlayerStates[winnerId],
        chipStack: updatedPlayerStates[winnerId].chipStack + winAmount,
      };
    });

    const winners = winnerIds.map((winnerId) => {
      const hand = playerHands.find((h) => h.playerId === winnerId)?.hand;
      return { playerId: winnerId, amount: winAmount, hand };
    });

    set({
      gameState: {
        ...gameState,
        status: "hand_complete",
        playerStates: updatedPlayerStates,
      },
      currentHandWinners: winners,
    });
  },

  // Award pot to winner (fold victory)
  awardPotToWinner: (winnerId) => {
    const { gameState } = get();
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

    set({
      gameState: {
        ...gameState,
        status: "hand_complete",
        playerStates: updatedPlayerStates,
      },
      currentHandWinners: [{ playerId: winnerId, amount: totalPot }],
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
        isSmallBlind: relativePos === 1,
        isBigBlind: relativePos === 2 % gameState.players.length,
        hasActed: false,
        lastAction: null,
        position: index,
        isHuman: model.id === humanPlayerId,
      };
    });

    // Post blinds
    const sbPosition = (newDealerPosition + 1) % gameState.players.length;
    const bbPosition = (newDealerPosition + 2) % gameState.players.length;
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

    const firstToAct = (bbPosition + 1) % gameState.players.length;

    set({
      gameState: {
        ...gameState,
        status: "betting",
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
          ].slice(0, 100),
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
    fetchSummaryAndAddAction(playerId, player, actionText, action, thinkingText, entryIdToTransform, get, set);
  },

  cancelThinking: () => {
    const { thinkingState } = get();
    const playerId = thinkingState.currentPlayerId;

    set((prev) => ({
      thinkingState: {
        isThinking: false,
        currentPlayerId: null,
        thinkingText: "",
        error: null,
      },
      isProcessing: false,
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
      debugLog: [`[${timestamp}] ${msg}`, ...prev.debugLog].slice(0, 50),
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
    const { gameState, models } = get();
    if (!gameState) return null;

    const playerState = gameState.playerStates[playerId];
    if (!playerState) return null;

    // Anonymize opponents
    const opponents: AnonymizedPokerOpponent[] = gameState.players
      .filter((p) => p.id !== playerId)
      .map((p, i) => ({
        label: `Opponent ${String.fromCharCode(65 + i)}`,
        chipStack: gameState.playerStates[p.id].chipStack,
        currentBet: gameState.playerStates[p.id].currentBet,
        status: gameState.playerStates[p.id].status,
        position: "unknown",
        hasActed: gameState.playerStates[p.id].hasActed,
      }));

    // Anonymize betting history
    const bettingHistory: AnonymizedPokerHistoryEntry[] =
      gameState.actionHistory.map((entry) => {
        if (entry.playerId === playerId) {
          return { ...entry, label: "You" };
        }
        const opponentIndex = gameState.players
          .filter((p) => p.id !== playerId)
          .findIndex((p) => p.id === entry.playerId);
        return {
          ...entry,
          label: `Opponent ${String.fromCharCode(65 + opponentIndex)}`,
        };
      });

    const playerPosition = gameState.players.findIndex(
      (p) => p.id === playerId,
    );
    const playersAfter = gameState.players.filter((p, i) => {
      if (i <= playerPosition) return false;
      return gameState.playerStates[p.id].status === "active";
    }).length;

    let position: "early" | "middle" | "late" | "blinds" = "middle";
    if (playerState.isSmallBlind || playerState.isBigBlind) {
      position = "blinds";
    } else if (playerState.isDealer || playersAfter <= 1) {
      position = "late";
    } else if (playersAfter >= gameState.players.length - 3) {
      position = "early";
    }

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
  updateOddsAndHands: () => {
    const { gameState } = get();
    if (!gameState) return;

    const activePlayers = gameState.players.filter((p) => {
      const state = gameState.playerStates[p.id];
      return state && state.status !== "folded" && state.holeCards.length === 2;
    });

    // Calculate odds
    let playerOdds: Record<string, PlayerOdds> = {};
    if (activePlayers.length >= 2) {
      try {
        const odds = calculateOdds(
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

    // Calculate hand evaluations
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
 */
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
  let summary = "";

  try {
    const response = await fetch("/api/game/summarize-thinking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thinking: thinkingText }),
    });

    if (response.ok) {
      const data = await response.json();
      summary = data.summary?.replace(/^["']|["']$/g, "") || "";
    }
  } catch {
    // Use fallback on error
    summary = extractThinkingSummary(thinkingText);
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
