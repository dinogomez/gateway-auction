"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import NumberFlow from "@number-flow/react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

import { usePokerStore } from "@/stores/pokerStore";
import { usePokerThinking } from "@/hooks/usePokerThinking";
import { useSounds } from "@/hooks/useSounds";
import type { PokerAction } from "@/types/poker";
import { HAND_RANK_NAMES, DEFAULT_POKER_CONFIG } from "@/types/poker";
import { getOddsColorClass } from "@/lib/poker-odds";

import { BettingControls } from "@/components/poker";
import { Card } from "@/components/poker/Card";
import { cn } from "@/lib/utils";

export default function PokerGamePage() {
  const router = useRouter();
  const { play, stopAll } = useSounds();

  // Zustand store selectors
  const {
    gameState,
    models,
    humanPlayerId,
    actionLog,
    debugLog,
    lastActions,
    thinkingState,
    isProcessing,
    lastProcessedTurn,
    currentHandWinners,
    displayOrder,
    isRevealed,
    playerOdds,
    playerHands,
    characterMap,
  } = usePokerStore(
    useShallow((state) => ({
      gameState: state.gameState,
      models: state.models,
      humanPlayerId: state.humanPlayerId,
      actionLog: state.actionLog,
      debugLog: state.debugLog,
      lastActions: state.lastActions,
      thinkingState: state.thinkingState,
      isProcessing: state.isProcessing,
      lastProcessedTurn: state.lastProcessedTurn,
      currentHandWinners: state.currentHandWinners,
      displayOrder: state.displayOrder,
      isRevealed: state.isRevealed,
      playerOdds: state.playerOdds,
      playerHands: state.playerHands,
      characterMap: state.characterMap,
    })),
  );

  // Zustand store actions
  const {
    setModels,
    initializeGame,
    processAction,
    advancePhase,
    resolveShowdown,
    awardPotToWinner,
    startNextHand,
    cancelThinking: cancelThinkingStore,
    setIsProcessing,
    setLastProcessedTurn,
    addActionLog,
    addDebug,
    setLastAction,
    clearForNextHand,
    buildAgentContext,
    isBettingRoundComplete,
    hasWinnerByFold,
    isGameOver,
    getWinner,
    getHandWinners,
    revealModels,
    updateOddsAndHands,
    getDisplayName,
    getDisplayPortrait,
    getDisplayColor,
  } = usePokerStore();

  // Track initialization
  const isInitializedRef = useRef(false);
  const gameStartedRef = useRef(false);

  // Abort controller for AI turns to prevent race conditions
  const aiTurnAbortRef = useRef<AbortController | null>(null);
  const actionDelayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown for next hand
  const [nextHandCountdown, setNextHandCountdown] = useState<number | null>(
    null,
  );

  // Loading screen state - separate from gameState to allow exit animation
  const [showLoading, setShowLoading] = useState(true);

  // Scoreboard visibility toggle (for after game ends)
  const [showScoreboard, setShowScoreboard] = useState(true);

  // Turn timer (30 seconds)
  const [turnTimer, setTurnTimer] = useState<number>(30);
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track chip changes for visual indicators
  const [chipChanges, setChipChanges] = useState<
    Record<string, { amount: number; percent: number; key: number }>
  >({});
  const prevChipStacks = useRef<Record<string, number>>({});
  const changeKeyRef = useRef(0);
  const chipChangeTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  // Detect chip changes and update indicators
  useEffect(() => {
    if (!gameState?.playerStates) return;

    const newChanges: Record<
      string,
      { amount: number; percent: number; key: number }
    > = {};

    for (const [playerId, state] of Object.entries(gameState.playerStates)) {
      const prevStack = prevChipStacks.current[playerId];
      const currentStack = state.chipStack;

      // Only track if we have a previous value and it changed
      if (prevStack !== undefined && prevStack !== currentStack) {
        const change = currentStack - prevStack;
        const percent =
          prevStack > 0 ? Math.round((change / prevStack) * 100) : 0;
        changeKeyRef.current += 1;
        newChanges[playerId] = {
          amount: change,
          percent,
          key: changeKeyRef.current,
        };
      }
    }

    // Update previous stacks
    for (const [playerId, state] of Object.entries(gameState.playerStates)) {
      prevChipStacks.current[playerId] = state.chipStack;
    }

    // Merge new changes
    if (Object.keys(newChanges).length > 0) {
      setChipChanges((prev) => ({ ...prev, ...newChanges }));

      // Clear changes after animation (2.5s) - track timer for cleanup
      const changeKeys = Object.values(newChanges).map((n) => n.key);
      const timerId = setTimeout(() => {
        setChipChanges((prev) => {
          const filtered = { ...prev };
          for (const playerId of Object.keys(newChanges)) {
            if (filtered[playerId]?.key === newChanges[playerId].key) {
              delete filtered[playerId];
            }
          }
          return filtered;
        });
        // Clean up timer references
        for (const key of changeKeys) {
          chipChangeTimersRef.current.delete(key);
        }
      }, 2500);

      // Store timer reference for cleanup
      for (const key of changeKeys) {
        chipChangeTimersRef.current.set(key, timerId);
      }
    }

    // Cleanup on unmount
    return () => {
      for (const timer of chipChangeTimersRef.current.values()) {
        clearTimeout(timer);
      }
      chipChangeTimersRef.current.clear();
    };
  }, [gameState?.playerStates]);

  // AI thinking hook - thin wrapper that uses store directly
  const { processAITurn, cancelThinking: cancelAIThinking } = usePokerThinking();

  // Load models from session storage (runs once on mount)
  useEffect(() => {
    // Reset refs on mount to allow fresh game
    isInitializedRef.current = false;
    gameStartedRef.current = false;

    const stored = sessionStorage.getItem("selectedModels");
    const humanMode = sessionStorage.getItem("pokerHumanMode");

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const humanId = humanMode === "true" ? "human-player" : null;
        const allPlayers = humanId
          ? [
              {
                id: humanId,
                name: "You",
                color: "#FFD700",
                tier: "premium" as const,
              },
              ...parsed,
            ]
          : parsed;

        setModels(allPlayers, humanId);
        isInitializedRef.current = true;
        addDebug(`Loaded ${allPlayers.length} players`);
      } catch (e) {
        console.error("Failed to parse models:", e);
        router.push("/");
      }
    } else {
      router.push("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Initialize game when models are loaded (with delay to show loading screen)
  useEffect(() => {
    if (models.length >= 2 && !gameStartedRef.current && !gameState) {
      gameStartedRef.current = true;

      const timers: NodeJS.Timeout[] = [];

      // After 3.5s, start exit animation
      timers.push(
        setTimeout(() => {
          setShowLoading(false);
        }, 3500),
      );

      // After exit animation (0.5s), initialize game
      timers.push(
        setTimeout(() => {
          initializeGame();
          play("roundStart");
          addActionLog({
            playerId: "system",
            playerName: "System",
            playerColor: "#666",
            type: "system",
            content: "Game started - Hand 1",
          });
        }, 4000),
      );

      return () => timers.forEach(clearTimeout);
    }
  }, [models, gameState, initializeGame, play, addActionLog]);

  // Process AI turn when it's their turn
  useEffect(() => {
    if (!gameState || gameState.status !== "betting") return;
    if (isProcessing) return;
    if (thinkingState.isThinking) return;

    // Stop if game is over
    if (isGameOver()) return;

    // Check if there's already a winner by fold - don't start new AI turn
    const foldWinner = hasWinnerByFold();
    if (foldWinner) {
      addDebug(`Fold winner detected: ${foldWinner}, skipping AI turn`);
      return;
    }

    // Check if betting round is complete
    if (isBettingRoundComplete()) {
      addDebug(`Betting round complete, skipping AI turn`);
      return;
    }

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) {
      addDebug(`No current player at index ${gameState.currentPlayerIndex}`);
      return;
    }

    if (currentPlayer.id === humanPlayerId) return;

    const playerState = gameState.playerStates[currentPlayer.id];
    if (!playerState || playerState.status !== "active") {
      addDebug(`${currentPlayer.name} not active: ${playerState?.status}`);
      return;
    }

    if (playerState.hasActed) {
      addDebug(`${currentPlayer.name} already acted, skipping`);
      return;
    }

    const turnKey = `${gameState.handNumber}-${gameState.currentPhase}-${currentPlayer.id}-${gameState.currentPlayerIndex}`;

    if (lastProcessedTurn === turnKey) return;

    const context = buildAgentContext(currentPlayer.id);
    if (context) {
      // Cancel any in-progress AI turn before starting new one
      if (aiTurnAbortRef.current) {
        aiTurnAbortRef.current.abort();
      }
      aiTurnAbortRef.current = new AbortController();
      const currentAbort = aiTurnAbortRef.current;

      setIsProcessing(true);
      setLastProcessedTurn(turnKey);

      addDebug(`>>> Starting turn for ${currentPlayer.name}`);

      processAITurn(currentPlayer, context)
        .then((action) => {
          // Only proceed if this turn wasn't aborted
          if (currentAbort.signal.aborted || !action) return;

          addDebug(`Turn completed for ${currentPlayer.name}: ${action.type}`);

          // Play sound for action
          if (action.type === "raise" || action.type === "all-in") {
            play("bid");
          } else if (action.type === "fold") {
            play("fold");
          }

          // Clear any existing delay timer
          if (actionDelayTimerRef.current) {
            clearTimeout(actionDelayTimerRef.current);
          }

          // Delay before allowing next turn (let animations complete)
          actionDelayTimerRef.current = setTimeout(() => {
            setIsProcessing(false);
            setLastProcessedTurn(null);
            actionDelayTimerRef.current = null;
          }, 1500);
        })
        .catch((err) => {
          // Ignore abort errors
          if (err?.name === "AbortError" || currentAbort.signal.aborted) {
            addDebug(`Turn aborted for ${currentPlayer.name}`);
            return;
          }
          console.error(`processAITurn failed:`, err);
          setIsProcessing(false);
          setLastProcessedTurn(null);
        });
    } else {
      addDebug(`Failed to build context for ${currentPlayer.name}`);
    }
  }, [
    gameState,
    humanPlayerId,
    isProcessing,
    thinkingState.isThinking,
    lastProcessedTurn,
    buildAgentContext,
    processAITurn,
    setIsProcessing,
    setLastProcessedTurn,
    addDebug,
    hasWinnerByFold,
    isBettingRoundComplete,
    isGameOver,
    play,
  ]);

  // Turn timer - reset on new turn, auto-action on timeout
  useEffect(() => {
    // Clear existing timer
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }

    // Only run timer during betting
    if (!gameState || gameState.status !== "betting") {
      setTurnTimer(30);
      return;
    }

    // Reset timer to 30 for new turn
    setTurnTimer(30);

    // Start countdown
    turnTimerRef.current = setInterval(() => {
      setTurnTimer((prev) => {
        if (prev <= 1) {
          // Time's up - auto-action
          if (turnTimerRef.current) {
            clearInterval(turnTimerRef.current);
            turnTimerRef.current = null;
          }

          const currentPlayer = gameState.players[gameState.currentPlayerIndex];
          if (currentPlayer && currentPlayer.id !== humanPlayerId) {
            const playerState = gameState.playerStates[currentPlayer.id];

            // Cancel thinking if in progress
            if (thinkingState.isThinking) {
              cancelAIThinking();
              setIsProcessing(false);
              setLastProcessedTurn(null);
            }

            // Auto-check if possible, otherwise fold
            const canCheck = playerState.currentBet >= gameState.currentBet;
            const autoAction = canCheck
              ? { type: "check" as const }
              : { type: "fold" as const };

            addDebug(`TIMEOUT: ${currentPlayer.name} auto-${autoAction.type}`);
            setLastAction(currentPlayer.id, { action: autoAction.type });
            processAction(currentPlayer.id, autoAction);

            addActionLog({
              playerId: currentPlayer.id,
              playerName: currentPlayer.name,
              playerColor: currentPlayer.color,
              type: "action",
              content: `${autoAction.type.toUpperCase()} — Timed out`,
              action: autoAction.type,
            });
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (turnTimerRef.current) {
        clearInterval(turnTimerRef.current);
        turnTimerRef.current = null;
      }
    };
  }, [gameState?.currentPlayerIndex, gameState?.status, gameState?.handNumber]);

  // Check for betting round completion
  useEffect(() => {
    if (!gameState || gameState.status !== "betting") return;

    // Stop if game is over
    if (isGameOver()) return;

    const foldWinner = hasWinnerByFold();
    if (foldWinner) {
      addDebug(`Winner by fold: ${foldWinner}`);

      // Cancel any in-progress thinking
      if (thinkingState.isThinking) {
        cancelAIThinking();
        setIsProcessing(false);
      }

      const timer = setTimeout(() => {
        awardPotToWinner(foldWinner);
        play("winProfit");
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Only check betting complete if not thinking
    if (thinkingState.isThinking || isProcessing) return;

    const bettingComplete = isBettingRoundComplete();
    if (bettingComplete) {
      addDebug(
        `Betting round complete, advancing from ${gameState.currentPhase}`,
      );
      addActionLog({
        playerId: "system",
        playerName: "System",
        playerColor: "#666",
        type: "phase",
        content: `${gameState.currentPhase.toUpperCase()} complete`,
      });
      const timer = setTimeout(() => {
        setLastProcessedTurn(null);
        advancePhase();
        if (gameState.currentPhase !== "river") {
          play("rankChange");
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [
    gameState,
    thinkingState.isThinking,
    isProcessing,
    isBettingRoundComplete,
    hasWinnerByFold,
    awardPotToWinner,
    advancePhase,
    setLastProcessedTurn,
    play,
    addDebug,
    addActionLog,
    cancelAIThinking,
    setIsProcessing,
    isGameOver,
  ]);

  // Handle showdown
  useEffect(() => {
    if (!gameState || gameState.status !== "showdown") return;

    addDebug("Showdown - resolving hands");
    const timer = setTimeout(() => {
      resolveShowdown();
    }, 2000);

    return () => clearTimeout(timer);
  }, [gameState?.status, resolveShowdown, addDebug]);

  // Update odds and hands when game state changes
  useEffect(() => {
    if (!gameState) return;
    updateOddsAndHands();
  }, [gameState?.communityCards, gameState?.playerStates, updateOddsAndHands]);

  // Reveal models when game is over
  useEffect(() => {
    if (isGameOver() && !isRevealed) {
      revealModels();
    }
  }, [isGameOver, isRevealed, revealModels]);

  // Cancel any in-progress thinking when game ends
  useEffect(() => {
    if (isGameOver() && thinkingState.isThinking) {
      cancelAIThinking();
      setIsProcessing(false);
    }
  }, [isGameOver, thinkingState.isThinking, cancelAIThinking, setIsProcessing]);

  // Handle human player action
  const handleHumanAction = useCallback(
    (action: PokerAction) => {
      if (!humanPlayerId || !gameState) return;

      setLastAction(humanPlayerId, {
        action: action.type,
        amount: action.amount,
      });

      processAction(humanPlayerId, action);

      if (action.type === "raise" || action.type === "all-in") {
        play("bid");
      } else if (action.type === "fold") {
        play("fold");
      }
    },
    [humanPlayerId, gameState, setLastAction, processAction, play],
  );

  // Handle next hand
  const handleNextHand = useCallback(() => {
    clearForNextHand();
    startNextHand();
    play("roundStart");
    addDebug("Starting next hand");
    addActionLog({
      playerId: "system",
      playerName: "System",
      playerColor: "#666",
      type: "system",
      content: `Hand ${(gameState?.handNumber || 0) + 1} started`,
    });
  }, [
    clearForNextHand,
    startNextHand,
    play,
    addDebug,
    addActionLog,
    gameState?.handNumber,
  ]);

  // Auto-advance to next hand with countdown
  useEffect(() => {
    if (!gameState) return;

    // Reset countdown when not in hand_complete state
    if (gameState.status !== "hand_complete") {
      setNextHandCountdown(null);
      return;
    }

    // Don't auto-advance if game is over
    if (gameState.handNumber >= gameState.totalHands) {
      setNextHandCountdown(null);
      return;
    }

    // Start countdown at 3, then 2, then 1, then advance
    setNextHandCountdown(3);

    const timers: NodeJS.Timeout[] = [];

    // Count down: 3 -> 2 -> 1 -> advance
    timers.push(setTimeout(() => setNextHandCountdown(2), 1000));
    timers.push(setTimeout(() => setNextHandCountdown(1), 2000));
    timers.push(
      setTimeout(() => {
        setNextHandCountdown(null);
        handleNextHand();
      }, 3000),
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [
    gameState?.status,
    gameState?.handNumber,
    gameState?.totalHands,
    handleNextHand,
  ]);

  // Handle back to home
  const handleBackToHome = useCallback(() => {
    stopAll();
    cancelAIThinking();
    // Clean up abort controller
    if (aiTurnAbortRef.current) {
      aiTurnAbortRef.current.abort();
      aiTurnAbortRef.current = null;
    }
    // Clean up action delay timer
    if (actionDelayTimerRef.current) {
      clearTimeout(actionDelayTimerRef.current);
      actionDelayTimerRef.current = null;
    }
    // Clean up chip change timers
    for (const timer of chipChangeTimersRef.current.values()) {
      clearTimeout(timer);
    }
    chipChangeTimersRef.current.clear();
    sessionStorage.removeItem("selectedModels");
    sessionStorage.removeItem("pokerHumanMode");
    router.push("/");
  }, [stopAll, cancelAIThinking, router]);

  // Calculate if it's human's turn
  const isHumanTurn = useMemo(() => {
    if (!gameState || !humanPlayerId) return false;
    if (gameState.status !== "betting") return false;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    return currentPlayer?.id === humanPlayerId;
  }, [gameState, humanPlayerId]);

  const humanState = humanPlayerId
    ? gameState?.playerStates[humanPlayerId]
    : null;

  // Calculate current pot size
  const currentPotSize = useMemo(() => {
    if (!gameState) return 0;
    if (gameState.pots.length > 0) {
      return gameState.pots.reduce((sum, p) => sum + p.amount, 0);
    }
    return Object.values(gameState.playerStates).reduce(
      (sum, p) => sum + p.totalBetThisHand,
      0,
    );
  }, [gameState]);

  // Pre-generate random card positions for loading screen (memoized)
  // Uses native sprite dimensions (97x129)
  const loadingCardPositions = useMemo(() => {
    const jokerIndex = Math.floor(Math.random() * 5);
    return [0, 1, 2, 3, 4].map((index) => {
      if (index === jokerIndex) {
        return { x: -14 * 97, y: 0 }; // Joker
      }
      const col = 1 + Math.floor(Math.random() * 13);
      const row = Math.floor(Math.random() * 4);
      return { x: -col * 97, y: -row * 129 };
    });
  }, []);

  // Loading screen sprite dimensions (native size for larger cards)
  const loadingScale = 1; // Native 97x129 size
  const loadingSpriteWidth = 97 * 15 * loadingScale;
  const loadingSpriteHeight = 129 * 4 * loadingScale;

  // Game state derived values (only when game is active)
  const currentPhase = gameState?.currentPhase;
  const isShowdown = gameState?.status === "showdown";
  const isHandComplete = gameState?.status === "hand_complete";
  const isGameFinished = isGameOver();
  const isSpectating = humanPlayerId === null;
  const currentPlayer = gameState?.players[gameState.currentPlayerIndex];

  // Pad community cards to always show 5 slots
  const communityCardSlots = useMemo(() => {
    if (!gameState) return [];
    const slots = [...gameState.communityCards];
    while (slots.length < 5) {
      slots.push(null as any);
    }
    return slots;
  }, [gameState?.communityCards]);

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Loading Screen with Exit Animation */}
      <AnimatePresence>
        {showLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-100 gap-6"
          >
            <motion.div
              className="flex gap-3"
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20, rotateZ: -5 + i * 2.5 }}
                  animate={{
                    opacity: 1,
                    y: [0, -8, 0],
                    rotateZ: -5 + i * 2.5,
                    rotateY: [0, 0, 90, 90, 0, 0],
                  }}
                  transition={{
                    opacity: { duration: 0.3, delay: i * 0.1 },
                    y: {
                      duration: 1.5,
                      delay: i * 0.15,
                      repeat: Infinity,
                      ease: "easeInOut",
                    },
                    rotateY: {
                      duration: 1.2,
                      delay: 1.2 + i * 0.15,
                      times: [0, 0.4, 0.5, 0.6, 1],
                      repeat: 0,
                    },
                  }}
                  className="w-[97px] h-[129px] border border-neutral-900"
                  style={{
                    backgroundImage: "url(/assets/cards/playing_cards.png)",
                    backgroundSize: `${loadingSpriteWidth}px ${loadingSpriteHeight}px`,
                    imageRendering: "pixelated",
                    perspective: "1000px",
                  }}
                >
                  <motion.div
                    className="w-full h-full"
                    initial={{ backgroundPosition: "0px 0px" }}
                    animate={{
                      backgroundPosition: [
                        "0px 0px",
                        "0px 0px",
                        `${loadingCardPositions[i].x}px ${loadingCardPositions[i].y}px`,
                      ],
                    }}
                    transition={{
                      duration: 0.01,
                      delay: 1.2 + 0.6 + i * 0.15, // Change at midpoint of flip (when card is edge-on)
                      times: [0, 0.99, 1],
                    }}
                    style={{
                      backgroundImage: "url(/assets/cards/playing_cards.png)",
                      backgroundSize: `${loadingSpriteWidth}px ${loadingSpriteHeight}px`,
                      imageRendering: "pixelated",
                    }}
                  />
                </motion.div>
              ))}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5 }}
              className="text-neutral-700 font-mono text-sm"
            >
              Shuffling Deck
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Content - render after loading */}
      {gameState && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="p-4"
        >
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handleBackToHome}
                className="text-sm text-neutral-700 hover:text-neutral-900 transition-colors font-mono"
              >
                ← EXIT
              </button>
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-neutral-700 px-3 py-1 border border-neutral-900">
                  HAND {gameState.handNumber}/{gameState.totalHands}
                </span>
                <span className="text-xs font-mono text-neutral-900 px-3 py-1 bg-white border border-neutral-900 uppercase">
                  {currentPhase}
                </span>
              </div>
            </div>

            {/* Main Layout: Left (Action Log) | Center (Board) | Right (Debug) */}
            <div className="grid grid-cols-[250px_1fr_280px] gap-3 mb-4">
              {/* LEFT: Live Action Report */}
              <div className="border border-neutral-900 p-2 h-[350px] overflow-hidden flex flex-col">
                <div className="text-[10px] font-mono text-neutral-700 mb-2 pb-2 border-b border-neutral-900">
                  LIVE ACTION REPORT
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5">
                  {actionLog.map((entry) => {
                    const entryDisplayName = getDisplayName(entry.playerId);
                    const entryDisplayColor = getDisplayColor(entry.playerId);

                    // Determine border color based on action type
                    const getActionBorderColor = () => {
                      if (entry.type === "thinking") return "border-purple-500";
                      if (entry.type === "phase") return "border-blue-500";
                      if (entry.type === "system") return "border-neutral-600";
                      if (entry.type === "action" && entry.action) {
                        switch (entry.action) {
                          case "fold": return "border-red-500";
                          case "call": return "border-blue-500";
                          case "check": return "border-green-500";
                          case "raise": return "border-amber-500";
                          case "all-in": return "border-yellow-500";
                          default: return "border-neutral-600";
                        }
                      }
                      return "border-neutral-600";
                    };

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "text-[10px] font-mono p-1.5 border-l-2",
                          getActionBorderColor(),
                          entry.type === "thinking" && "bg-purple-500/5",
                          entry.type === "action" && "bg-white/5",
                          entry.type === "phase" && "bg-blue-500/5",
                          entry.type === "system" && "bg-neutral-200/50 border-dashed",
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div
                            className="w-1.5 h-1.5"
                            style={{ backgroundColor: entryDisplayColor }}
                          />
                          <span className="font-bold text-neutral-900">
                            {entry.type === "system" ? "SYSTEM" : entryDisplayName}
                          </span>
                          {entry.type === "thinking" && (
                            <span className="text-purple-400 text-[9px] uppercase font-bold animate-pulse">
                              THINKING
                            </span>
                          )}
                        </div>
                        <div className="text-neutral-600 break-words text-[9px] leading-tight">
                          {entry.type === "action" && entry.action && (
                            <span
                              className={cn(
                                "font-bold mr-1",
                                entry.action === "raise" && "text-amber-400",
                                entry.action === "call" && "text-blue-400",
                                entry.action === "check" && "text-green-400",
                                entry.action === "fold" && "text-red-400",
                                entry.action === "all-in" && "text-yellow-400",
                              )}
                            >
                              {entry.action.toUpperCase()}
                            </span>
                          )}
                          {entry.type === "action"
                            ? entry.content
                                .replace(/^[A-Z\-]+(\s\$[\d,]+)?/, "")
                                .trim()
                            : entry.content}
                        </div>
                      </div>
                    );
                  })}
                  {actionLog.length === 0 && (
                    <div className="text-neutral-600 text-[10px]">
                      No actions yet...
                    </div>
                  )}
                </div>
              </div>

              {/* CENTER: Board */}
              <div className="border border-neutral-900 p-4 flex flex-col items-center justify-center gap-4">
                {/* Pot with NumberFlow animation - no key-based remounting */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-neutral-700 font-mono">
                    POT
                  </span>
                  <div
                    className={cn(
                      "px-6 py-2 border border-white transition-shadow duration-300",
                      currentPotSize > 0 &&
                        "shadow-[0_0_10px_rgba(255,255,255,0.2)]",
                    )}
                  >
                    <span className="text-2xl font-bold text-neutral-900 font-mono flex items-center">
                      $
                      <NumberFlow
                        value={currentPotSize}
                        format={{ notation: "standard" }}
                      />
                    </span>
                  </div>
                </div>

                {/* Community Cards - 5 slots always visible */}
                <div className="flex gap-2">
                  {communityCardSlots.map((card, i) => (
                    <div
                      key={`community-${i}-${card?.rank || "empty"}-${card?.suit || ""}`}
                      className="relative"
                    >
                      {card ? (
                        <Card card={card} size="lg" delay={i * 0.15} />
                      ) : (
                        <motion.div
                          initial={{ opacity: 0.3 }}
                          animate={{ opacity: 0.6 }}
                          transition={{ duration: 0.5 }}
                          className="w-[97px] h-[129px] border border-neutral-900 flex items-center justify-center"
                        >
                          <span className="text-neutral-600 text-xs font-mono">
                            {i < 3 ? "FLOP" : i === 3 ? "TURN" : "RIVER"}
                          </span>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Current Player Indicator */}
                {gameState.status === "betting" && currentPlayer && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-900">
                      <div className="w-2 h-2 bg-white animate-pulse" />
                      <span className="text-sm font-mono text-white">
                        {getDisplayName(currentPlayer.id)}'s Turn
                      </span>
                    </div>
                    <div
                      className={cn(
                        "text-xs font-mono font-bold tabular-nums",
                        turnTimer <= 10
                          ? "text-red-500"
                          : turnTimer <= 20
                            ? "text-yellow-500"
                            : "text-neutral-600",
                      )}
                    >
                      {turnTimer}s
                    </div>
                  </div>
                )}

                {/* Showdown / Winner */}
                <AnimatePresence>
                  {isShowdown && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="text-xl font-bold text-neutral-900 font-mono"
                    >
                      <motion.span
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        SHOWDOWN
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {isHandComplete &&
                    (() => {
                      const handWinners = getHandWinners();
                      if (!handWinners || handWinners.length === 0) return null;
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className="flex flex-col items-center gap-2"
                        >
                          {handWinners.map((winner, idx) => (
                            <motion.div
                              key={winner.playerId}
                              initial={{ opacity: 0, scale: 0.8, y: 20 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              transition={{
                                duration: 0.4,
                                delay: idx * 0.1,
                                ease: "easeOut",
                              }}
                              className="text-center"
                            >
                              <motion.div
                                initial={{ scale: 1 }}
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className="text-lg font-bold font-mono"
                                style={{
                                  color: getDisplayColor(winner.playerId),
                                }}
                              >
                                {getDisplayName(winner.playerId)} WINS
                              </motion.div>
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3, delay: 0.4 }}
                                className="text-2xl font-bold text-neutral-900 font-mono flex items-center justify-center"
                              >
                                +$
                                <NumberFlow value={winner.amount} />
                              </motion.div>
                              {winner.hand?.description && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0.3, delay: 0.5 }}
                                  className="text-sm text-neutral-600 font-mono"
                                >
                                  {winner.hand.description}
                                </motion.div>
                              )}
                            </motion.div>
                          ))}
                          {gameState.handNumber >= gameState.totalHands ? (
                            <motion.button
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.6 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleNextHand}
                              className="mt-2 px-6 py-2 bg-white text-black font-mono font-bold"
                            >
                              FINAL RESULTS
                            </motion.button>
                          ) : (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.6 }}
                              className="mt-2 text-sm text-neutral-600 font-mono"
                            >
                              Next hand in {nextHandCountdown ?? 0}s
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })()}
                </AnimatePresence>
              </div>

              {/* RIGHT: Metrics Panel */}
              <div className="border border-neutral-900 p-3 h-[350px] overflow-hidden flex flex-col">
                {/* Chip Leaderboard */}
                <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                  Leaderboard
                </div>
                <div className="space-y-1 mb-3">
                  {[...gameState.players]
                    .sort((a, b) => {
                      const aChips = gameState.playerStates[a.id]?.chipStack ?? 0;
                      const bChips = gameState.playerStates[b.id]?.chipStack ?? 0;
                      return bChips - aChips;
                    })
                    .map((player, idx) => {
                      const state = gameState.playerStates[player.id];
                      const startingChips = DEFAULT_POKER_CONFIG.startingChips;
                      const changePercent = Math.round(((state.chipStack - startingChips) / startingChips) * 100);
                      const isPositive = changePercent > 0;
                      const isNegative = changePercent < 0;
                      const displayName = getDisplayName(player.id);
                      const displayColor = getDisplayColor(player.id);

                      return (
                        <div
                          key={player.id}
                          className={cn(
                            "flex items-center justify-between py-1 px-2",
                            idx === 0 && "bg-white",
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-neutral-600 w-4">
                              {idx + 1}.
                            </span>
                            <div
                              className="w-2 h-2 shrink-0"
                              style={{ backgroundColor: displayColor }}
                            />
                            <span className="text-[11px] font-mono text-neutral-900 truncate">
                              {displayName}
                            </span>
                          </div>
                          <div className="flex items-center shrink-0">
                            <span className="text-[11px] font-mono font-bold text-neutral-900 tabular-nums w-16 text-right">
                              ${state.chipStack.toLocaleString()}
                            </span>
                            <span className={cn(
                              "flex items-center text-[10px] font-mono tabular-nums w-12 justify-end",
                              isPositive && "text-green-500",
                              isNegative && "text-red-500",
                              changePercent === 0 && "text-neutral-600",
                            )}>
                              {changePercent !== 0 ? (
                                <>
                                  {isPositive ? (
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <path d="M18 15l-6-6-6 6" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  )}
                                  {Math.abs(changePercent)}%
                                </>
                              ) : (
                                <span className="text-neutral-700">—</span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Separator */}
                <div className="border-t border-neutral-900 my-2" />

                {/* Win Odds Section */}
                <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                  Win Probability
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {[...gameState.players]
                    .sort((a, b) => {
                      const aFolded = gameState.playerStates[a.id]?.status === "folded";
                      const bFolded = gameState.playerStates[b.id]?.status === "folded";
                      if (aFolded && !bFolded) return 1;
                      if (!aFolded && bFolded) return -1;
                      const aOdds = playerOdds[a.id]?.winPercentage ?? 0;
                      const bOdds = playerOdds[b.id]?.winPercentage ?? 0;
                      return bOdds - aOdds;
                    })
                    .map((player) => {
                      const state = gameState.playerStates[player.id];
                      const isFolded = state?.status === "folded";
                      const odds = playerOdds[player.id];
                      const displayName = getDisplayName(player.id);
                      const displayColor = getDisplayColor(player.id);
                      const winPercent = isFolded ? 0 : (odds?.winPercentage ?? 0);

                      return (
                        <div key={player.id} className={cn("px-2", isFolded && "opacity-70")}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-2 h-2 shrink-0"
                                style={{ backgroundColor: displayColor }}
                              />
                              <span className="text-[10px] font-mono text-neutral-600 truncate">
                                {displayName}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold tabular-nums text-neutral-600">
                              {isFolded ? "FOLD" : `${winPercent.toFixed(0)}%`}
                            </span>
                          </div>
                          <div className="h-1.5 bg-neutral-200 overflow-hidden">
                            <motion.div
                              className={cn(
                                "h-full",
                                winPercent >= 50 ? "bg-green-500" :
                                winPercent >= 25 ? "bg-yellow-500" : "bg-red-500"
                              )}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(winPercent, 100)}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* BOTTOM: All Players - Modern & Spacious Design */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
              {(displayOrder.length > 0
                ? displayOrder
                : gameState.players.map((p) => p.id)
              ).map((playerId) => {
                const player = gameState.players.find((p) => p.id === playerId);
                if (!player) return null;

                const state = gameState.playerStates[playerId];
                const isCurrentTurn =
                  gameState.status === "betting" &&
                  currentPlayer?.id === playerId;
                const isFolded = state.status === "folded";
                const isAllIn = state.status === "all-in";
                const odds = playerOdds[playerId];
                const hand = playerHands[playerId];
                const displayName = getDisplayName(playerId);
                const displayColor = getDisplayColor(playerId);
                const portrait = getDisplayPortrait(playerId);
                const lastAction = lastActions[playerId]?.action;

                // Get accent color based on last action
                const getAccentColor = () => {
                  if (isFolded) return "neutral-700";
                  if (isCurrentTurn) return "white";
                  switch (lastAction) {
                    case "raise": return "amber-500";
                    case "call": return "blue-500";
                    case "check": return "green-500";
                    case "all-in": return "yellow-500";
                    default: return "neutral-700";
                  }
                };

                const accentColor = getAccentColor();

                return (
                  <motion.div
                    key={playerId}
                    animate={{ scale: isCurrentTurn ? 1.03 : 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    style={{ zIndex: isCurrentTurn ? 10 : 1 }}
                    className={cn(
                      "relative bg-white overflow-hidden transition-all duration-300 border border-neutral-900",
                      isCurrentTurn && "shadow-md",
                      isFolded && "opacity-60",
                    )}
                  >
                    {/* TOP ROW: Total bet this hand + Status */}
                    <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 min-h-[24px]">
                      {/* Total bet this hand */}
                      {state.totalBetThisHand > 0 && (
                        <span className="text-[10px] font-mono text-neutral-700 tabular-nums">
                          In pot: ${state.totalBetThisHand}
                        </span>
                      )}
                      {state.totalBetThisHand === 0 && <div />}

                      {/* Status Badge */}
                      <AnimatePresence mode="wait">
                        {isCurrentTurn && thinkingState.isThinking && !isFolded && (
                          <motion.div
                            key="thinking"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-1 px-2 py-0.5 bg-purple-600"
                          >
                            <div className="w-1.5 h-1.5 bg-white animate-pulse" />
                            <span className="text-[9px] font-mono font-bold text-white">
                              THINKING
                            </span>
                          </motion.div>
                        )}
                        {isFolded && (
                          <motion.div
                            key="folded"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-[9px] font-mono text-neutral-200 px-2 py-0.5 bg-neutral-700"
                          >
                            FOLDED
                          </motion.div>
                        )}
                        {isAllIn && !isFolded && (
                          <motion.div
                            key="all-in"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-[9px] font-mono font-bold text-neutral-900 px-2 py-0.5 bg-yellow-400"
                          >
                            ALL IN
                          </motion.div>
                        )}
                        {!isCurrentTurn && !isFolded && !isAllIn && lastActions[playerId]?.action === "check" && (
                          <motion.div
                            key="check"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-[9px] font-mono font-bold px-2 py-0.5 bg-green-600 text-white"
                          >
                            CHECK
                          </motion.div>
                        )}
                        {!isCurrentTurn && !isFolded && !isAllIn && state.currentBet > 0 && lastActions[playerId]?.action && lastActions[playerId]?.action !== "check" && (
                          <motion.div
                            key={`action-${lastActions[playerId]?.action}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={cn(
                              "flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold",
                              lastActions[playerId]?.action === "raise" && "bg-amber-500 text-neutral-900",
                              lastActions[playerId]?.action === "call" && "bg-blue-600 text-white",
                              lastActions[playerId]?.action === "all-in" && "bg-yellow-400 text-neutral-900",
                            )}
                          >
                            <span>
                              {lastActions[playerId]?.action === "call" && "CALL"}
                              {lastActions[playerId]?.action === "raise" && "RAISE"}
                              {lastActions[playerId]?.action === "all-in" && "ALL-IN"}
                            </span>
                            <span className="tabular-nums">${state.currentBet}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="px-3 pb-2">
                      {/* Cards - CENTER */}
                      <div className="flex justify-center gap-2 mb-2">
                        {state.holeCards.length > 0 ? (
                          state.holeCards.map((card, i) => (
                            <Card
                              key={i}
                              card={isSpectating || isShowdown || isHandComplete ? card : undefined}
                              faceDown={!isSpectating && !isShowdown && !isHandComplete}
                              size="md"
                              className={cn(isFolded && "grayscale opacity-50")}
                            />
                          ))
                        ) : (
                          <>
                            <div className="w-16 h-[86px] bg-white border border-neutral-900" />
                            <div className="w-16 h-[86px] bg-white border border-neutral-900" />
                          </>
                        )}
                      </div>

                      {/* Stack Amount - below cards */}
                      <div className="text-center mb-2">
                        <span className="relative inline-flex items-center justify-center">
                          <span className="font-mono font-bold text-neutral-900 text-lg tabular-nums">
                            $<NumberFlow value={state.chipStack} />
                          </span>
                          <AnimatePresence>
                            {chipChanges[playerId] && (
                              <motion.span
                                key={chipChanges[playerId].key}
                                initial={{ opacity: 0, x: -5 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }}
                                className={cn(
                                  "absolute left-full ml-1 flex items-center text-xs font-mono font-bold tabular-nums whitespace-nowrap",
                                  chipChanges[playerId].amount > 0 ? "text-green-500" : "text-red-500",
                                )}
                              >
                                {chipChanges[playerId].amount > 0 ? (
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 14l5-5 5 5H7z" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 10l5 5 5-5H7z" />
                                  </svg>
                                )}
                                <span>{Math.abs(chipChanges[playerId].percent)}%</span>
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </span>
                      </div>

                      {/* Hand Info - Only show when visible */}
                      {!isFolded && (isSpectating || isShowdown || isHandComplete) && hand && (
                        <div className="text-center mb-2">
                          <span className="text-[10px] font-mono text-white bg-neutral-700 px-2 py-0.5">
                            {HAND_RANK_NAMES[hand.rank]}
                          </span>
                        </div>
                      )}

                      {/* Portrait + Name + Role - BOTTOM */}
                      <div className="flex items-center gap-2">
                        {/* Portrait */}
                        <div
                          className={cn(
                            "relative w-10 h-10 shrink-0 overflow-hidden",
                            isFolded && "grayscale opacity-70",
                          )}
                        >
                          <Image
                            src={portrait}
                            alt={displayName}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>

                        {/* Name + Role */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2 h-2 shrink-0"
                              style={{ backgroundColor: isFolded ? "#525252" : displayColor }}
                            />
                            <span
                              className={cn(
                                "font-mono font-bold text-xs truncate",
                                isFolded ? "text-neutral-700" : "text-neutral-900",
                              )}
                            >
                              {displayName}
                            </span>
                            {playerId === humanPlayerId && (
                              <span className="text-[7px] px-1 bg-yellow-500 text-black font-bold font-mono shrink-0">
                                YOU
                              </span>
                            )}
                          </div>
                          {/* Role tags */}
                          {(state.isDealer || state.isSmallBlind || state.isBigBlind || (isRevealed && player.name !== displayName)) && (
                            <div className="text-[9px] font-mono text-neutral-700 mt-0.5">
                              {state.isDealer && "Dealer"}
                              {state.isDealer && (state.isSmallBlind || state.isBigBlind) && " · "}
                              {state.isSmallBlind && "Small Blind"}
                              {state.isBigBlind && "Big Blind"}
                              {isRevealed && player.name !== displayName && (
                                <span className="text-neutral-600 ml-1">({player.name})</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  </motion.div>
                );
              })}
            </div>

            {/* Human Player Betting Controls */}
            {isHumanTurn && humanState && (
              <div className="mt-4 max-w-md mx-auto">
                <BettingControls
                  chipStack={humanState.chipStack}
                  currentBet={gameState.currentBet}
                  amountToCall={gameState.currentBet - humanState.currentBet}
                  minRaise={gameState.minRaise}
                  canCheck={humanState.currentBet >= gameState.currentBet}
                  potSize={currentPotSize}
                  onAction={handleHumanAction}
                />
              </div>
            )}

            {/* Game Finished - Toggle Button */}
            <AnimatePresence>
              {isGameFinished && !showScoreboard && (
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  onClick={() => setShowScoreboard(true)}
                  className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-6 py-3 bg-white text-black font-mono font-bold hover:bg-neutral-200 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  VIEW RESULTS
                </motion.button>
              )}
            </AnimatePresence>

            {/* Game Finished - Scoreboard Modal */}
            <AnimatePresence>
              {isGameFinished && showScoreboard && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="fixed inset-0 bg-white/95 flex items-center justify-center z-50"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full max-w-lg p-8 border border-neutral-900 bg-white relative"
                  >
                    {/* Close Button */}
                    <button
                      onClick={() => setShowScoreboard(false)}
                      className="absolute top-4 right-4 p-2 text-neutral-700 hover:text-neutral-900 transition-colors"
                      aria-label="Close scoreboard"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>

                    {/* Header */}
                    <div className="text-center mb-8">
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-[10px] font-mono text-neutral-700 uppercase tracking-widest mb-2"
                      >
                        Final Results
                      </motion.div>
                      <motion.h2
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                        className="text-3xl font-bold text-neutral-900 font-mono tracking-wide"
                      >
                        GAME OVER
                      </motion.h2>
                    </div>

                    {/* Winner Section */}
                    {(() => {
                      const winner = getWinner();
                      if (!winner) return null;
                      const player = gameState.players.find(
                        (p) => p.id === winner.playerId,
                      );
                      const characterInfo = characterMap[winner.playerId];
                      const startingChips = DEFAULT_POKER_CONFIG.startingChips;
                      const profit = winner.chipStack - startingChips;
                      const profitPercent = Math.round((profit / startingChips) * 100);

                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          className="text-center mb-8 p-6 border border-neutral-900 bg-white/50"
                        >
                          <div className="flex items-center justify-center gap-4 mb-4">
                            {characterInfo && (
                              <div className="relative w-16 h-16 overflow-hidden border-2 border-white">
                                <Image
                                  src={characterInfo.portrait}
                                  alt={characterInfo.name}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            )}
                            <div className="text-left">
                              <div className="text-[10px] font-mono text-neutral-700 uppercase tracking-wider mb-1">
                                Champion
                              </div>
                              <div
                                className="text-xl font-mono font-bold"
                                style={{ color: player?.color }}
                              >
                                {player?.name}
                              </div>
                              {characterInfo && (
                                <div className="text-xs text-neutral-700 font-mono">
                                  as {characterInfo.name}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-center gap-6">
                            <div>
                              <div className="text-[10px] font-mono text-neutral-600 uppercase">Final Stack</div>
                              <div className="text-3xl font-bold text-neutral-900 font-mono tabular-nums">
                                ${winner.chipStack.toLocaleString()}
                              </div>
                            </div>
                            <div className="w-px h-12 bg-neutral-200" />
                            <div>
                              <div className="text-[10px] font-mono text-neutral-600 uppercase">Profit</div>
                              <div className={cn(
                                "text-xl font-bold font-mono tabular-nums flex items-center gap-1",
                                profit >= 0 ? "text-green-500" : "text-red-500"
                              )}>
                                {profit >= 0 ? (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M18 15l-6-6-6 6" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M6 9l6 6 6-6" />
                                  </svg>
                                )}
                                {Math.abs(profitPercent)}%
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })()}

                    {/* All Players Standings */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <div className="text-[10px] font-mono text-neutral-700 uppercase tracking-wider mb-3">
                        Final Standings — Model Reveal
                      </div>
                      <div className="space-y-2">
                        {Object.values(gameState.playerStates)
                          .sort((a, b) => b.chipStack - a.chipStack)
                          .map((state, index) => {
                            const player = gameState.players.find(
                              (p) => p.id === state.playerId,
                            );
                            const characterInfo = characterMap[state.playerId];
                            const startingChips = DEFAULT_POKER_CONFIG.startingChips;
                            const profit = state.chipStack - startingChips;
                            const profitPercent = Math.round((profit / startingChips) * 100);
                            const isWinner = index === 0;

                            return (
                              <motion.div
                                key={state.playerId}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.6 + index * 0.05 }}
                                className={cn(
                                  "flex items-center justify-between py-3 px-4 border transition-colors",
                                  isWinner
                                    ? "bg-neutral-200/50 border-neutral-600"
                                    : "bg-white/30 border-neutral-900 hover:bg-neutral-200/30"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <span className={cn(
                                    "text-sm font-mono w-6 text-center",
                                    isWinner ? "text-neutral-900 font-bold" : "text-neutral-700"
                                  )}>
                                    {index + 1}
                                  </span>
                                  {characterInfo && (
                                    <div className={cn(
                                      "relative w-8 h-8 overflow-hidden shrink-0",
                                      isWinner ? "border border-white" : "border border-neutral-900"
                                    )}>
                                      <Image
                                        src={characterInfo.portrait}
                                        alt={characterInfo.name}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          "font-mono text-sm truncate",
                                          isWinner ? "font-bold" : "font-normal"
                                        )}
                                        style={{ color: player?.color }}
                                      >
                                        {player?.name}
                                      </span>
                                      {state.playerId === humanPlayerId && (
                                        <span className="text-[7px] px-1 bg-yellow-500 text-black font-bold font-mono shrink-0">
                                          YOU
                                        </span>
                                      )}
                                    </div>
                                    {characterInfo && (
                                      <span className="text-[10px] text-neutral-700 font-mono">
                                        as {characterInfo.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  <span className="text-neutral-900 font-mono font-bold tabular-nums w-20 text-right">
                                    ${state.chipStack.toLocaleString()}
                                  </span>
                                  <span className={cn(
                                    "flex items-center text-xs font-mono tabular-nums w-14 justify-end",
                                    profit > 0 && "text-green-500",
                                    profit < 0 && "text-red-500",
                                    profit === 0 && "text-neutral-600",
                                  )}>
                                    {profit !== 0 ? (
                                      <>
                                        {profit > 0 ? (
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <path d="M18 15l-6-6-6 6" />
                                          </svg>
                                        ) : (
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <path d="M6 9l6 6 6-6" />
                                          </svg>
                                        )}
                                        {Math.abs(profitPercent)}%
                                      </>
                                    ) : (
                                      <span className="text-neutral-700">—</span>
                                    )}
                                  </span>
                                </div>
                              </motion.div>
                            );
                          })}
                      </div>
                    </motion.div>

                    {/* Action Buttons */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                      className="mt-8 flex gap-3"
                    >
                      <button
                        onClick={() => setShowScoreboard(false)}
                        className="flex-1 py-3 bg-neutral-200 text-neutral-900 font-mono font-bold hover:bg-neutral-300 transition-colors border border-neutral-900"
                      >
                        CLOSE
                      </button>
                      <button
                        onClick={handleBackToHome}
                        className="flex-1 py-3 bg-white text-black font-mono font-bold hover:bg-neutral-200 transition-colors"
                      >
                        NEW GAME
                      </button>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  );
}
