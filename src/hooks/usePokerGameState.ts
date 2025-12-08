"use client";

import { useState, useCallback } from "react";
import type {
  Model,
  Card,
  PokerGameState,
  PokerPlayerState,
  PokerAction,
  BettingPhase,
  Pot,
  HandResult,
  PokerBettingEntry,
  AgentThinkingState,
  PokerAgentContext,
  AnonymizedPokerOpponent,
  AnonymizedPokerHistoryEntry,
  EvaluatedHand,
} from "@/types/poker";
import { DEFAULT_POKER_CONFIG, HandRank } from "@/types/poker";
import { createDeck, shuffleDeck, dealCardsImmutable } from "@/lib/cards";
import { evaluateHand, determineWinners } from "@/lib/hand-evaluator";
import {
  calculatePots,
  distributePots,
  getTotalPotSize,
} from "@/lib/pot-manager";

/**
 * Main hook for managing poker game state
 */
export function usePokerGameState(
  initialModels: Model[],
  humanPlayerId: string | null,
) {
  const [gameState, setGameState] = useState<PokerGameState | null>(null);

  /**
   * Initialize a new game
   */
  const initializeGame = useCallback(() => {
    const gameId = crypto.randomUUID();
    let deck = shuffleDeck(createDeck());

    // Create player states
    const playerStates: Record<string, PokerPlayerState> = {};
    const players = [...initialModels];

    players.forEach((model, index) => {
      // Deal 2 hole cards
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

    // First to act is after big blind
    const firstToAct = (bbPosition + 1) % players.length;

    const newGameState: PokerGameState = {
      id: gameId,
      status: "betting",
      flowPhase: "dealing",
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
      lastRaiserIndex: bbPosition, // BB is initial "raiser"
      smallBlindAmount: DEFAULT_POKER_CONFIG.smallBlind,
      bigBlindAmount: DEFAULT_POKER_CONFIG.bigBlind,
      handNumber: 1,
      totalHands: DEFAULT_POKER_CONFIG.totalHands,
      handHistory: [],
      actionHistory: [],
      agentThinking: {},
    };

    setGameState(newGameState);
    return newGameState;
  }, [initialModels, humanPlayerId]);

  /**
   * Get the current player who needs to act
   */
  const getCurrentPlayer = useCallback((): Model | null => {
    if (!gameState) return null;
    return gameState.players[gameState.currentPlayerIndex];
  }, [gameState]);

  /**
   * Check if betting round is complete
   */
  const isBettingRoundComplete = useCallback((): boolean => {
    if (!gameState) return false;

    const activePlayers = Object.values(gameState.playerStates).filter(
      (p) => p.status === "active",
    );

    // If only one active player, round is complete
    if (activePlayers.length <= 1) return true;

    // All active players must have acted and matched the current bet
    const allActed = activePlayers.every((p) => p.hasActed);
    const allMatched = activePlayers.every(
      (p) => p.currentBet === gameState.currentBet || p.status === "all-in",
    );

    return allActed && allMatched;
  }, [gameState]);

  /**
   * Process a player action
   */
  const processAction = useCallback((playerId: string, action: PokerAction) => {
    setGameState((prev) => {
      if (!prev) return prev;

      const newPlayerStates = { ...prev.playerStates };
      const player = newPlayerStates[playerId];
      const model = prev.players.find((m) => m.id === playerId);

      if (!player || !model) return prev;

      // Record action
      const actionEntry: PokerBettingEntry = {
        playerId,
        playerName: model.name,
        action: action.type,
        amount: action.amount,
        phase: prev.currentPhase,
        timestamp: Date.now(),
      };

      let newCurrentBet = prev.currentBet;
      let newMinRaise = prev.minRaise;
      let newLastRaiserIndex = prev.lastRaiserIndex;

      switch (action.type) {
        case "fold":
          newPlayerStates[playerId] = {
            ...player,
            status: "folded",
            hasActed: true,
            lastAction: action,
          };
          break;

        case "check":
          newPlayerStates[playerId] = {
            ...player,
            hasActed: true,
            lastAction: action,
          };
          break;

        case "call": {
          const callAmount = prev.currentBet - player.currentBet;
          const actualCall = Math.min(callAmount, player.chipStack);
          newPlayerStates[playerId] = {
            ...player,
            currentBet: player.currentBet + actualCall,
            totalBetThisHand: player.totalBetThisHand + actualCall,
            chipStack: player.chipStack - actualCall,
            hasActed: true,
            lastAction: action,
            status: player.chipStack <= actualCall ? "all-in" : "active",
          };
          break;
        }

        case "raise": {
          const raiseAmount =
            (action.amount || prev.minRaise) - player.currentBet;
          const actualRaise = Math.min(raiseAmount, player.chipStack);
          const newBet = player.currentBet + actualRaise;
          const raiseIncrement = newBet - prev.currentBet;

          newPlayerStates[playerId] = {
            ...player,
            currentBet: newBet,
            totalBetThisHand: player.totalBetThisHand + actualRaise,
            chipStack: player.chipStack - actualRaise,
            hasActed: true,
            lastAction: action,
            status: player.chipStack <= actualRaise ? "all-in" : "active",
          };

          newCurrentBet = newBet;
          newMinRaise = newBet + raiseIncrement;
          newLastRaiserIndex = prev.currentPlayerIndex;

          // Reset hasActed for other players (they need to respond to raise)
          Object.keys(newPlayerStates).forEach((id) => {
            if (id !== playerId && newPlayerStates[id].status === "active") {
              newPlayerStates[id] = {
                ...newPlayerStates[id],
                hasActed: false,
              };
            }
          });
          break;
        }

        case "all-in": {
          const allInAmount = player.chipStack;
          const newBet = player.currentBet + allInAmount;

          newPlayerStates[playerId] = {
            ...player,
            currentBet: newBet,
            totalBetThisHand: player.totalBetThisHand + allInAmount,
            chipStack: 0,
            hasActed: true,
            lastAction: action,
            status: "all-in",
          };

          // If all-in is a raise, update current bet
          if (newBet > prev.currentBet) {
            const raiseIncrement = newBet - prev.currentBet;
            newCurrentBet = newBet;
            newMinRaise = newBet + raiseIncrement;
            newLastRaiserIndex = prev.currentPlayerIndex;

            // Reset hasActed for other players
            Object.keys(newPlayerStates).forEach((id) => {
              if (id !== playerId && newPlayerStates[id].status === "active") {
                newPlayerStates[id] = {
                  ...newPlayerStates[id],
                  hasActed: false,
                };
              }
            });
          }
          break;
        }
      }

      // Find next player to act
      let nextPlayerIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
      let attempts = 0;
      while (attempts < prev.players.length) {
        const nextPlayer = newPlayerStates[prev.players[nextPlayerIndex].id];
        if (nextPlayer.status === "active" && !nextPlayer.hasActed) {
          break;
        }
        nextPlayerIndex = (nextPlayerIndex + 1) % prev.players.length;
        attempts++;
      }

      return {
        ...prev,
        playerStates: newPlayerStates,
        currentBet: newCurrentBet,
        minRaise: newMinRaise,
        lastRaiserIndex: newLastRaiserIndex,
        currentPlayerIndex: nextPlayerIndex,
        actionHistory: [...prev.actionHistory, actionEntry],
      };
    });
  }, []);

  /**
   * Advance to the next betting phase
   */
  const advancePhase = useCallback(() => {
    setGameState((prev) => {
      if (!prev) return prev;

      let newDeck = [...prev.deck];
      let newCommunityCards = [...prev.communityCards];
      let newBurnedCards = [...prev.burnedCards];
      let newPhase: BettingPhase = prev.currentPhase;

      // Burn and deal based on phase
      switch (prev.currentPhase) {
        case "preflop": {
          // Burn 1, deal 3 (flop)
          const { dealt: burn, remaining: afterBurn } = dealCardsImmutable(
            newDeck,
            1,
          );
          const { dealt: flop, remaining: afterFlop } = dealCardsImmutable(
            afterBurn,
            3,
          );
          newBurnedCards.push(...burn);
          newCommunityCards.push(...flop);
          newDeck = afterFlop;
          newPhase = "flop";
          break;
        }
        case "flop": {
          // Burn 1, deal 1 (turn)
          const { dealt: burn, remaining: afterBurn } = dealCardsImmutable(
            newDeck,
            1,
          );
          const { dealt: turn, remaining: afterTurn } = dealCardsImmutable(
            afterBurn,
            1,
          );
          newBurnedCards.push(...burn);
          newCommunityCards.push(...turn);
          newDeck = afterTurn;
          newPhase = "turn";
          break;
        }
        case "turn": {
          // Burn 1, deal 1 (river)
          const { dealt: burn, remaining: afterBurn } = dealCardsImmutable(
            newDeck,
            1,
          );
          const { dealt: river, remaining: afterRiver } = dealCardsImmutable(
            afterBurn,
            1,
          );
          newBurnedCards.push(...burn);
          newCommunityCards.push(...river);
          newDeck = afterRiver;
          newPhase = "river";
          break;
        }
        case "river":
          newPhase = "showdown";
          break;
      }

      // Reset betting state for new round
      const newPlayerStates = { ...prev.playerStates };
      Object.keys(newPlayerStates).forEach((id) => {
        const player = newPlayerStates[id];
        if (player.status === "active") {
          newPlayerStates[id] = {
            ...player,
            currentBet: 0,
            hasActed: false,
          };
        }
      });

      // First to act is first active player after dealer
      let firstToAct = (prev.dealerPosition + 1) % prev.players.length;
      while (newPlayerStates[prev.players[firstToAct].id].status !== "active") {
        firstToAct = (firstToAct + 1) % prev.players.length;
      }

      return {
        ...prev,
        deck: newDeck,
        communityCards: newCommunityCards,
        burnedCards: newBurnedCards,
        currentPhase: newPhase,
        currentBet: 0,
        playerStates: newPlayerStates,
        currentPlayerIndex: firstToAct,
        lastRaiserIndex: null,
        status: newPhase === "showdown" ? "showdown" : "betting",
      };
    });
  }, []);

  /**
   * Resolve showdown and determine winner(s)
   */
  const resolveShowdown = useCallback(() => {
    setGameState((prev) => {
      if (!prev) return prev;

      // Get players who made it to showdown (not folded)
      const showdownPlayers = Object.values(prev.playerStates).filter(
        (p) => p.status !== "folded",
      );

      // Calculate pots
      const pots = calculatePots(prev.playerStates);

      // Evaluate hands
      const playerHands = new Map<string, EvaluatedHand>();
      const showdownData: {
        playerId: string;
        holeCards: Card[];
        hand: EvaluatedHand;
        profit: number;
      }[] = [];

      showdownPlayers.forEach((player) => {
        const hand = evaluateHand(player.holeCards, prev.communityCards);
        playerHands.set(player.playerId, hand);
        showdownData.push({
          playerId: player.playerId,
          holeCards: player.holeCards,
          hand,
          profit: 0, // Will be calculated after pot distribution
        });
      });

      // Distribute pots
      const winnings = distributePots(pots, playerHands);

      // Update player stacks and calculate profits
      const newPlayerStates = { ...prev.playerStates };
      const winners: {
        playerId: string;
        amount: number;
        hand: EvaluatedHand;
      }[] = [];

      winnings.forEach((amount, playerId) => {
        newPlayerStates[playerId] = {
          ...newPlayerStates[playerId],
          chipStack: newPlayerStates[playerId].chipStack + amount,
        };
        winners.push({
          playerId,
          amount,
          hand: playerHands.get(playerId)!,
        });

        // Update profit in showdown data
        const showdownEntry = showdownData.find((s) => s.playerId === playerId);
        if (showdownEntry) {
          showdownEntry.profit =
            amount - newPlayerStates[playerId].totalBetThisHand;
        }
      });

      // Create hand result
      const handResult: HandResult = {
        handNumber: prev.handNumber,
        winners,
        potAmount: getTotalPotSize(pots),
        communityCards: prev.communityCards,
        showdownPlayers: showdownData,
      };

      return {
        ...prev,
        playerStates: newPlayerStates,
        pots,
        status: "hand_complete",
        handHistory: [...prev.handHistory, handResult],
      };
    });
  }, []);

  /**
   * Start the next hand
   */
  const startNextHand = useCallback(() => {
    setGameState((prev) => {
      if (!prev) return prev;

      // Check if game is over
      if (prev.handNumber >= prev.totalHands) {
        return {
          ...prev,
          status: "game_over",
        };
      }

      // Rotate dealer
      const newDealerPosition = (prev.dealerPosition + 1) % prev.players.length;
      const newSBPosition = (newDealerPosition + 1) % prev.players.length;
      const newBBPosition = (newDealerPosition + 2) % prev.players.length;

      // Create fresh deck
      let deck = shuffleDeck(createDeck());

      // Deal new hole cards and reset player states
      const newPlayerStates: Record<string, PokerPlayerState> = {};

      prev.players.forEach((model, index) => {
        const oldState = prev.playerStates[model.id];

        // Skip eliminated players
        if (oldState.chipStack <= 0) {
          newPlayerStates[model.id] = {
            ...oldState,
            status: "sitting-out",
            holeCards: [],
            currentBet: 0,
            totalBetThisHand: 0,
            hasActed: true,
            isDealer: false,
            isSmallBlind: false,
            isBigBlind: false,
          };
          return;
        }

        // Deal 2 hole cards
        const { dealt, remaining } = dealCardsImmutable(deck, 2);
        deck = remaining;

        newPlayerStates[model.id] = {
          playerId: model.id,
          holeCards: dealt,
          chipStack: oldState.chipStack,
          currentBet: 0,
          totalBetThisHand: 0,
          status: "active",
          isDealer: index === newDealerPosition,
          isSmallBlind: index === newSBPosition,
          isBigBlind: index === newBBPosition,
          hasActed: false,
          lastAction: null,
          position: index,
          isHuman: model.id === prev.humanPlayerId,
        };
      });

      // Post blinds
      const sbPlayerId = prev.players[newSBPosition].id;
      const bbPlayerId = prev.players[newBBPosition].id;

      if (newPlayerStates[sbPlayerId].status === "active") {
        const sbAmount = Math.min(
          prev.smallBlindAmount,
          newPlayerStates[sbPlayerId].chipStack,
        );
        newPlayerStates[sbPlayerId].currentBet = sbAmount;
        newPlayerStates[sbPlayerId].totalBetThisHand = sbAmount;
        newPlayerStates[sbPlayerId].chipStack -= sbAmount;
        if (newPlayerStates[sbPlayerId].chipStack === 0) {
          newPlayerStates[sbPlayerId].status = "all-in";
        }
      }

      if (newPlayerStates[bbPlayerId].status === "active") {
        const bbAmount = Math.min(
          prev.bigBlindAmount,
          newPlayerStates[bbPlayerId].chipStack,
        );
        newPlayerStates[bbPlayerId].currentBet = bbAmount;
        newPlayerStates[bbPlayerId].totalBetThisHand = bbAmount;
        newPlayerStates[bbPlayerId].chipStack -= bbAmount;
        if (newPlayerStates[bbPlayerId].chipStack === 0) {
          newPlayerStates[bbPlayerId].status = "all-in";
        }
      }

      // First to act is after big blind
      let firstToAct = (newBBPosition + 1) % prev.players.length;
      while (newPlayerStates[prev.players[firstToAct].id].status !== "active") {
        firstToAct = (firstToAct + 1) % prev.players.length;
      }

      return {
        ...prev,
        status: "betting",
        playerStates: newPlayerStates,
        dealerPosition: newDealerPosition,
        smallBlindPosition: newSBPosition,
        bigBlindPosition: newBBPosition,
        currentPlayerIndex: firstToAct,
        deck,
        communityCards: [],
        burnedCards: [],
        currentPhase: "preflop",
        currentBet: prev.bigBlindAmount,
        minRaise: prev.bigBlindAmount * 2,
        pots: [],
        lastRaiserIndex: newBBPosition,
        handNumber: prev.handNumber + 1,
        actionHistory: [],
        agentThinking: {},
      };
    });
  }, []);

  /**
   * Build context for AI agent decision making
   */
  const buildAgentContext = useCallback(
    (playerId: string): PokerAgentContext | null => {
      if (!gameState) return null;

      const player = gameState.playerStates[playerId];
      if (!player) return null;

      // Anonymize opponents
      const opponents: AnonymizedPokerOpponent[] = [];
      gameState.players.forEach((model, index) => {
        if (model.id === playerId) return;
        const state = gameState.playerStates[model.id];
        opponents.push({
          label: `Opponent ${String.fromCharCode(65 + opponents.length)}`,
          chipStack: state.chipStack,
          currentBet: state.currentBet,
          status: state.status,
          position: getPositionName(
            index,
            gameState.players.length,
            gameState.dealerPosition,
          ),
          hasActed: state.hasActed,
        });
      });

      // Anonymize betting history
      const bettingHistory: AnonymizedPokerHistoryEntry[] =
        gameState.actionHistory.map((entry) => {
          let label = "You";
          if (entry.playerId !== playerId) {
            const oppIndex = gameState.players.findIndex(
              (m) => m.id === entry.playerId,
            );
            const adjustedIndex = gameState.players
              .filter((m) => m.id !== playerId)
              .findIndex((m) => m.id === entry.playerId);
            label = `Opponent ${String.fromCharCode(65 + adjustedIndex)}`;
          }
          return {
            label,
            action: entry.action,
            amount: entry.amount,
            phase: entry.phase,
          };
        });

      // Calculate position
      const playerIndex = gameState.players.findIndex((m) => m.id === playerId);
      const position = getPositionName(
        playerIndex,
        gameState.players.length,
        gameState.dealerPosition,
      );

      // Count players to act after
      let playersToActAfter = 0;
      for (let i = 1; i < gameState.players.length; i++) {
        const idx =
          (gameState.currentPlayerIndex + i) % gameState.players.length;
        const state = gameState.playerStates[gameState.players[idx].id];
        if (state.status === "active" && !state.hasActed) {
          playersToActAfter++;
        }
      }

      return {
        holeCards: player.holeCards,
        communityCards: gameState.communityCards,
        currentPhase: gameState.currentPhase,
        potSize: getTotalPotSize(calculatePots(gameState.playerStates)),
        currentBet: gameState.currentBet,
        minRaise: gameState.minRaise,
        ownChipStack: player.chipStack,
        ownCurrentBet: player.currentBet,
        amountToCall: gameState.currentBet - player.currentBet,
        position: position as "early" | "middle" | "late" | "blinds",
        isDealer: player.isDealer,
        playersToActAfterMe: playersToActAfter,
        opponents,
        bettingHistory,
        handNumber: gameState.handNumber,
        totalHands: gameState.totalHands,
      };
    },
    [gameState],
  );

  /**
   * Set agent thinking state
   */
  const setAgentThinking = useCallback(
    (playerId: string, state: Partial<AgentThinkingState>) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const existingState = prev.agentThinking[playerId] || {
          modelId: playerId,
          phase: "waiting" as const,
          thoughts: "",
          action: null,
          isStreaming: false,
        };
        return {
          ...prev,
          agentThinking: {
            ...prev.agentThinking,
            [playerId]: {
              ...existingState,
              ...state,
            },
          },
        };
      });
    },
    [],
  );

  /**
   * Check if only one player remains (everyone else folded)
   */
  const hasWinnerByFold = useCallback((): string | null => {
    if (!gameState) return null;

    const activePlayers = Object.values(gameState.playerStates).filter(
      (p) => p.status === "active" || p.status === "all-in",
    );

    if (activePlayers.length === 1) {
      return activePlayers[0].playerId;
    }

    return null;
  }, [gameState]);

  /**
   * Award pot to winner by fold
   */
  const awardPotToWinner = useCallback((winnerId: string) => {
    setGameState((prev) => {
      if (!prev) return prev;

      // Calculate pot
      const pots = calculatePots(prev.playerStates);
      const totalPot = getTotalPotSize(pots);

      // Update winner's stack
      const newPlayerStates = { ...prev.playerStates };
      newPlayerStates[winnerId] = {
        ...newPlayerStates[winnerId],
        chipStack: newPlayerStates[winnerId].chipStack + totalPot,
      };

      // Create hand result (no showdown - won by fold)
      const handResult: HandResult = {
        handNumber: prev.handNumber,
        winners: [
          {
            playerId: winnerId,
            amount: totalPot,
            hand: {
              rank: HandRank.HIGH_CARD, // Placeholder - won by fold, not showdown
              rankName: "Win by fold",
              cards: [],
              kickers: [],
              score: 0,
              description: "All opponents folded",
            },
          },
        ],
        potAmount: totalPot,
        communityCards: prev.communityCards,
        showdownPlayers: [],
      };

      return {
        ...prev,
        playerStates: newPlayerStates,
        pots,
        status: "hand_complete",
        handHistory: [...prev.handHistory, handResult],
      };
    });
  }, []);

  /**
   * Check if the game is over (all hands played or only one player with chips)
   */
  const isGameOver = useCallback((): boolean => {
    if (!gameState) return false;

    // Check if all hands are played
    if (gameState.status === "game_over") return true;

    // Check if only one player has chips
    const playersWithChips = Object.values(gameState.playerStates).filter(
      (p) => p.chipStack > 0,
    );

    return playersWithChips.length <= 1;
  }, [gameState]);

  /**
   * Get the winner of the game (player with most chips or last standing)
   */
  const getWinner = useCallback((): {
    playerId: string;
    chipStack: number;
  } | null => {
    if (!gameState) return null;

    const playersWithChips = Object.values(gameState.playerStates)
      .filter((p) => p.chipStack > 0)
      .sort((a, b) => b.chipStack - a.chipStack);

    if (playersWithChips.length === 0) return null;

    return {
      playerId: playersWithChips[0].playerId,
      chipStack: playersWithChips[0].chipStack,
    };
  }, [gameState]);

  /**
   * Get showdown results for display
   */
  const getShowdownResults = useCallback(() => {
    if (!gameState || gameState.handHistory.length === 0) return null;

    const lastHand = gameState.handHistory[gameState.handHistory.length - 1];
    return lastHand.showdownPlayers;
  }, [gameState]);

  /**
   * Get hand winners for display
   */
  const getHandWinners = useCallback(() => {
    if (!gameState || gameState.handHistory.length === 0) return null;

    const lastHand = gameState.handHistory[gameState.handHistory.length - 1];
    return lastHand.winners;
  }, [gameState]);

  return {
    gameState,
    initializeGame,
    getCurrentPlayer,
    isBettingRoundComplete,
    processAction,
    advancePhase,
    resolveShowdown,
    startNextHand,
    buildAgentContext,
    setAgentThinking,
    hasWinnerByFold,
    awardPotToWinner,
    isGameOver,
    getWinner,
    getShowdownResults,
    getHandWinners,
  };
}

/**
 * Get position name based on seat index
 */
function getPositionName(
  seatIndex: number,
  totalPlayers: number,
  dealerPosition: number,
): string {
  const relativePosition =
    (seatIndex - dealerPosition + totalPlayers) % totalPlayers;

  if (relativePosition === 0) return "late"; // Dealer
  if (relativePosition === 1) return "blinds"; // Small blind
  if (relativePosition === 2) return "blinds"; // Big blind

  const playersAfterBlinds = totalPlayers - 3;
  const earlyCount = Math.floor(playersAfterBlinds / 3);
  const middleCount = Math.floor(playersAfterBlinds / 3);

  const positionAfterBlinds = relativePosition - 3;

  if (positionAfterBlinds < earlyCount) return "early";
  if (positionAfterBlinds < earlyCount + middleCount) return "middle";
  return "late";
}
