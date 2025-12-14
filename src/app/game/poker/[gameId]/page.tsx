"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

import { CardBackground } from "@/components/CardBackground";
import {
  getModelColor,
  getModelDisplayName,
  getModelIcon,
} from "@/components/model-icons";
import { Card } from "@/components/poker/Card";
import { GameSummary } from "@/components/poker/GameSummary";
import { AboutModal } from "@/components/settings/AboutModal";
import { MusicIndicator } from "@/components/settings/MusicIndicator";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useSounds } from "@/hooks/useSounds";
import { evaluateHand } from "@/lib/hand-evaluator";
import { POKER_CHARACTERS, type PokerCharacter } from "@/lib/poker-characters";
import { calculateOddsAsync } from "@/lib/poker-odds";
import { abbreviateModel, cn } from "@/lib/utils";
import type { Card as CardType, EvaluatedHand } from "@/types/poker";
import { ChevronDown, ChevronUp } from "lucide-react";

// Loading screen sprite dimensions (native size 97x129 per card, 15 cols x 4 rows)
const CARD_WIDTH = 97;
const CARD_HEIGHT = 129;
const loadingSpriteWidth = CARD_WIDTH * 15;
const loadingSpriteHeight = CARD_HEIGHT * 4;

// Generate random card positions for loading animation
function generateLoadingCardPositions() {
  const jokerIndex = Math.floor(Math.random() * 5);
  return [0, 1, 2, 3, 4].map((index) => {
    if (index === jokerIndex) {
      return { x: -14 * CARD_WIDTH, y: 0 }; // Joker is at column 14
    }
    const col = 1 + Math.floor(Math.random() * 13); // Random card (columns 1-13)
    const row = Math.floor(Math.random() * 4); // Random suit (rows 0-3)
    return { x: -col * CARD_WIDTH, y: -row * CARD_HEIGHT };
  });
}

// Get character by ID
function getCharacterById(charId: string): PokerCharacter | undefined {
  return POKER_CHARACTERS.find((c) => c.id === charId);
}

// Format duration in mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Calculate main pot and side pots from player states
interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
  isMainPot: boolean;
}

function calculatePots(playerStates: { modelId: string; folded: boolean; totalBetThisHand: number; chips: number }[]): Pot[] {
  const players = playerStates.filter(
    (p) => !p.folded || p.totalBetThisHand > 0,
  );

  // Find all-in players (chips === 0 and have bet something)
  const allInPlayers = players.filter((p) => p.chips === 0 && p.totalBetThisHand > 0);

  // If no one is all-in, just return a single main pot
  if (allInPlayers.length === 0) {
    const totalPot = players.reduce((sum, p) => sum + p.totalBetThisHand, 0);
    if (totalPot === 0) return [];

    return [{
      amount: totalPot,
      eligiblePlayerIds: players.filter((p) => !p.folded).map((p) => p.modelId),
      isMainPot: true,
    }];
  }

  // Get unique all-in bet levels (these create pot boundaries)
  const allInLevels = [...new Set(allInPlayers.map((p) => p.totalBetThisHand))]
    .sort((a, b) => a - b);

  // Add the max bet level if it's higher than all all-in amounts
  const maxBet = Math.max(...players.map((p) => p.totalBetThisHand));
  if (maxBet > allInLevels[allInLevels.length - 1]) {
    allInLevels.push(maxBet);
  }

  const pots: Pot[] = [];
  let previousLevel = 0;

  for (const level of allInLevels) {
    const contribution = level - previousLevel;
    const contributors = players.filter((p) => p.totalBetThisHand >= level);
    const potAmount = contribution * contributors.length;

    if (potAmount > 0) {
      const eligiblePlayerIds = contributors
        .filter((p) => !p.folded)
        .map((p) => p.modelId);

      if (eligiblePlayerIds.length > 0) {
        pots.push({
          amount: potAmount,
          eligiblePlayerIds,
          isMainPot: pots.length === 0,
        });
      }
    }
    previousLevel = level;
  }

  return pots;
}

// Position name helper - Standard Texas Hold'em positions
// Positions clockwise from dealer: BTN → SB → BB → UTG → UTG+1 → MP → HJ → CO
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
  // HJ and CO already handled above

  // 7 players: UTG, MP, HJ, CO
  if (totalPlayers === 7) {
    if (positionFromBB === 1) return "UTG";
    if (positionFromBB === 2) return "MP";
    // HJ and CO handled above
  }

  // 8 players: UTG, UTG+1, MP, HJ, CO
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

