"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";

import { usePokerThinking } from "@/hooks/usePokerThinking";
import { useSounds } from "@/hooks/useSounds";
import { usePokerStore } from "@/stores/pokerStore";
import type { Card as CardType, PokerAction } from "@/types/poker";
import { DEFAULT_POKER_CONFIG, HAND_RANK_NAMES } from "@/types/poker";

import { CardBackground } from "@/components/CardBackground";
import { BettingControls } from "@/components/poker";
import { Card } from "@/components/poker/Card";
import { AboutModal } from "@/components/settings/AboutModal";
import { MusicIndicator } from "@/components/settings/MusicIndicator";
import { SettingsModal } from "@/components/settings/SettingsModal";
import {
  ACTION_DELAY_MS,
  CARD_REVEAL_BASE_DELAY_MS,
  CHIP_CHANGE_ANIMATION_MS,
  LOADING_EXIT_MS,
  LOADING_PHASE_DONE_MS,
  LOADING_PHASE_PREPARING_MS,
  NEXT_HAND_DELAY_MS,
  TURN_TIMER_SECONDS,
  TURN_WARNING_THRESHOLD,
} from "@/lib/constants";
import { playDealSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";

// Helper function to get position name based on seat relative to dealer
function getPositionName(
  playerIndex: number,
  dealerIndex: number,
  totalPlayers: number,
): string {
  // Calculate position relative to dealer (0 = dealer, 1 = SB, 2 = BB, etc.)
  const offset = (playerIndex - dealerIndex + totalPlayers) % totalPlayers;

  // Heads-up special case: BTN is also SB
  if (totalPlayers === 2) {
    return offset === 0 ? "BTN" : "BB";
  }

  // Fixed positions (check late positions first to avoid conflicts)
  if (offset === 0) return "BTN"; // Dealer/Button
  if (offset === 1) return "SB"; // Small Blind
  if (offset === 2) return "BB"; // Big Blind
  if (offset === totalPlayers - 1) return "CO"; // Cutoff (1 before BTN)
  if (offset === totalPlayers - 2 && totalPlayers >= 6) return "HJ"; // Hijack (2 before BTN)

  // For positions between BB and late positions
  const positionFromBB = offset - 2; // How many seats after BB (1 = first after BB)

  // 3-5 players: only UTG between BB and CO
  if (totalPlayers <= 5) {
    return "UTG";
  }

  // 6 players: UTG (offset 3) -> HJ (offset 4) -> CO (offset 5)
  // Already handled above

  // 7+ players: UTG, UTG+1, MP, HJ, CO
  if (totalPlayers === 7) {
    if (positionFromBB === 1) return "UTG";
    if (positionFromBB === 2) return "MP";
    // HJ and CO handled above
  }

  // 8+ players: UTG, UTG+1, MP, HJ, CO
  if (totalPlayers === 8) {
    if (positionFromBB === 1) return "UTG";
    if (positionFromBB === 2) return "UTG+1";
    if (positionFromBB === 3) return "MP";
    // HJ and CO handled above
  }

  // 9+ players: UTG, UTG+1, UTG+2, MP, HJ, CO
  if (totalPlayers >= 9) {
    if (positionFromBB === 1) return "UTG";
    if (positionFromBB === 2) return "UTG+1";
    if (positionFromBB === 3) return "UTG+2";
    return "MP"; // Remaining middle positions
  }

  return "MP"; // Fallback
}

export default function PokerGamePage() {
  const router = useRouter();
  const { play, playDeal, stopAll, startMusic, stopMusic } = useSounds();

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
    setProcessingState,
    transitionTo,
    completeActionBatch,
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
  // Synchronous lock to prevent race conditions in AI turn processing
  const processingLockRef = useRef(false);

  // Countdown for next hand
  const [nextHandCountdown, setNextHandCountdown] = useState<number | null>(
    null,
  );

  // Loading screen state - separate from gameState to allow exit animation
  const [showLoading, setShowLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<
    "shuffling" | "preparing" | "done"
  >("shuffling");

  // Scoreboard visibility toggle (for after game ends)
  const [showScoreboard, setShowScoreboard] = useState(true);

  // Card reveal animation state - tracks which players' cards are revealed
  const [isDealing, setIsDealing] = useState(false);
  const [revealedPlayers, setRevealedPlayers] = useState<Set<string>>(
    new Set(),
  );
  const lastHandNumberRef = useRef<number>(0);
  const dealingTimersRef = useRef<NodeJS.Timeout[]>([]);
  const isDealingRef = useRef(false);

  // Trigger card flip reveal animation when a new hand starts
  useEffect(() => {
    if (!gameState || showLoading) return;

    const hasCards = Object.values(gameState.playerStates).some(
      (s) => s.holeCards.length > 0,
    );

    // Only trigger when hand number changes and we're not already dealing
    if (
      hasCards &&
      gameState.handNumber !== lastHandNumberRef.current &&
      !isDealingRef.current
    ) {
      lastHandNumberRef.current = gameState.handNumber;
      isDealingRef.current = true;

      // Clear any existing timers
      dealingTimersRef.current.forEach(clearTimeout);
      dealingTimersRef.current = [];

      // Reset revealed state
      setRevealedPlayers(new Set());
      setIsDealing(true);

      // Get player order for reveal sequence
      const playerOrder =
        displayOrder.length > 0
          ? displayOrder
          : gameState.players.map((p) => p.id);

      // Reveal cards one by one with delays (2 cards per player)
      const cardDelay = 200; // ms between each card
      let cardIndex = 0;

      playerOrder.forEach((playerId, playerIndex) => {
        const playerState = gameState.playerStates[playerId];
        if (!playerState || playerState.holeCards.length === 0) return;

        // Play sound for first card, then reveal player's cards
        const revealDelay = cardIndex * cardDelay;
        const revealTimer = setTimeout(() => {
          playDealSound();
          setRevealedPlayers((prev) => new Set([...prev, playerId]));
        }, revealDelay);
        dealingTimersRef.current.push(revealTimer);

        // Sound for second card
        const secondCardDelay = (cardIndex + 1) * cardDelay;
        const secondCardTimer = setTimeout(() => {
          playDealSound();
        }, secondCardDelay);
        dealingTimersRef.current.push(secondCardTimer);

        cardIndex += 2;
      });

      // Mark dealing complete after all cards revealed
      const totalCards = playerOrder.length * 2;
      const completeTimer = setTimeout(
        () => {
          setIsDealing(false);
          isDealingRef.current = false;
        },
        totalCards * cardDelay + 300,
      );
      dealingTimersRef.current.push(completeTimer);
    }
  }, [gameState?.handNumber, showLoading, displayOrder, gameState]);

  // Cleanup timers on unmount only
  useEffect(() => {
    return () => {
      dealingTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  // Turn timer - deadline-based approach (reduces state updates vs setInterval)
  // We store the deadline timestamp and calculate remaining time from it
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [turnTimer, setTurnTimer] = useState<number>(TURN_TIMER_SECONDS);
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const turnDisplayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for turn timer callback to avoid stale closures
  const gameStateRef = useRef(gameState);
  const humanPlayerIdRef = useRef(humanPlayerId);
  const thinkingStateRef = useRef(thinkingState);
  gameStateRef.current = gameState;
  humanPlayerIdRef.current = humanPlayerId;
  thinkingStateRef.current = thinkingState;

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

      // Clear changes after animation - track timer for cleanup
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
      }, CHIP_CHANGE_ANIMATION_MS);

      // Store timer reference for cleanup
      for (const key of changeKeys) {
        chipChangeTimersRef.current.set(key, timerId);
      }
    }
  }, [gameState?.playerStates]);

  // Cleanup chip change timers on unmount only
  useEffect(() => {
    const timersRef = chipChangeTimersRef;
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  // Cleanup AI turn processing on unmount
  useEffect(() => {
    return () => {
      // Abort any in-flight AI requests
      if (aiTurnAbortRef.current) {
        aiTurnAbortRef.current.abort();
        aiTurnAbortRef.current = null;
      }
      // Clear action delay timer
      if (actionDelayTimerRef.current) {
        clearTimeout(actionDelayTimerRef.current);
        actionDelayTimerRef.current = null;
      }
      // Release processing lock
      processingLockRef.current = false;
    };
  }, []);

  // AI thinking hook - thin wrapper that uses store directly
  const { processAITurn, cancelThinking: cancelAIThinking } =
    usePokerThinking();

  // Memoize active player IDs to only trigger odds recalculation when someone folds
  // This prevents expensive Monte Carlo simulation from running on every bet/call/raise
  const activePlayerIds = useMemo(() => {
    if (!gameState?.playerStates) return "";
    // Create a stable string of active (non-folded) player IDs
    return Object.entries(gameState.playerStates)
      .filter(
        ([, state]) =>
          state.status !== "folded" && state.holeCards.length === 2,
      )
      .map(([id]) => id)
      .sort()
      .join(",");
  }, [gameState?.playerStates]);

  // Load models from session storage (runs once on mount)
  useEffect(() => {
    // Reset refs on mount to allow fresh game
    isInitializedRef.current = false;
    gameStartedRef.current = false;

    try {
      const stored = sessionStorage.getItem("selectedModels");
      const humanMode = sessionStorage.getItem("pokerHumanMode");

      if (stored) {
        const parsed = JSON.parse(stored);

        // Validate parsed data structure
        if (!Array.isArray(parsed)) {
          console.error("Invalid session data: expected array");
          router.push("/");
          return;
        }

        // Validate each model has required fields
        const isValidModels = parsed.every(
          (model: unknown) =>
            typeof model === "object" &&
            model !== null &&
            "id" in model &&
            "name" in model &&
            typeof (model as { id: unknown }).id === "string" &&
            typeof (model as { name: unknown }).name === "string",
        );

        if (!isValidModels) {
          console.error("Invalid session data: invalid model structure");
          router.push("/");
          return;
        }

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

        // Use startTransition to defer the re-render
        startTransition(() => {
          setModels(allPlayers, humanId);
        });
        isInitializedRef.current = true;
        addDebug(`Loaded ${allPlayers.length} players`);
      } else {
        router.push("/");
      }
    } catch (e) {
      // Handle sessionStorage access errors (private browsing, quota exceeded, etc.)
      console.error("Failed to access session storage:", e);
      router.push("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Initialize game when models are loaded (with delay to show loading screen)
  useEffect(() => {
    if (models.length >= 2 && !gameStartedRef.current && !gameState) {
      gameStartedRef.current = true;

      const timers: NodeJS.Timeout[] = [];

      // Defer sound initialization to avoid blocking initial animation frame
      timers.push(
        setTimeout(() => {
          play("load");
        }, 100),
      );

      // Play deal sounds as each card reveals (at the flip midpoint)
      const cardRevealBaseDelay = CARD_REVEAL_BASE_DELAY_MS; // When rotateY animation starts
      const cardFlipMidpoint = 600; // 0.6s into the 1.2s flip (when card is edge-on)
      [0, 1, 2, 3, 4].forEach((i) => {
        timers.push(
          setTimeout(
            () => {
              playDeal();
            },
            cardRevealBaseDelay + cardFlipMidpoint + i * 150,
          ),
        );
      });

      // Phase transitions for loading text
      timers.push(
        setTimeout(() => {
          setLoadingPhase("preparing");
        }, LOADING_PHASE_PREPARING_MS),
      );

      // Switch to "Done" / "Let's play!"
      timers.push(
        setTimeout(() => {
          setLoadingPhase("done");
        }, LOADING_PHASE_DONE_MS),
      );

      // After loading completes, start exit animation
      timers.push(
        setTimeout(() => {
          stopAll(); // Stop loading sound
          startMusic(); // Start background music
          setShowLoading(false);
        }, LOADING_EXIT_MS),
      );

      // Initialize game after exit animation completes (0.4s)
      timers.push(
        setTimeout(() => {
          initializeGame();
          addActionLog({
            playerId: "system",
            playerName: "System",
            playerColor: "#666",
            type: "system",
            content: "Game started - Hand 1",
          });
        }, LOADING_EXIT_MS + 400),
      );

      return () => timers.forEach(clearTimeout);
    }
    // Note: gameState intentionally omitted - we only check !gameState as a guard
    // Including it would cause cleanup to run when initializeGame() sets gameState,
    // which would clear the timers before showLoading(false) runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    models,
    initializeGame,
    startMusic,
    stopAll,
    play,
    playDeal,
    addActionLog,
  ]);

  // Process AI turn when it's their turn
  useEffect(() => {
    // Don't process game logic while loading screen or dealing animation is visible
    if (showLoading || isDealing) return;
    if (!gameState || gameState.status !== "betting") return;
    // Synchronous lock check to prevent race conditions
    if (processingLockRef.current) return;
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
      // Acquire synchronous lock immediately to prevent race conditions
      processingLockRef.current = true;

      // Cancel any in-progress AI turn before starting new one
      if (aiTurnAbortRef.current) {
        aiTurnAbortRef.current.abort();
      }
      aiTurnAbortRef.current = new AbortController();
      const currentAbort = aiTurnAbortRef.current;

      setProcessingState(true, turnKey);

      addDebug(`>>> Starting turn for ${currentPlayer.name}`);

      processAITurn(currentPlayer, context)
        .then((action) => {
          // Only proceed if this turn wasn't aborted
          if (currentAbort.signal.aborted || !action) return;

          addDebug(`Turn completed for ${currentPlayer.name}: ${action.type}`);

          // Play sound for action
          if (action.type === "raise") {
            play("raise");
          } else if (action.type === "all-in") {
            play("allIn");
          } else if (action.type === "call") {
            play("call");
          } else if (action.type === "fold") {
            play("fold");
          } else if (action.type === "check") {
            play("check");
          }

          // Clear any existing delay timer
          if (actionDelayTimerRef.current) {
            clearTimeout(actionDelayTimerRef.current);
          }

          // Delay before allowing next turn (let animations complete)
          actionDelayTimerRef.current = setTimeout(() => {
            processingLockRef.current = false;
            setProcessingState(false, null);
            actionDelayTimerRef.current = null;
          }, ACTION_DELAY_MS);
        })
        .catch((err) => {
          // Ignore abort errors
          if (err?.name === "AbortError" || currentAbort.signal.aborted) {
            addDebug(`Turn aborted for ${currentPlayer.name}`);
            processingLockRef.current = false;
            return;
          }
          console.error(`processAITurn failed:`, err);
          processingLockRef.current = false;
          setProcessingState(false, null);
        });
    } else {
      addDebug(`Failed to build context for ${currentPlayer.name}`);
    }
  }, [
    showLoading,
    isDealing,
    gameState,
    humanPlayerId,
    isProcessing,
    thinkingState.isThinking,
    lastProcessedTurn,
    buildAgentContext,
    processAITurn,
    setProcessingState,
    addDebug,
    hasWinnerByFold,
    isBettingRoundComplete,
    isGameOver,
    play,
  ]);

  // Timer warning sound - plays when turn timer <= 15s, stops on turn change or timer end
  const timerSoundRef = useRef(false);

  useEffect(() => {
    // Only during active betting with the loading screen and dealing finished
    if (
      !gameState ||
      gameState.status !== "betting" ||
      showLoading ||
      isDealing
    ) {
      if (timerSoundRef.current) {
        stopAll();
        timerSoundRef.current = false;
      }
      return;
    }

    // Start sound when timer reaches warning threshold
    if (
      turnTimer <= TURN_WARNING_THRESHOLD &&
      turnTimer > 0 &&
      !timerSoundRef.current
    ) {
      play("load");
      timerSoundRef.current = true;
    }

    // Stop sound when timer hits 0
    if (turnTimer <= 0 && timerSoundRef.current) {
      stopAll();
      timerSoundRef.current = false;
    }
  }, [turnTimer, gameState, showLoading, isDealing, play, stopAll]);

  // Stop timer sound on turn change
  useEffect(() => {
    if (timerSoundRef.current) {
      stopAll();
      timerSoundRef.current = false;
    }
  }, [gameState?.currentPlayerIndex, stopAll]);

  // Cleanup timer sound on unmount
  useEffect(() => {
    return () => {
      if (timerSoundRef.current) {
        stopAll();
        timerSoundRef.current = false;
      }
    };
  }, [stopAll]);

  // Turn timer - deadline-based approach for better performance
  // Uses a single timeout for auto-action + a separate display interval
  useEffect(() => {
    // Clear existing timers
    if (turnTimerRef.current) {
      clearTimeout(turnTimerRef.current);
      turnTimerRef.current = null;
    }
    if (turnDisplayIntervalRef.current) {
      clearInterval(turnDisplayIntervalRef.current);
      turnDisplayIntervalRef.current = null;
    }

    // Don't run timer while loading screen or dealing animation is visible
    if (showLoading || isDealing) {
      setTurnDeadline(null);
      setTurnTimer(TURN_TIMER_SECONDS);
      return;
    }

    // Only run timer during betting and when game is not over
    if (!gameState || gameState.status !== "betting" || isGameOver()) {
      setTurnDeadline(null);
      setTurnTimer(TURN_TIMER_SECONDS);
      return;
    }

    // Set deadline and reset display
    const deadline = Date.now() + TURN_TIMER_SECONDS * 1000;
    setTurnDeadline(deadline);
    setTurnTimer(TURN_TIMER_SECONDS);

    // Capture expected state when timer starts for validation
    const expectedPlayerIndex = gameState.currentPlayerIndex;
    const expectedHandNumber = gameState.handNumber;

    // Single timeout for auto-action (no state updates during countdown)
    turnTimerRef.current = setTimeout(() => {
      // Use refs to get current values (not stale closure)
      const currentGameState = gameStateRef.current;
      const currentHumanPlayerId = humanPlayerIdRef.current;
      const currentThinkingState = thinkingStateRef.current;

      // Don't auto-action if game is over or no game state
      if (
        !currentGameState ||
        currentGameState.handNumber >= currentGameState.totalHands
      ) {
        return;
      }

      // Validate we're still in the expected turn (prevents stale timer issues)
      if (
        currentGameState.currentPlayerIndex !== expectedPlayerIndex ||
        currentGameState.handNumber !== expectedHandNumber
      ) {
        return;
      }

      const currentPlayer =
        currentGameState.players[currentGameState.currentPlayerIndex];
      if (currentPlayer && currentPlayer.id !== currentHumanPlayerId) {
        const playerState = currentGameState.playerStates[currentPlayer.id];

        // Cancel thinking if in progress
        if (currentThinkingState.isThinking) {
          cancelAIThinking();
        }

        // Auto-check if possible, otherwise fold
        const canCheck = playerState.currentBet >= currentGameState.currentBet;
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
    }, TURN_TIMER_SECONDS * 1000);

    // Display interval - only updates the visual timer, not game logic
    // Uses requestAnimationFrame-friendly 1s updates
    turnDisplayIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnTimer(remaining);
    }, 1000);

    return () => {
      if (turnTimerRef.current) {
        clearTimeout(turnTimerRef.current);
        turnTimerRef.current = null;
      }
      if (turnDisplayIntervalRef.current) {
        clearInterval(turnDisplayIntervalRef.current);
        turnDisplayIntervalRef.current = null;
      }
    };
  }, [
    showLoading,
    isDealing,
    gameState?.currentPlayerIndex,
    gameState?.status,
    gameState?.handNumber,
    isGameOver,
  ]);

  // Check for betting round completion
  useEffect(() => {
    // Don't process while loading screen or dealing animation is visible
    if (showLoading || isDealing) return;
    if (!gameState || gameState.status !== "betting") return;

    // Stop if game is over
    if (isGameOver()) return;

    const foldWinner = hasWinnerByFold();
    if (foldWinner) {
      addDebug(`Winner by fold: ${foldWinner}`);

      // Cancel any in-progress thinking (cancelAIThinking batches all resets)
      if (thinkingState.isThinking) {
        cancelAIThinking();
      }

      const timer = setTimeout(() => {
        awardPotToWinner(foldWinner);
        play("victory");
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
        setProcessingState(false, null);
        advancePhase();
        // Play deal sound when new community cards are revealed
        if (gameState.currentPhase !== "river") {
          playDeal();
        }
      }, ACTION_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [
    showLoading,
    isDealing,
    gameState,
    thinkingState.isThinking,
    isProcessing,
    isBettingRoundComplete,
    hasWinnerByFold,
    awardPotToWinner,
    advancePhase,
    setProcessingState,
    play,
    playDeal,
    addDebug,
    addActionLog,
    cancelAIThinking,
    isGameOver,
  ]);

  // Handle showdown
  useEffect(() => {
    if (!gameState || gameState.status !== "showdown") return;

    addDebug("Showdown - resolving hands");
    const timer = setTimeout(() => {
      resolveShowdown();
    }, NEXT_HAND_DELAY_MS);

    return () => clearTimeout(timer);
  }, [gameState?.status, resolveShowdown, addDebug]);

  // Update odds and hands when game state changes
  // Uses Web Worker for Monte Carlo calculation - non-blocking
  // Only trigger on community cards or active player changes (folds), not on every bet
  useEffect(() => {
    if (!gameState) return;

    // Skip during loading screen - no cards dealt yet
    if (showLoading) return;

    // Small debounce to batch rapid state changes
    const timeoutId = setTimeout(() => {
      updateOddsAndHands();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [
    gameState?.communityCards,
    activePlayerIds,
    updateOddsAndHands,
    showLoading,
  ]);

  // Reveal models when game is over
  useEffect(() => {
    if (isGameOver() && !isRevealed) {
      revealModels();
    }
  }, [isGameOver, isRevealed, revealModels]);

  // Cancel any in-progress thinking when game ends (cancelAIThinking batches all resets)
  useEffect(() => {
    if (isGameOver() && thinkingState.isThinking) {
      cancelAIThinking();
    }
  }, [isGameOver, thinkingState.isThinking, cancelAIThinking]);

  // Handle human player action
  const handleHumanAction = useCallback(
    (action: PokerAction) => {
      if (!humanPlayerId || !gameState) return;

      setLastAction(humanPlayerId, {
        action: action.type,
        amount: action.amount,
      });

      processAction(humanPlayerId, action);

      // Play sound for action
      if (action.type === "raise") {
        play("raise");
      } else if (action.type === "all-in") {
        play("allIn");
      } else if (action.type === "call") {
        play("call");
      } else if (action.type === "fold") {
        play("fold");
      } else if (action.type === "check") {
        play("check");
      }
    },
    [humanPlayerId, gameState, setLastAction, processAction, play],
  );

  // Handle next hand
  // Note: gameState?.handNumber accessed via ref to avoid callback recreation on every state change
  const handleNextHand = useCallback(() => {
    clearForNextHand();
    startNextHand();
    playDeal(); // Play deal sound for new hand
    addDebug("Starting next hand");
    // Use ref to get current hand number to avoid stale closure
    const currentHandNumber = gameStateRef.current?.handNumber || 0;
    addActionLog({
      playerId: "system",
      playerName: "System",
      playerColor: "#666",
      type: "system",
      content: `Hand ${currentHandNumber + 1} started`,
    });
  }, [clearForNextHand, startNextHand, playDeal, addDebug, addActionLog]);

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
    stopMusic(); // Stop background music
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
  }, [stopAll, stopMusic, cancelAIThinking, router]);

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
  const currentPlayer = gameState?.players[gameState?.currentPlayerIndex ?? 0];

  // Pad community cards to always show 5 slots
  const communityCardSlots = useMemo((): (CardType | null)[] => {
    if (!gameState) return [];
    const slots: (CardType | null)[] = [...gameState.communityCards];
    while (slots.length < 5) {
      slots.push(null);
    }
    return slots;
  }, [gameState?.communityCards]);

  // Memoized sorted players for leaderboard (by chip stack)
  const sortedByChips = useMemo(() => {
    if (!gameState) return [];
    return [...gameState.players].sort((a, b) => {
      const aChips = gameState.playerStates[a.id]?.chipStack ?? 0;
      const bChips = gameState.playerStates[b.id]?.chipStack ?? 0;
      return bChips - aChips;
    });
  }, [gameState?.players, gameState?.playerStates]);

  // Memoized sorted players for win probability (by odds, folded last)
  const sortedByOdds = useMemo(() => {
    if (!gameState) return [];
    return [...gameState.players].sort((a, b) => {
      const aFolded = gameState.playerStates[a.id]?.status === "folded";
      const bFolded = gameState.playerStates[b.id]?.status === "folded";
      if (aFolded && !bFolded) return 1;
      if (!aFolded && bFolded) return -1;
      const aOdds = playerOdds[a.id]?.winPercentage ?? 0;
      const bOdds = playerOdds[b.id]?.winPercentage ?? 0;
      return bOdds - aOdds;
    });
  }, [gameState?.players, gameState?.playerStates, playerOdds]);

  // Memoized hand winners
  const handWinners = useMemo(() => getHandWinners(), [currentHandWinners]);

  // Check if a card is part of the winning hand
  const isWinningCard = useCallback(
    (card: CardType | null): boolean => {
      if (!card || !isHandComplete) return false;
      const winners = getHandWinners();
      if (!winners?.[0]?.hand?.cards) return false;
      return winners[0].hand.cards.some(
        (c) => c.rank === card.rank && c.suit === card.suit,
      );
    },
    [isHandComplete, getHandWinners],
  );

  return (
    <div className="min-h-screen bg-neutral-100 relative isolate">
      <CardBackground cardCount={15} opacity={0.1} />
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
              initial={{ x: 0 }}
              animate={{ x: [0, -10, 10, -5, 5, 0] }}
              exit={{ y: -30, opacity: 0 }}
              transition={{
                x: {
                  duration: 2,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 0.5,
                },
              }}
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
                      delay: 2.0 + i * 0.15,
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
                      delay: 2.0 + 0.6 + i * 0.15, // Change at midpoint of flip (when card is edge-on)
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
              className="text-center h-12"
            >
              <AnimatePresence mode="wait">
                {loadingPhase === "shuffling" && (
                  <motion.div
                    key="shuffling"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="text-neutral-700 font-mono text-sm">
                      Shuffling Deck
                    </div>
                    <div className="text-neutral-500 font-mono text-xs mt-1">
                      Find the joker!
                    </div>
                  </motion.div>
                )}
                {loadingPhase === "preparing" && (
                  <motion.div
                    key="preparing"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="text-neutral-700 font-mono text-sm">
                      Preparing the Table
                    </div>
                    <div className="text-neutral-500 font-mono text-xs mt-1">
                      Hiding all the Queens
                    </div>
                  </motion.div>
                )}
                {loadingPhase === "done" && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.2,
                      type: "spring",
                      stiffness: 300,
                    }}
                  >
                    <div className="text-neutral-900 font-mono text-sm font-bold">
                      Done
                    </div>
                    <div className="text-green-600 font-mono text-xs mt-1">
                      Let&apos;s play!
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Content - render after loading screen is done */}
      {gameState && !showLoading && (
        <motion.div
          key="game-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="p-4 relative z-10"
        >
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 bg-white border border-neutral-900 p-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBackToHome}
                  className="text-sm text-neutral-700 hover:text-neutral-900 transition-colors font-mono"
                >
                  ← EXIT
                </button>
              </div>
              <div className="flex items-center gap-2">
                <AboutModal />
                <MusicIndicator track="game" />
                <SettingsModal />
              </div>
            </div>

            {/* Main Layout: Left (Board + Players) | Right (Metrics) */}
            <div className="grid grid-cols-[1fr_320px] gap-3 mb-4">
              {/* LEFT COLUMN: Board + Player Cards */}
              <div className="flex flex-col gap-3">
                {/* Poker Table Board */}
                <div className="border-2 border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800 shadow-[inset_0_2px_20px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden">
                  {/* Top Bar: Pot + Status */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-900/40">
                    {/* Pot Display */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-300/70 font-mono uppercase tracking-wider">
                        POT
                      </span>
                      <span className="text-lg font-bold text-emerald-200 font-mono flex items-center">
                        $
                        <NumberFlow
                          value={currentPotSize}
                          format={{ notation: "standard" }}
                        />
                      </span>
                    </div>

                    {/* Turn/Winner Status Badge */}
                    <AnimatePresence mode="wait">
                      {/* Turn Indicator */}
                      {gameState.status === "betting" && currentPlayer && (
                        <motion.div
                          key="turn-badge"
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="flex items-center gap-2"
                        >
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-black/50">
                            <div className="w-1.5 h-1.5 bg-yellow-400 animate-pulse" />
                            <span className="text-xs font-mono text-white">
                              {getDisplayName(currentPlayer.id)}
                            </span>
                          </div>
                          <span
                            className={cn(
                              "text-sm font-mono font-bold tabular-nums",
                              turnTimer <= 10
                                ? "text-red-400"
                                : turnTimer <= 20
                                  ? "text-yellow-400"
                                  : "text-emerald-200",
                            )}
                          >
                            {turnTimer}s
                          </span>
                        </motion.div>
                      )}

                      {/* Showdown Badge */}
                      {isShowdown && (
                        <motion.span
                          key="showdown-badge"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="px-3 py-1 bg-amber-500 text-white text-xs font-mono font-bold animate-pulse"
                        >
                          SHOWDOWN
                        </motion.span>
                      )}

                      {/* Winner Badge */}
                      {isHandComplete &&
                        handWinners &&
                        handWinners.length > 0 &&
                        (() => {
                          const winner = handWinners[0];
                          return (
                            <motion.div
                              key="winner-badge"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex items-center gap-2"
                            >
                              <div
                                className="px-2 py-1 font-mono text-xs font-bold text-white"
                                style={{
                                  backgroundColor: getDisplayColor(
                                    winner.playerId,
                                  ),
                                }}
                              >
                                {getDisplayName(winner.playerId)}
                              </div>
                              <span className="text-sm font-bold text-emerald-200 font-mono">
                                +${winner.amount.toLocaleString()}
                              </span>
                            </motion.div>
                          );
                        })()}
                    </AnimatePresence>
                  </div>

                  {/* Community Cards Area */}
                  <div className="flex items-center justify-center py-8 px-3">
                    <div className="flex items-center gap-2">
                      {/* FLOP: cards 0-2 */}
                      <div className="flex gap-2">
                        {communityCardSlots.slice(0, 3).map((card, i) => (
                          <div
                            key={`flop-${i}-${card?.rank || "empty"}-${card?.suit || ""}`}
                            className="relative"
                          >
                            {card ? (
                              <Card
                                card={card}
                                size="lg"
                                delay={i * 0.15}
                                className={cn(
                                  "shadow-lg",
                                  isHandComplete &&
                                    isWinningCard(card) &&
                                    "winning-card-glow",
                                )}
                              />
                            ) : (
                              <div className="w-[97px] h-[129px] border-2 border-dashed border-emerald-500/30 bg-emerald-900/20 flex items-center justify-center">
                                <span className="text-emerald-400/40 text-[10px] font-mono">
                                  FLOP
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Separator */}
                      <div className="w-0.5 h-16 bg-emerald-500/20 mx-1" />

                      {/* TURN: card 3 */}
                      <div className="relative">
                        {communityCardSlots[3] ? (
                          <Card
                            card={communityCardSlots[3]}
                            size="lg"
                            delay={0.45}
                            className={cn(
                              "shadow-lg",
                              isHandComplete &&
                                isWinningCard(communityCardSlots[3]) &&
                                "winning-card-glow",
                            )}
                          />
                        ) : (
                          <div className="w-[97px] h-[129px] border-2 border-dashed border-emerald-500/30 bg-emerald-900/20 flex items-center justify-center">
                            <span className="text-emerald-400/40 text-[10px] font-mono">
                              TURN
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Separator */}
                      <div className="w-0.5 h-16 bg-emerald-500/20 mx-1" />

                      {/* RIVER: card 4 */}
                      <div className="relative">
                        {communityCardSlots[4] ? (
                          <Card
                            card={communityCardSlots[4]}
                            size="lg"
                            delay={0.6}
                            className={cn(
                              "shadow-lg",
                              isHandComplete &&
                                isWinningCard(communityCardSlots[4]) &&
                                "winning-card-glow",
                            )}
                          />
                        ) : (
                          <div className="w-[97px] h-[129px] border-2 border-dashed border-emerald-500/30 bg-emerald-900/20 flex items-center justify-center">
                            <span className="text-emerald-400/40 text-[10px] font-mono">
                              RIVER
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Bar: Always present to prevent height shift */}
                  <div className="flex items-center justify-center gap-3 px-4 py-2 bg-emerald-900/40 min-h-[36px]">
                    {isHandComplete && handWinners && handWinners.length > 0 ? (
                      <>
                        {handWinners[0].hand?.description && (
                          <span className="text-xs text-emerald-200 font-mono">
                            {handWinners[0].hand.description}
                          </span>
                        )}
                        {handWinners.length > 1 && (
                          <span className="text-xs text-emerald-300/60 font-mono">
                            +{handWinners.length - 1} more
                          </span>
                        )}
                        {gameState.handNumber >= gameState.totalHands ? (
                          <button
                            type="button"
                            onClick={handleNextHand}
                            className="px-3 py-1 bg-white text-emerald-900 text-xs font-mono font-bold hover:bg-emerald-100 transition-colors"
                          >
                            FINAL RESULTS
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-300 font-mono uppercase">
                            NEXT HAND IN {nextHandCountdown ?? 0}S
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-emerald-400/50 font-mono">
                        {(currentPhase || "WAITING").toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Player Cards - Inside Left Column */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {(displayOrder.length > 0
                    ? displayOrder
                    : gameState.players.map((p) => p.id)
                  ).map((playerId) => {
                    const player = gameState.players.find(
                      (p) => p.id === playerId,
                    );
                    if (!player) return null;

                    const state = gameState.playerStates[playerId];
                    const isCurrentTurn =
                      gameState.status === "betting" &&
                      currentPlayer?.id === playerId;
                    const isFolded = state.status === "folded";
                    const isAllIn = state.status === "all-in";

                    const hand = playerHands[playerId];
                    const displayName = getDisplayName(playerId);
                    const portrait = getDisplayPortrait(playerId);
                    const displayColor = getDisplayColor(playerId);

                    return (
                      <div
                        key={playerId}
                        className={cn(
                          "border border-neutral-900 bg-white flex flex-col relative overflow-hidden transition-transform duration-200",
                          isCurrentTurn && !isFolded && "scale-105 z-10",
                          currentHandWinners?.some(
                            (w) => w.playerId === playerId,
                          ) && "scale-105 z-10",
                          isFolded && "brightness-90",
                        )}
                      >
                        {/* TOP ROW: Status Badge */}
                        <div className="flex items-center justify-center px-3 pt-2 pb-1 min-h-[24px]">
                          {currentHandWinners?.some(
                            (w) => w.playerId === playerId,
                          ) ? (
                            <span className="text-[9px] font-mono font-bold text-white px-2 py-0.5 bg-green-600">
                              WON $
                              {currentHandWinners
                                .find((w) => w.playerId === playerId)
                                ?.amount.toLocaleString()}
                            </span>
                          ) : isCurrentTurn &&
                            !isFolded &&
                            playerId !== humanPlayerId ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.2 }}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-600"
                            >
                              <div className="w-1.5 h-1.5 bg-white animate-pulse shrink-0" />
                              <span className="text-[9px] font-mono font-bold text-white leading-none">
                                THINKING
                              </span>
                            </motion.div>
                          ) : isFolded ? (
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-red-600 text-white">
                              FOLD
                            </span>
                          ) : isAllIn ? (
                            <span className="text-[9px] font-mono font-bold text-neutral-900 px-2 py-0.5 bg-yellow-400">
                              ALL IN
                            </span>
                          ) : lastActions[playerId]?.action === "check" ? (
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-green-600 text-white">
                              CHECK
                            </span>
                          ) : lastActions[playerId]?.action &&
                            lastActions[playerId]?.action !== "fold" &&
                            state.currentBet > 0 ? (
                            <div
                              className={cn(
                                "flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold",
                                lastActions[playerId]?.action === "raise" &&
                                  "bg-amber-500 text-neutral-900",
                                lastActions[playerId]?.action === "call" &&
                                  "bg-blue-600 text-white",
                              )}
                            >
                              <span>
                                {lastActions[playerId]?.action?.toUpperCase()}
                              </span>
                              <span className="tabular-nums">
                                ${lastActions[playerId]?.amount}
                              </span>
                            </div>
                          ) : !isFolded &&
                            (isSpectating || isShowdown || isHandComplete) &&
                            hand ? (
                            <span className="text-[9px] font-mono font-bold text-white bg-neutral-700 px-2 py-0.5">
                              {HAND_RANK_NAMES[hand.rank]}
                            </span>
                          ) : state.currentBet > 0 ? (
                            <div className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold bg-neutral-700 text-white">
                              <span>BET</span>
                              <span className="tabular-nums">
                                ${state.currentBet}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="px-3 pb-2">
                          {/* Cards */}
                          <div
                            className="flex justify-center gap-2 mb-2"
                            style={{ perspective: "1000px" }}
                          >
                            {state.holeCards.length > 0 ? (
                              state.holeCards.map((card, i) => {
                                const isCardRevealed =
                                  revealedPlayers.has(playerId);
                                const showCardFace =
                                  isSpectating || isShowdown || isHandComplete;
                                return (
                                  <div
                                    key={`${playerId}-card-${i}`}
                                    className={cn(
                                      "relative w-16 h-[86px] card-flip-container",
                                      isCardRevealed && "revealed",
                                      i === 1 && "delay-1",
                                      isFolded && "grayscale brightness-75",
                                    )}
                                  >
                                    <div className="absolute inset-0 card-flip-face">
                                      <Card faceDown size="md" />
                                    </div>
                                    <div className="absolute inset-0 card-flip-face card-flip-back">
                                      <Card
                                        card={showCardFace ? card : undefined}
                                        faceDown={!showCardFace}
                                        size="md"
                                      />
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <>
                                <div className="w-16 h-[86px] bg-white border border-neutral-900" />
                                <div className="w-16 h-[86px] bg-white border border-neutral-900" />
                              </>
                            )}
                          </div>

                          {/* Stack Amount */}
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
                                      chipChanges[playerId].amount > 0
                                        ? "text-green-500"
                                        : "text-red-500",
                                    )}
                                  >
                                    {chipChanges[playerId].amount > 0 ? (
                                      <svg
                                        className="w-3 h-3"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        <path d="M7 14l5-5 5 5H7z" />
                                      </svg>
                                    ) : (
                                      <svg
                                        className="w-3 h-3"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        <path d="M7 10l5 5 5-5H7z" />
                                      </svg>
                                    )}
                                    <span>
                                      {Math.abs(chipChanges[playerId].percent)}%
                                    </span>
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </span>
                          </div>

                          {/* Portrait + Name + Role */}
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "relative w-10 h-10 shrink-0 overflow-hidden bg-white",
                                isFolded && "grayscale brightness-75",
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
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-2 h-2 shrink-0"
                                  style={{
                                    backgroundColor: isFolded
                                      ? "#525252"
                                      : displayColor,
                                  }}
                                />
                                <span
                                  className={cn(
                                    "font-mono font-bold text-xs truncate",
                                    isFolded
                                      ? "text-neutral-700"
                                      : "text-neutral-900",
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
                              <div className="text-[9px] font-mono text-neutral-700 mt-0.5 flex items-center gap-1">
                                <span className="px-1 bg-neutral-200 text-neutral-600">
                                  {getPositionName(
                                    gameState.players.findIndex(
                                      (p) => p.id === playerId,
                                    ),
                                    gameState.dealerPosition,
                                    gameState.players.length,
                                  )}
                                </span>
                                {state.isDealer && (
                                  <span className="px-1 bg-neutral-900 text-white">
                                    D
                                  </span>
                                )}
                                {isRevealed && player.name !== displayName && (
                                  <span className="text-neutral-600">
                                    ({player.name})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: Metrics Panel */}
              <div className="border border-neutral-900 flex flex-col bg-white">
                {/* Hand & Phase Status */}
                <div className="flex border-b border-neutral-900">
                  <div className="flex-1 flex flex-col items-center justify-center py-2">
                    <div className="text-[9px] font-mono text-neutral-500 uppercase">
                      Hand
                    </div>
                    <div className="text-sm font-mono font-bold text-neutral-900">
                      {gameState.handNumber}/{gameState.totalHands}
                    </div>
                  </div>
                  <div className="w-px bg-neutral-900" />
                  <div className="flex-1 flex flex-col items-center justify-center py-2">
                    <div className="text-[9px] font-mono text-neutral-500 uppercase">
                      Phase
                    </div>
                    <div className="text-sm font-mono font-bold text-neutral-900 uppercase">
                      {currentPhase}
                    </div>
                  </div>
                </div>

                {/* Content with padding */}
                <div className="p-3 flex flex-col flex-1">
                  {/* Chip Leaderboard */}
                  <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                    Leaderboard
                  </div>
                  <div className="space-y-1 mb-3">
                    {sortedByChips.map((player, idx) => {
                      const state = gameState.playerStates[player.id];
                      const startingChips = DEFAULT_POKER_CONFIG.startingChips;
                      const changePercent = Math.round(
                        ((state.chipStack - startingChips) / startingChips) *
                          100,
                      );
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
                            <span
                              className={cn(
                                "flex items-center text-[10px] font-mono tabular-nums w-12 justify-end",
                                isPositive && "text-green-500",
                                isNegative && "text-red-500",
                                changePercent === 0 && "text-neutral-600",
                              )}
                            >
                              {changePercent !== 0 ? (
                                <>
                                  {isPositive ? (
                                    <svg
                                      className="w-3 h-3"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="3"
                                    >
                                      <path d="M18 15l-6-6-6 6" />
                                    </svg>
                                  ) : (
                                    <svg
                                      className="w-3 h-3"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="3"
                                    >
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
                  <div className="border-t border-neutral-900 my-2 -mx-3" />

                  {/* Win Odds Section */}
                  <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                    Win Probability
                  </div>
                  <div className="space-y-2">
                    {sortedByOdds.map((player) => {
                      const state = gameState.playerStates[player.id];
                      const isFolded = state?.status === "folded";
                      const odds = playerOdds[player.id];
                      const displayName = getDisplayName(player.id);
                      const displayColor = getDisplayColor(player.id);
                      const winPercent = isFolded
                        ? 0
                        : (odds?.winPercentage ?? 0);

                      return (
                        <div
                          key={player.id}
                          className={cn("px-2", isFolded && "opacity-50")}
                        >
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
                            {/* CSS transition instead of framer-motion for performance */}
                            <div
                              className={cn(
                                "h-full transition-all duration-500 ease-out",
                                isFolded
                                  ? "bg-neutral-400"
                                  : winPercent >= 50
                                    ? "bg-green-500"
                                    : winPercent >= 25
                                      ? "bg-yellow-500"
                                      : "bg-red-500",
                              )}
                              style={{
                                width: isFolded
                                  ? 0
                                  : `${Math.min(winPercent, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Separator */}
                  <div className="border-t border-neutral-900 my-2 -mx-3" />

                  {/* Live Action Report */}
                  <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                    Live Action Report
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[200px]">
                    {actionLog.map((entry) => {
                      const entryDisplayName = getDisplayName(entry.playerId);
                      const entryDisplayColor = getDisplayColor(entry.playerId);

                      // Determine border color based on action type
                      const getActionBorderColor = () => {
                        if (entry.type === "thinking")
                          return "border-purple-500";
                        if (entry.type === "phase") return "border-blue-500";
                        if (entry.type === "system")
                          return "border-neutral-600";
                        if (entry.type === "action" && entry.action) {
                          switch (entry.action) {
                            case "fold":
                              return "border-red-500";
                            case "call":
                              return "border-blue-500";
                            case "check":
                              return "border-green-500";
                            case "raise":
                              return "border-amber-500";
                            case "all-in":
                              return "border-yellow-500";
                            default:
                              return "border-neutral-600";
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
                            entry.type === "thinking" && "bg-purple-50",
                            entry.type === "action" && "bg-white",
                            entry.type === "phase" && "bg-blue-50",
                            entry.type === "system" &&
                              "bg-neutral-100 border-dashed",
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div
                              className="w-1.5 h-1.5"
                              style={{ backgroundColor: entryDisplayColor }}
                            />
                            <span className="font-bold text-neutral-900">
                              {entry.type === "system"
                                ? "SYSTEM"
                                : entryDisplayName}
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
                                  entry.action === "all-in" &&
                                    "text-yellow-400",
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
              </div>
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
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
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
                  className="fixed inset-0 bg-white flex items-center justify-center z-50"
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
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
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
                        transition={{
                          delay: 0.3,
                          type: "spring",
                          stiffness: 200,
                        }}
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
                      const profitPercent = Math.round(
                        (profit / startingChips) * 100,
                      );

                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          className="text-center mb-8 p-6 border border-neutral-900 bg-neutral-50"
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
                              <div className="text-[10px] font-mono text-neutral-600 uppercase">
                                Final Stack
                              </div>
                              <div className="text-3xl font-bold text-neutral-900 font-mono tabular-nums">
                                ${winner.chipStack.toLocaleString()}
                              </div>
                            </div>
                            <div className="w-px h-12 bg-neutral-200" />
                            <div>
                              <div className="text-[10px] font-mono text-neutral-600 uppercase">
                                Profit
                              </div>
                              <div
                                className={cn(
                                  "text-xl font-bold font-mono tabular-nums flex items-center gap-1",
                                  profit >= 0
                                    ? "text-green-500"
                                    : "text-red-500",
                                )}
                              >
                                {profit >= 0 ? (
                                  <svg
                                    className="w-4 h-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  >
                                    <path d="M18 15l-6-6-6 6" />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-4 h-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  >
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
                            const startingChips =
                              DEFAULT_POKER_CONFIG.startingChips;
                            const profit = state.chipStack - startingChips;
                            const profitPercent = Math.round(
                              (profit / startingChips) * 100,
                            );
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
                                    ? "bg-neutral-200 border-neutral-600"
                                    : "bg-white border-neutral-900 hover:bg-neutral-100",
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={cn(
                                      "text-sm font-mono w-6 text-center",
                                      isWinner
                                        ? "text-neutral-900 font-bold"
                                        : "text-neutral-700",
                                    )}
                                  >
                                    {index + 1}
                                  </span>
                                  {characterInfo && (
                                    <div
                                      className={cn(
                                        "relative w-8 h-8 overflow-hidden shrink-0",
                                        isWinner
                                          ? "border border-white"
                                          : "border border-neutral-900",
                                      )}
                                    >
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
                                          isWinner
                                            ? "font-bold"
                                            : "font-normal",
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
                                  <span
                                    className={cn(
                                      "flex items-center text-xs font-mono tabular-nums w-14 justify-end",
                                      profit > 0 && "text-green-500",
                                      profit < 0 && "text-red-500",
                                      profit === 0 && "text-neutral-600",
                                    )}
                                  >
                                    {profit !== 0 ? (
                                      <>
                                        {profit > 0 ? (
                                          <svg
                                            className="w-3 h-3"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                          >
                                            <path d="M18 15l-6-6-6 6" />
                                          </svg>
                                        ) : (
                                          <svg
                                            className="w-3 h-3"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                          >
                                            <path d="M6 9l6 6 6-6" />
                                          </svg>
                                        )}
                                        {Math.abs(profitPercent)}%
                                      </>
                                    ) : (
                                      <span className="text-neutral-700">
                                        —
                                      </span>
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