export default function SpectatorPage() {
  const params = useParams();
  const gameId = params.gameId as Id<"games">;
  const game = useQuery(api.rankedGames.getGame, { gameId });
  const { play, playDeal, startMusic, stopMusic, stopAll } = useSounds();

  // Cleanup music when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      stopMusic();
      stopAll();
    };
  }, [stopMusic, stopAll]);

  // Loading screen state
  const [showLoading, setShowLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<
    "shuffling" | "preparing" | "done"
  >("shuffling");

  // Pre-generate random card positions for loading screen (memoized)
  const loadingCardPositions = useMemo(
    () => generateLoadingCardPositions(),
    [],
  );

  // Card reveal state
  const [revealedPlayers, setRevealedPlayers] = useState<Set<string>>(
    new Set(),
  );
  const [lastHandNumber, setLastHandNumber] = useState(0);

  // Turn timer state
  const [turnTimeRemaining, setTurnTimeRemaining] = useState<number | null>(
    null,
  );
  const [lastThinkingPlayer, setLastThinkingPlayer] = useState<string | null>(
    null,
  );

  // Next hand countdown state
  const [nextHandCountdown, setNextHandCountdown] = useState<number | null>(
    null,
  );
  const [lastHandWinner, setLastHandWinner] = useState<{
    modelId: string;
    amount: number;
  } | null>(null);

  // Win probability state
  const [playerOdds, setPlayerOdds] = useState<Map<string, number>>(new Map());
  const [evaluatedHands, setEvaluatedHands] = useState<
    Map<string, EvaluatedHand>
  >(new Map());

  // Game duration timer
  const [gameDuration, setGameDuration] = useState<number>(0);

  // Action sound tracking - use ref to avoid re-renders and track last processed action
  const lastActionTimestampRef = useRef<number>(0);

  // Turn timer effect
  useEffect(() => {
    if (!game) return;

    const thinkingId = game.state.thinkingPlayerId;
    const turnTimeout = game.turnTimeoutMs;

    // Reset timer when thinking player changes
    if (thinkingId !== lastThinkingPlayer) {
      setLastThinkingPlayer(thinkingId || null);
      if (thinkingId) {
        setTurnTimeRemaining(Math.floor(turnTimeout / 1000));
      } else {
        setTurnTimeRemaining(null);
      }
    }

    // Countdown interval
    if (thinkingId && turnTimeRemaining !== null && turnTimeRemaining > 0) {
      const interval = setInterval(() => {
        setTurnTimeRemaining((prev) =>
          prev !== null && prev > 0 ? prev - 1 : 0,
        );
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [
    game?.state.thinkingPlayerId,
    game?.turnTimeoutMs,
    lastThinkingPlayer,
    turnTimeRemaining,
  ]);

  // Next hand countdown effect
  useEffect(() => {
    if (!game) return;

    const currentPhase = game.state.phase;
    const handHistory = game.handHistory || [];
    const lastHand = handHistory[handHistory.length - 1];

    // When phase is showdown and we have a winner, start countdown
    if (
      currentPhase === "showdown" &&
      lastHand?.winnerModelIds?.length &&
      nextHandCountdown === null &&
      game.status === "active"
    ) {
      // Only start if this is a new hand result (compare hand number, not winner)
      if (lastHand.handNumber !== lastHandNumber || lastHandNumber === 0) {
        const winnerId = lastHand.winnerModelIds[0];
        if (winnerId) {
          setLastHandWinner({
            modelId: winnerId,
            amount: lastHand.pot || 0,
          });
          setNextHandCountdown(5);
          // Play victory sound when hand completes with a winner
          play("victory");
        }
      }
    }

    // Clear winner info when phase changes away from showdown
    if (currentPhase !== "showdown" && lastHandWinner) {
      setLastHandWinner(null);
      setNextHandCountdown(null);
    }
  }, [
    game?.state.phase,
    game?.handHistory,
    game?.currentHand,
    game?.status,
    lastHandNumber,
    lastHandWinner,
    nextHandCountdown,
    play,
  ]);

  // Countdown interval effect
  useEffect(() => {
    if (nextHandCountdown !== null && nextHandCountdown > 0) {
      const interval = setInterval(() => {
        setNextHandCountdown((prev) =>
          prev !== null && prev > 0 ? prev - 1 : 0,
        );
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [nextHandCountdown]);

  // Game duration timer effect
  useEffect(() => {
    if (!game?.createdAt) return;

    // For completed games, show final duration
    if (game.status === "completed" && game.completedAt) {
      setGameDuration(Math.floor((game.completedAt - game.createdAt) / 1000));
      return;
    }

    // For active games, update every second
    const updateDuration = () => {
      setGameDuration(Math.floor((Date.now() - game.createdAt) / 1000));
    };
    updateDuration();

    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [game?.createdAt, game?.completedAt, game?.status]);

  // Loading sequence - skip for completed games
  useEffect(() => {
    if (!game) return;

    // Skip loading animation for completed games - go straight to summary
    if (game.status === "completed") {
      setShowLoading(false);
      return;
    }

    play("load");

    const prepareTimer = setTimeout(() => setLoadingPhase("preparing"), 2000);
    const doneTimer = setTimeout(() => setLoadingPhase("done"), 4000);

    // Play deal sounds during card flip
    const dealTimers = [0, 1, 2, 3, 4].map((i) =>
      setTimeout(() => playDeal(), 2150 + i * 150),
    );

    const exitTimer = setTimeout(() => {
      stopAll(); // Stop the loading sound
      setShowLoading(false);
      startMusic();
    }, 5000);

    return () => {
      clearTimeout(prepareTimer);
      clearTimeout(doneTimer);
      clearTimeout(exitTimer);
      dealTimers.forEach(clearTimeout);
    };
  }, [game?._id, game?.status]);

  // Card deal animation on new hand
  useEffect(() => {
    if (!game || showLoading) return;

    if (game.currentHand !== lastHandNumber) {
      setLastHandNumber(game.currentHand);
      setRevealedPlayers(new Set());

      // Reveal cards one by one
      const state = game.state;
      const playerIds = state.playerStates.map((p) => p.modelId);
      let delay = 0;
      playerIds.forEach((playerId) => {
        setTimeout(() => {
          playDeal();
          setRevealedPlayers((prev) => new Set([...prev, playerId]));
        }, delay);
        delay += 200;
        setTimeout(() => playDeal(), delay);
        delay += 200;
      });
    }
  }, [game?.currentHand, showLoading, lastHandNumber, playDeal]);

  // Action sound effects - play sounds when new actions appear in actionLog
  useEffect(() => {
    if (!game || showLoading) return;

    const actionLog = game.state.actionLog || [];
    if (actionLog.length === 0) return;

    // Find new actions since last check
    const newActions = actionLog.filter(
      (action) => action.timestamp > lastActionTimestampRef.current
    );

    if (newActions.length > 0) {
      // Update the ref to the latest timestamp
      const latestTimestamp = Math.max(...newActions.map((a) => a.timestamp));
      lastActionTimestampRef.current = latestTimestamp;

      // Play sound for the most recent action only (to avoid sound overlap)
      const latestAction = newActions[newActions.length - 1];

      // Only play sounds for player actions (not system/phase messages)
      if (latestAction.type === "action" && latestAction.action) {
        if (latestAction.isAllIn) {
          play("allIn");
        } else {
          switch (latestAction.action) {
            case "call":
              play("call");
              break;
            case "raise":
              play("raise");
              break;
            case "fold":
              play("fold");
              break;
            case "check":
              play("check");
              break;
          }
        }
      }
    }
  }, [game?.state.actionLog, showLoading, play]);

  // Transform game state
  const {
    playerStates,
    communityCards,
    phase,
    potSize,
    currentPlayerId,
    thinkingPlayerId,
    actionLog,
    sortedByChips,
    pots,
  } = useMemo(() => {
    if (!game) {
      return {
        playerStates: [],
        communityCards: [] as CardType[],
        phase: "preflop",
        potSize: 0,
        currentPlayerId: null,
        thinkingPlayerId: null,
        actionLog: [],
        sortedByChips: [],
        pots: [] as Pot[],
      };
    }

    const state = game.state;
    const playerStates = state.playerStates;

    const communityCards: CardType[] = state.communityCards.map((c) => ({
      suit: c.suit as CardType["suit"],
      rank: c.rank as CardType["rank"],
    }));

    const currentPlayer = playerStates[state.currentPlayerIndex];
    const currentPlayerId = currentPlayer?.modelId || null;

    const sortedByChips = [...playerStates].sort((a, b) => b.chips - a.chips);

    // Calculate pots (main pot + side pots)
    const pots = calculatePots(playerStates);

    return {
      playerStates,
      communityCards,
      phase: state.phase,
      potSize: state.pot,
      currentPlayerId,
      thinkingPlayerId: state.thinkingPlayerId,
      actionLog: state.actionLog || [],
      sortedByChips,
      pots,
    };
  }, [game]);

  // Create community card slots (5 total)
  const communityCardSlots = useMemo(() => {
    const slots: (CardType | null)[] = [null, null, null, null, null];
    communityCards.forEach((card, i) => {
      slots[i] = card;
    });
    return slots;
  }, [communityCards]);

  // Calculate win probabilities and evaluate hands
  useEffect(() => {
    if (!game || game.status !== "active") return;

    const activePlayers = playerStates.filter(
      (p) => !p.folded && p.hand && p.hand.length === 2,
    );

    // Need at least 2 active players to calculate odds
    if (activePlayers.length < 2) {
      setPlayerOdds(new Map());
      setEvaluatedHands(new Map());
      return;
    }

    // Evaluate hands when we have community cards (flop or later)
    if (communityCards.length >= 3) {
      const newEvaluatedHands = new Map<string, EvaluatedHand>();
      for (const player of activePlayers) {
        try {
          const hand = evaluateHand(
            player.hand.map((c) => ({
              suit: c.suit as CardType["suit"],
              rank: c.rank as CardType["rank"],
            })),
            communityCards,
          );
          newEvaluatedHands.set(player.modelId, hand);
        } catch (e) {
          console.error(`Failed to evaluate hand for ${player.modelId}:`, e);
        }
      }
      setEvaluatedHands(newEvaluatedHands);
    } else {
      setEvaluatedHands(new Map());
    }

    // Calculate odds using Monte Carlo simulation (in Web Worker to avoid blocking UI)
    const playersForOdds = activePlayers.map((p) => ({
      playerId: p.modelId,
      holeCards: p.hand.map((c) => ({
        suit: c.suit as CardType["suit"],
        rank: c.rank as CardType["rank"],
      })),
    }));

    calculateOddsAsync(playersForOdds, communityCards)
      .then((odds) => {
        const newOdds = new Map<string, number>();
        odds.forEach((playerOdds) => {
          newOdds.set(playerOdds.playerId, playerOdds.winPercentage);
        });
        setPlayerOdds(newOdds);
      })
      .catch((e) => {
        console.error("Failed to calculate odds:", e);
      });
  }, [game?.status, playerStates, communityCards]);

  // Loading state (query still pending)
  if (game === undefined) {
    return <LoadingSkeleton />;
  }

  // Game not found
  if (game === null) {
    return <GameNotFound />;
  }

  const isLive = game.status === "active";
  const isCompleted = game.status === "completed";
  const isShowdown = phase === "showdown";

  // Show full-page GameSummary when game is completed (after loading)
  if (isCompleted && !showLoading) {
    return <GameSummary game={game as any} />;
  }

  return (
    <div className="min-h-screen bg-neutral-100 relative isolate">
      <CardBackground cardCount={15} opacity={0.1} />

      {/* Loading Screen */}
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
                  className="w-[97px] h-[129px] border border-neutral-900 overflow-hidden"
                  style={{ perspective: "1000px" }}
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
                      delay: 2.0 + 0.6 + i * 0.15,
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
                      Connecting to game...
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
                      {playerStates.length} AI models competing
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
                      Ready
                    </div>
                    <div className="text-green-600 font-mono text-xs mt-1">
                      {isLive ? "LIVE GAME" : "REPLAY MODE"}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Content */}
      {!showLoading && (
        <motion.div
          key="game-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="p-4 relative z-10"
        >
          <div className="max-w-6xl mx-auto">
            {/* Top Nav Bar - No border */}
            <div className="flex items-center justify-between mb-2 px-2">
              <Link
                href="/"
                className="text-sm text-neutral-700 hover:text-neutral-900 transition-colors font-mono"
              >
                ← EXIT
              </Link>
              <div className="flex items-center gap-1">
                <AboutModal />
                <MusicIndicator track="game" />
                <SettingsModal />
              </div>
            </div>

            {/* Game Info Bar - With border */}
            <div className="flex items-center justify-between mb-4 p-2 bg-white border border-neutral-900">
              <div className="flex items-center gap-2">
                {isLive && (
                  <span className="w-2 h-2 bg-red-500 animate-pulse" />
                )}
                <span className="font-mono font-bold text-neutral-900">
                  GAME #{gameId.slice(-6).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-neutral-500 tabular-nums">
                  {formatDuration(gameDuration)}
                </span>
                <div className="w-px h-4 bg-neutral-300" />
                {isLive ? (
                  <span className="flex items-center gap-2 text-xs font-mono text-white px-3 py-1 bg-red-600">
                    <span className="w-1.5 h-1.5 bg-white animate-pulse" />
                    LIVE
                  </span>
                ) : (
                  <span className="text-xs font-mono text-neutral-700 px-3 py-1 bg-neutral-200">
                    {game.status.toUpperCase()}
                  </span>
                )}
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
                    <div className="flex items-center gap-3">
                      {pots.length > 0 ? (
                        pots.map((pot, index) => (
                          <div key={index} className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "text-[10px] font-mono uppercase tracking-wider",
                                pot.isMainPot
                                  ? "text-emerald-300/70"
                                  : "text-amber-400/80",
                              )}
                            >
                              {pot.isMainPot ? "MAIN" : `SIDE ${index}`}
                            </span>
                            <span
                              className={cn(
                                "text-lg font-bold font-mono flex items-center",
                                pot.isMainPot
                                  ? "text-emerald-200"
                                  : "text-amber-300",
                              )}
                            >
                              $
                              <NumberFlow
                                value={pot.amount}
                                format={{ notation: "standard" }}
                              />
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-emerald-300/70 font-mono uppercase tracking-wider">
                            POT
                          </span>
                          <span className="text-lg font-bold text-emerald-200 font-mono flex items-center">
                            $
                            <NumberFlow
                              value={potSize}
                              format={{ notation: "standard" }}
                            />
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status Badge + Timer */}
                    <div className="flex items-center gap-2">
                      {/* Turn Timer */}
                      <AnimatePresence>
                        {turnTimeRemaining !== null && thinkingPlayerId && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className={cn(
                              "flex items-center px-2 py-1 font-mono font-bold text-xs tabular-nums",
                              turnTimeRemaining <= 5
                                ? "bg-red-600 text-white"
                                : turnTimeRemaining <= 10
                                  ? "bg-amber-500 text-neutral-900"
                                  : "bg-emerald-600 text-white",
                            )}
                          >
                            {turnTimeRemaining}s
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <AnimatePresence mode="wait">
                        {thinkingPlayerId && (
                          <motion.div
                            key="thinking-badge"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-purple-600"
                          >
                            <div className="w-1.5 h-1.5 bg-white animate-pulse" />
                            <span className="text-xs font-mono text-white">
                              {thinkingPlayerId
                                ? getModelDisplayName(thinkingPlayerId)
                                : "AI"}{" "}
                              THINKING
                            </span>
                          </motion.div>
                        )}
                        {isShowdown && (
                          <motion.div
                            key="showdown-badge"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2"
                          >
                            <span className="px-3 py-1 bg-amber-500 text-white text-xs font-mono font-bold animate-pulse">
                              SHOWDOWN
                            </span>
                            {(() => {
                              const lastHand =
                                game.handHistory?.[game.handHistory.length - 1];
                              if (!lastHand?.winnerModelIds?.length)
                                return null;
                              const winnerModelId = lastHand.winnerModelIds[0];
                              const winnerName =
                                getModelDisplayName(winnerModelId);
                              const winAmount = lastHand.pot || 0;
                              return (
                                <span className="px-3 py-1 bg-green-600 text-white text-xs font-mono font-bold">
                                  {winnerName} WINS $
                                  {winAmount.toLocaleString()}
                                </span>
                              );
                            })()}
                          </motion.div>
                        )}
                        {!thinkingPlayerId &&
                          !isShowdown &&
                          lastHandWinner &&
                          nextHandCountdown !== null && (
                            <motion.div
                              key="next-hand-badge"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex items-center gap-2"
                            >
                              <span className="px-3 py-1 bg-green-600 text-white text-xs font-mono font-bold">
                                {getModelDisplayName(lastHandWinner.modelId)}{" "}
                                WINS ${lastHandWinner.amount.toLocaleString()}
                              </span>
                              {nextHandCountdown > 0 && (
                                <span className="px-3 py-1 bg-neutral-700 text-white text-xs font-mono font-bold">
                                  NEXT HAND IN {nextHandCountdown}S
                                </span>
                              )}
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Community Cards Area */}
                  <div className="flex items-center justify-center py-16 px-3">
                    <div className="flex items-center gap-2">
                      {/* FLOP: cards 0-2 */}
                      <div className="flex gap-2">
                        {communityCardSlots.slice(0, 3).map((card, i) => (
                          <div key={`flop-${i}`} className="relative">
                            {card ? (
                              <Card card={card} size="lg" delay={i * 0.15} />
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

                      <div className="w-0.5 h-16 bg-emerald-500/20 mx-1" />

                      {/* TURN: card 3 */}
                      <div className="relative">
                        {communityCardSlots[3] ? (
                          <Card
                            card={communityCardSlots[3]}
                            size="lg"
                            delay={0.45}
                          />
                        ) : (
                          <div className="w-[97px] h-[129px] border-2 border-dashed border-emerald-500/30 bg-emerald-900/20 flex items-center justify-center">
                            <span className="text-emerald-400/40 text-[10px] font-mono">
                              TURN
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="w-0.5 h-16 bg-emerald-500/20 mx-1" />

                      {/* RIVER: card 4 */}
                      <div className="relative">
                        {communityCardSlots[4] ? (
                          <Card
                            card={communityCardSlots[4]}
                            size="lg"
                            delay={0.6}
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

                  {/* Bottom Bar */}
                  <div className="flex items-center justify-center gap-3 px-4 py-2 bg-emerald-900/40 min-h-[36px]">
                    <span className="text-xs text-emerald-400/50 font-mono">
                      {phase.toUpperCase()}
                    </span>
                    {nextHandCountdown !== null && nextHandCountdown > 0 && (
                      <span className="text-xs text-emerald-300 font-mono font-bold">
                        • Next Hand in {nextHandCountdown}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Player Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {playerStates.map((player, playerIndex) => {
                    const character = getCharacterById(player.characterId);
                    const isFolded = player.folded;
                    const isAllIn = player.isAllIn;
                    const isCurrentTurn = player.modelId === currentPlayerId;
                    const isThinking = player.modelId === thinkingPlayerId;
                    const holeCards = player.hand as CardType[];
                    const isRevealed = revealedPlayers.has(player.modelId);
                    // Spectators always see all cards (unless folded)
                    const showCards = true;

                    // Find last action for this player in CURRENT HAND only
                    const lastAction = [...actionLog]
                      .reverse()
                      .find(
                        (a) =>
                          a.playerId === player.modelId &&
                          (a.handNumber === game.currentHand ||
                            a.handNumber === undefined),
                      );

                    // Check if player won current hand (during showdown)
                    const lastHand =
                      game.handHistory?.[game.handHistory.length - 1];
                    const isWinner =
                      isShowdown &&
                      lastHand?.winnerModelIds?.includes(player.modelId);
                    const winAmount = isWinner && lastHand ? lastHand.pot : 0;

                    // Check if player is busted (0 chips and NOT all-in)
                    const isBusted = player.chips === 0 && !isAllIn;

                    return (
                      <div
                        key={`player-${playerIndex}`}
                        className={cn(
                          "border border-neutral-900 bg-white flex flex-col relative overflow-hidden transition-transform duration-200",
                          isCurrentTurn && !isFolded && "scale-105 z-10",
                          isFolded && "brightness-90",
                        )}
                      >
                        {/* Status Badge Row */}
                        <div className="flex items-center justify-center gap-1.5 px-3 pt-2 pb-1 min-h-[24px] flex-wrap">
                          {isWinner ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-600 text-white"
                            >
                              <span className="text-[9px] font-mono font-bold">
                                WIN
                              </span>
                              {winAmount > 0 && (
                                <span className="text-[9px] font-mono font-bold tabular-nums">
                                  ${winAmount}
                                </span>
                              )}
                            </motion.div>
                          ) : isAllIn ? (
                            <span className="text-[9px] font-mono font-bold text-neutral-900 px-2 py-0.5 bg-yellow-400">
                              ALL IN ${player.totalBetThisHand.toLocaleString()}
                            </span>
                          ) : isBusted ? (
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-neutral-800 text-white">
                              BUSTED
                            </span>
                          ) : isThinking && !isFolded ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-600"
                            >
                              <div className="w-1.5 h-1.5 bg-white animate-pulse shrink-0" />
                              <span className="text-[9px] font-mono font-bold text-white leading-none">
                                THINKING
                              </span>
                            </motion.div>
                          ) : isFolded ? (
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-red-800 text-white">
                              FOLD
                            </span>
                          ) : lastAction?.action ? (
                            <div
                              className={cn(
                                "flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold",
                                lastAction.action === "raise" &&
                                "bg-amber-500 text-neutral-900",
                                lastAction.action === "call" &&
                                "bg-blue-600 text-white",
                                lastAction.action === "check" &&
                                "bg-green-600 text-white",
                                (lastAction.action === "post_sb" ||
                                  lastAction.action === "post_bb") &&
                                "bg-neutral-900 text-white",
                              )}
                            >
                              <span>
                                {lastAction.action === "post_sb"
                                  ? "SB"
                                  : lastAction.action === "post_bb"
                                    ? "BB"
                                    : lastAction.action.toUpperCase()}
                              </span>
                              {lastAction.action !== "check" &&
                                lastAction.action !== "fold" &&
                                lastAction.amount !== undefined &&
                                lastAction.amount > 0 && (
                                  <span className="tabular-nums">
                                    ${lastAction.amount}
                                  </span>
                                )}
                            </div>
                          ) : null}
                          {/* Hand Rank Badge */}
                          {!isFolded &&
                            !isBusted &&
                            communityCards.length >= 3 &&
                            evaluatedHands.get(player.modelId) && (
                              <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-neutral-200 text-neutral-700">
                                {evaluatedHands.get(player.modelId)?.rankName}
                              </span>
                            )}
                        </div>

                        <div className="px-3 pb-2">
                          {/* Cards */}
                          <div
                            className="flex justify-center gap-2 mb-2"
                            style={{ perspective: "1000px" }}
                          >
                            {isBusted ? (
                              // Show grayed face-down cards for busted players
                              <>
                                <div className="w-16 h-[86px] grayscale brightness-50 opacity-50">
                                  <Card faceDown size="md" />
                                </div>
                                <div className="w-16 h-[86px] grayscale brightness-50 opacity-50">
                                  <Card faceDown size="md" />
                                </div>
                              </>
                            ) : holeCards.length > 0 ? (
                              holeCards.map((card, i) => (
                                <div
                                  key={`${player.modelId}-card-${i}`}
                                  className={cn(
                                    "relative w-16 h-[86px] card-flip-container",
                                    isRevealed && "revealed",
                                    i === 1 && "delay-1",
                                    isFolded && "grayscale brightness-75",
                                  )}
                                >
                                  <div className="absolute inset-0 card-flip-face">
                                    <Card faceDown size="md" />
                                  </div>
                                  <div className="absolute inset-0 card-flip-face card-flip-back">
                                    <Card
                                      card={showCards ? card : undefined}
                                      faceDown={!showCards}
                                      size="md"
                                    />
                                  </div>
                                </div>
                              ))
                            ) : (
                              <>
                                <div className="w-16 h-[86px] bg-white border border-neutral-900" />
                                <div className="w-16 h-[86px] bg-white border border-neutral-900" />
                              </>
                            )}
                          </div>

                          {/* Chip Stack */}
                          <div className="text-center mb-2">
                            <span className="font-mono font-bold text-neutral-900 text-lg tabular-nums">
                              $<NumberFlow value={player.chips} />
                            </span>
                          </div>

                          {/* Logo + Name + Position */}
                          <div className="flex items-center gap-2">
                            {(() => {
                              const ModelIcon = getModelIcon(player.modelId);
                              return (
                                <div
                                  className={cn(
                                    "w-8 h-8 shrink-0 flex items-center justify-center",
                                    isFolded && "grayscale brightness-75",
                                  )}
                                >
                                  {ModelIcon && <ModelIcon size={32} />}
                                </div>
                              );
                            })()}
                            <div className="flex-1 min-w-0">
                              <span
                                className={cn(
                                  "font-mono font-bold text-xs truncate block",
                                  isFolded
                                    ? "text-neutral-700"
                                    : "text-neutral-900",
                                )}
                              >
                                {getModelDisplayName(player.modelId)}
                              </span>
                              <div className="text-[9px] font-mono text-neutral-700 mt-0.5 flex items-center gap-1">
                                <div
                                  className="w-2 h-2 shrink-0"
                                  style={{
                                    backgroundColor: isBusted
                                      ? "#525252"
                                      : isFolded
                                        ? "#525252"
                                        : getModelColor(player.modelId),
                                  }}
                                />
                                {!isBusted && (
                                  <>
                                    <span className="px-1 bg-neutral-200 text-neutral-600">
                                      {getPositionName(
                                        playerIndex,
                                        game.state.dealerIndex,
                                        playerStates.length,
                                      )}
                                    </span>
                                    {playerIndex === game.state.dealerIndex && (
                                      <span className="px-1 bg-neutral-900 text-white">
                                        D
                                      </span>
                                    )}
                                  </>
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
                      {game.currentHand}/{game.maxHands}
                    </div>
                  </div>
                  <div className="w-px bg-neutral-900" />
                  <div className="flex-1 flex flex-col items-center justify-center py-2">
                    <div className="text-[9px] font-mono text-neutral-500 uppercase">
                      Phase
                    </div>
                    <div className="text-sm font-mono font-bold text-neutral-900 uppercase">
                      {phase}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="px-3 pt-3 flex flex-col flex-1 min-h-0">
                  {/* Chip Leaderboard */}
                  <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                    Leaderboard
                  </div>
                  <div className="space-y-1 mb-3">
                    {sortedByChips.map((player, idx) => {
                      const startingChips = game.buyIn;
                      const changePercent = Math.round(
                        ((player.chips - startingChips) / startingChips) * 100,
                      );
                      const isPositive = changePercent > 0;
                      const isNegative = changePercent < 0;

                      return (
                        <div
                          key={`ranking-${idx}`}
                          className={cn(
                            "flex items-center justify-between py-1 px-2",
                            idx === 0 && "bg-neutral-100",
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-neutral-600 w-4">
                              {idx + 1}.
                            </span>
                            <div
                              className="w-2 h-2 shrink-0"
                              style={{
                                backgroundColor: getModelColor(player.modelId),
                              }}
                            />
                            <span className="text-[11px] font-mono text-neutral-900 truncate">
                              {getModelDisplayName(player.modelId)}
                            </span>
                          </div>
                          <div className="flex items-center shrink-0">
                            <span className="text-[11px] font-mono font-bold text-neutral-900 tabular-nums w-16 text-right">
                              ${player.chips.toLocaleString()}
                            </span>
                            <span
                              className={cn(
                                "flex items-center text-[10px] font-mono tabular-nums w-14 justify-end",
                                isPositive && "text-green-500",
                                isNegative && "text-red-500",
                                changePercent === 0 && "text-neutral-600",
                              )}
                            >
                              {changePercent !== 0 ? (
                                <>
                                  {isPositive ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
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

                  <div className="border-t border-neutral-900 my-2 -mx-3" />

                  {/* Win Probability Widget */}
                  {isLive && playerOdds.size > 0 && (
                    <>
                      <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                        Win Probability
                      </div>
                      <div className="space-y-2.5 mb-3">
                        {sortedByChips
                          .filter((p) => p.chips > 0 || p.folded) // Include folded players
                          .sort((a, b) => {
                            // Folded players go to bottom
                            if (a.folded && !b.folded) return 1;
                            if (!a.folded && b.folded) return -1;
                            // Sort by odds
                            return (
                              (playerOdds.get(b.modelId) || 0) -
                              (playerOdds.get(a.modelId) || 0)
                            );
                          })
                          .map((player) => {
                            const odds = playerOdds.get(player.modelId) || 0;
                            const ModelIcon = getModelIcon(player.modelId);
                            const isFolded = player.folded;
                            return (
                              <div
                                key={`odds-${player.modelId}`}
                                className={cn(
                                  "space-y-0.5",
                                  isFolded && "opacity-40",
                                )}
                              >
                                {/* Row 1: Icon + Name (left) | Win% or FOLD (right) */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 flex items-center justify-center">
                                      {ModelIcon && <ModelIcon size={14} />}
                                    </div>
                                    <span className="text-[11px] font-mono text-neutral-900">
                                      {getModelDisplayName(player.modelId)}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-mono font-bold tabular-nums text-neutral-900">
                                    {isFolded ? "FOLD" : `${odds.toFixed(0)}%`}
                                  </span>
                                </div>
                                {/* Row 2: Progress bar */}
                                <div className="h-1 bg-neutral-200 overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full transition-all duration-500",
                                      !isFolded && odds >= 50 && "bg-green-500",
                                      !isFolded && odds >= 25 && odds < 50 && "bg-yellow-500",
                                      (isFolded || odds < 25) && "bg-red-500",
                                    )}
                                    style={{ width: isFolded ? "0%" : `${odds}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      <div className="border-t border-neutral-900 my-2 -mx-3" />
                    </>
                  )}

                  {/* Live Action Report */}
                  <div className="text-[10px] font-mono text-neutral-700 mb-2 uppercase tracking-wider">
                    Live Action Report
                  </div>
                  <div className="h-[300px] overflow-y-auto space-y-1.5 pb-3">
                    {[...actionLog].reverse().map((entry, i) => {
                      const getActionBorderColor = () => {
                        if (entry.type === "phase") return "border-blue-500";
                        if (entry.type === "system")
                          return "border-neutral-400";
                        if (entry.isAllIn) return "border-yellow-500";
                        switch (entry.action) {
                          case "fold":
                            return "border-red-500";
                          case "call":
                            return "border-blue-500";
                          case "post_sb":
                          case "post_bb":
                            return "border-purple-500";
                          case "check":
                            return "border-green-500";
                          case "raise":
                            return "border-amber-500";
                          default:
                            return "border-neutral-600";
                        }
                      };

                      // System or phase messages
                      if (entry.type === "system" || entry.type === "phase") {
                        // Check if this is a win message (content includes "wins $")
                        const isWinMessage = entry.content?.includes("wins $");

                        if (isWinMessage && entry.playerId && entry.playerId !== "system") {
                          // Parse win amount from content like "SONNET wins $180 with Two Pair"
                          const winMatch = entry.content?.match(/wins \$(\d+)/);
                          const winAmount = winMatch ? winMatch[1] : "0";
                          const handMatch = entry.content?.match(/with (.+)$/);
                          const handName = handMatch ? handMatch[1] : null;

                          return (
                            <div
                              key={`${entry.timestamp}-${i}`}
                              className="text-[10px] font-mono p-2 border-l-2 border-green-500 bg-white"
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <div
                                  className="w-1.5 h-1.5"
                                  style={{
                                    backgroundColor: getModelColor(entry.playerId),
                                  }}
                                />
                                <span className="font-bold text-neutral-900">
                                  {getModelDisplayName(entry.playerId)}
                                </span>
                                <span className="px-1.5 py-0.5 text-[9px] font-bold text-white bg-green-600">
                                  WINS
                                </span>
                                <span className="text-neutral-600">
                                  ${winAmount}
                                </span>
                              </div>
                              {handName && (
                                <div className="text-neutral-500 text-[9px]">
                                  {handName}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={`${entry.timestamp}-${i}`}
                            className={cn(
                              "text-[10px] font-mono p-1.5 border-l-2",
                              entry.type === "phase"
                                ? "border-blue-500 bg-blue-50"
                                : "border-neutral-400 bg-neutral-100",
                            )}
                          >
                            <span className="text-neutral-600">
                              {entry.content || entry.action}
                            </span>
                          </div>
                        );
                      }

                      // Action messages
                      return (
                        <div
                          key={`${entry.timestamp}-${i}`}
                          className={cn(
                            "text-[10px] font-mono p-1.5 border-l-2 bg-white",
                            getActionBorderColor(),
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div
                              className="w-1.5 h-1.5"
                              style={{
                                backgroundColor: getModelColor(entry.playerId || ""),
                              }}
                            />
                            <span className="font-bold text-neutral-900">
                              {getModelDisplayName(entry.playerId || "")}
                            </span>
                            {entry.position && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold text-neutral-500 bg-neutral-100">
                                {entry.position}
                              </span>
                            )}
                            <span
                              className={cn(
                                "px-1.5 py-0.5 text-[9px] font-bold text-white",
                                entry.isAllIn && "bg-yellow-500 text-neutral-900",
                                !entry.isAllIn && entry.action === "raise" && "bg-amber-500 text-neutral-900",
                                !entry.isAllIn && entry.action === "call" && "bg-blue-600",
                                entry.action === "check" && "bg-green-600",
                                entry.action === "fold" && "bg-red-700",
                                (entry.action === "post_sb" ||
                                  entry.action === "post_bb") &&
                                "bg-neutral-900",
                              )}
                            >
                              {entry.isAllIn
                                ? "ALL IN"
                                : entry.action === "post_sb"
                                  ? "SB"
                                  : entry.action === "post_bb"
                                    ? "BB"
                                    : entry.action?.toUpperCase()}
                            </span>
                            {entry.action !== "check" &&
                              entry.action !== "fold" &&
                              entry.amount !== undefined &&
                              entry.amount > 0 && (
                                <span className="text-neutral-600">
                                  ${entry.amount}
                                </span>
                              )}
                          </div>
                          {entry.reasoning && (
                            <div className="text-neutral-600 break-words text-[9px] leading-relaxed">
                              {entry.reasoning}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {actionLog.length === 0 && (
                      <div className="text-neutral-600 text-[10px]">
                        Waiting for actions...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Final Results */}
            {isCompleted && game.results && (
              <div className="bg-white border border-neutral-900 p-6">
                <h2 className="text-lg font-mono font-bold text-neutral-900 mb-4">
                  FINAL RESULTS
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {game.results
                    .slice()
                    .sort((a, b) => b.profit - a.profit)
                    .map((result, index) => {
                      const player = playerStates.find(
                        (p) => p.modelId === result.modelId,
                      );
                      const character = getCharacterById(
                        player?.characterId || "",
                      );

                      return (
                        <div
                          key={`result-${index}`}
                          className={cn(
                            "p-4 border border-neutral-900",
                            index === 0 && "bg-yellow-50",
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {index === 0 && (
                              <span className="w-6 h-6 bg-yellow-400 flex items-center justify-center text-xs font-bold text-black">
                                1
                              </span>
                            )}
                            <div
                              className="w-3 h-3"
                              style={{
                                backgroundColor: character?.color || "#6B7280",
                              }}
                            />
                            <span className="font-mono font-bold text-sm">
                              {player?.codename ||
                                abbreviateModel(result.modelId)}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "font-mono font-bold text-xl",
                              result.profit >= 0
                                ? "text-green-600"
                                : "text-red-600",
                            )}
                          >
                            {result.profit >= 0 ? "+" : ""}$
                            {result.profit.toLocaleString()}
                          </div>
                          <div className="font-mono text-xs text-neutral-500 mt-1">
                            Final: ${result.finalChips.toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="max-w-6xl mx-auto p-4">
        <div className="h-12 bg-neutral-200 animate-pulse mb-4" />
        <div className="grid grid-cols-[1fr_320px] gap-3">
          <div className="space-y-3">
            <div className="h-[300px] bg-neutral-200 animate-pulse" />
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-[200px] bg-neutral-200 animate-pulse"
                />
              ))}
            </div>
          </div>
          <div className="h-[500px] bg-neutral-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;

function GameNotFound() {
  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-center relative overflow-hidden">
      <CardBackground cardCount={12} opacity={0.2} />

      {/* Content */}
      <div className="relative z-10 text-center">
        <h1
          className="font-mono font-black text-neutral-900 leading-none"
          style={{ fontSize: "clamp(4rem, 20vw, 12rem)" }}
        >
          GAME
        </h1>
        <h2
          className="font-mono font-black text-neutral-400 leading-none -mt-2"
          style={{ fontSize: "clamp(2rem, 10vw, 6rem)" }}
        >
          NOT FOUND
        </h2>
        <p className="text-neutral-600 font-mono text-lg mt-6 mb-8">
          This game doesn&apos;t exist or has been deleted
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-neutral-900 text-white font-mono font-bold hover:bg-neutral-800 transition-colors"
        >
          Back to Lobby
        </Link>
      </div>

      {/* Decorative cards at corners */}
      <div className="absolute bottom-8 left-8 flex gap-2 opacity-40">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border border-neutral-900"
            style={{
              width: CARD_WIDTH * 0.5,
              height: CARD_HEIGHT * 0.5,
              backgroundImage: "url(/assets/cards/playing_cards.png)",
              backgroundSize: `${CARD_WIDTH * SPRITE_COLS * 0.5}px ${CARD_HEIGHT * SPRITE_ROWS * 0.5}px`,
              backgroundPosition: `${-14 * CARD_WIDTH * 0.5}px 0px`,
              imageRendering: "pixelated",
              transform: `rotate(${-5 + i * 5}deg)`,
            }}
          />
        ))}
      </div>

      <div className="absolute top-8 right-8 flex gap-2 opacity-40">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border border-neutral-900"
            style={{
              width: CARD_WIDTH * 0.5,
              height: CARD_HEIGHT * 0.5,
              backgroundImage: "url(/assets/cards/playing_cards.png)",
              backgroundSize: `${CARD_WIDTH * SPRITE_COLS * 0.5}px ${CARD_HEIGHT * SPRITE_ROWS * 0.5}px`,
              backgroundPosition: `${-14 * CARD_WIDTH * 0.5}px 0px`,
              imageRendering: "pixelated",
              transform: `rotate(${175 + i * 5}deg)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
