"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Trophy, Flame, Shield, Sparkles, Zap } from "lucide-react";
import NumberFlow from "@number-flow/react";

import { CardBackground } from "@/components/CardBackground";
import {
  getModelColor,
  getModelDisplayName,
  getModelIcon,
} from "@/components/model-icons";
import { cn } from "@/lib/utils";

// Types based on Convex schema
interface Card {
  suit: string;
  rank: string;
}

interface PlayerState {
  modelId: string;
  codename: string;
  characterId: string;
  chips: number;
  hand: Card[];
  currentBet: number;
  totalBetThisHand: number;
  folded: boolean;
  isAllIn: boolean;
  hasActed: boolean;
  position: number;
}

interface InGameStats {
  handsDealt: number;
  handsPlayed: number;
  preflopRaises: number;
  preflopCalls: number;
  preflopFolds: number;
  totalBets: number;
  totalRaises: number;
  totalCalls: number;
  totalFolds: number;
  totalChecks: number;
  showdownsReached: number;
  showdownsWon: number;
  foldedToRaise: number;
  raisesFaced: number;
  timeouts: number;
}

interface HandHistoryEntry {
  handNumber: number;
  pot: number;
  communityCards: Card[];
  winnerModelIds: string[];
  winCondition: string;
  actions: {
    modelId: string;
    action: string;
    amount?: number;
    phase: string;
    timestamp: number;
  }[];
}

interface GameResult {
  modelId: string;
  buyIn: number;
  finalChips: number;
  profit: number;
}

interface GameData {
  _id: string;
  status: "waiting" | "active" | "completed" | "cancelled";
  buyIn: number;
  blinds: { small: number; big: number };
  maxHands: number;
  turnTimeoutMs: number;
  currentHand: number;
  playerModelIds: string[];
  results?: GameResult[];
  state: {
    phase: string;
    pot: number;
    communityCards: Card[];
    currentPlayerIndex: number;
    dealerIndex: number;
    playerStates: PlayerState[];
    inGameStats: { modelId: string; stats: InGameStats }[];
  };
  handHistory?: HandHistoryEntry[];
  createdAt: number;
  completedAt?: number;
  durationMs?: number;
}

interface GameSummaryProps {
  game: GameData;
}

// Format duration in mm:ss
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Calculate VPIP % (Voluntarily Put money In Pot)
function calculateVPIP(stats: InGameStats): number {
  if (stats.handsDealt === 0) return 0;
  const voluntaryActions = stats.preflopRaises + stats.preflopCalls;
  return Math.round((voluntaryActions / stats.handsDealt) * 100);
}

// Calculate Aggression Factor (bets + raises) / calls
function calculateAggressionFactor(stats: InGameStats): number {
  if (stats.totalCalls === 0) return stats.totalBets + stats.totalRaises > 0 ? 99 : 0;
  return Math.round(((stats.totalBets + stats.totalRaises) / stats.totalCalls) * 10) / 10;
}

// Calculate fold rate
function calculateFoldRate(stats: InGameStats): number {
  const totalActions = stats.totalBets + stats.totalRaises + stats.totalCalls + stats.totalFolds + stats.totalChecks;
  if (totalActions === 0) return 0;
  return Math.round((stats.totalFolds / totalActions) * 100);
}

export function GameSummary({ game }: GameSummaryProps) {
  const [copied, setCopied] = useState(false);

  // Compute all derived statistics
  const stats = useMemo(() => {
    const results = game.results || [];
    const inGameStats = game.state.inGameStats || [];
    const handHistory = game.handHistory || [];

    // Sort results by profit
    const sortedResults = [...results].sort((a, b) => b.profit - a.profit);
    const winner = sortedResults[0];

    // Get winner's stats
    const winnerStats = inGameStats.find((s) => s.modelId === winner?.modelId)?.stats;

    // Calculate game stats
    const totalPots = handHistory.reduce((sum, h) => sum + h.pot, 0);
    const avgPot = handHistory.length > 0 ? Math.round(totalPots / handHistory.length) : 0;
    const biggestPot = handHistory.length > 0 ? Math.max(...handHistory.map((h) => h.pot)) : 0;

    // Count hands won per player
    const handsWonByPlayer = new Map<string, number>();
    const showdownWinsByPlayer = new Map<string, number>();
    for (const hand of handHistory) {
      for (const winnerId of hand.winnerModelIds) {
        handsWonByPlayer.set(winnerId, (handsWonByPlayer.get(winnerId) || 0) + 1);
        if (hand.winCondition === "showdown") {
          showdownWinsByPlayer.set(winnerId, (showdownWinsByPlayer.get(winnerId) || 0) + 1);
        }
      }
    }

    // Calculate play style awards
    const playerAnalysis = inGameStats.map((p) => ({
      modelId: p.modelId,
      stats: p.stats,
      aggression: calculateAggressionFactor(p.stats),
      foldRate: calculateFoldRate(p.stats),
      showdownWins: showdownWinsByPlayer.get(p.modelId) || 0,
      vpip: calculateVPIP(p.stats),
    }));

    const mostAggressive = [...playerAnalysis].sort((a, b) => b.aggression - a.aggression)[0];
    const mostConservative = [...playerAnalysis].sort((a, b) => b.foldRate - a.foldRate)[0];
    const luckiest = [...playerAnalysis].sort((a, b) => b.showdownWins - a.showdownWins)[0];

    // Find biggest bluff (won pot with fold condition - meaning everyone else folded)
    const bluffWins = handHistory.filter((h) => h.winCondition === "all_folded");
    const biggestBluff = bluffWins.length > 0
      ? bluffWins.sort((a, b) => b.pot - a.pot)[0]
      : null;

    // Find notable moments
    const notableMoments: { hand: number; description: string }[] = [];

    // Find all-in confrontations
    for (const hand of handHistory) {
      const allInActions = hand.actions.filter((a) => a.action === "all_in" || a.amount && a.amount > 500);
      if (allInActions.length >= 2 && hand.winCondition === "showdown") {
        const winnerName = getModelDisplayName(hand.winnerModelIds[0]);
        notableMoments.push({
          hand: hand.handNumber,
          description: `All-in showdown - ${winnerName} wins $${hand.pot.toLocaleString()}`,
        });
      }
    }

    // Find eliminations (player going to 0 chips)
    // We can infer this from results where finalChips = 0
    const eliminatedPlayers = sortedResults.filter((r) => r.finalChips === 0);

    return {
      sortedResults,
      winner,
      winnerStats,
      avgPot,
      biggestPot,
      handsWonByPlayer,
      showdownWinsByPlayer,
      mostAggressive,
      mostConservative,
      luckiest,
      biggestBluff,
      notableMoments: notableMoments.slice(0, 3),
      eliminatedPlayers,
      playerAnalysis,
    };
  }, [game]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const duration = game.durationMs || (game.completedAt ? game.completedAt - game.createdAt : 0);

  return (
    <div className="min-h-screen bg-neutral-100 relative isolate">
      <CardBackground cardCount={15} opacity={0.08} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="p-4 relative z-10"
      >
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8 text-amber-500" />
              <div>
                <h1 className="font-mono font-bold text-xl text-neutral-900">
                  GAME COMPLETE
                </h1>
                <p className="font-mono text-xs text-neutral-500">
                  Game #{game._id.slice(-6).toUpperCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="px-4 py-2 bg-neutral-900 text-white font-mono text-sm hover:bg-neutral-800 transition-colors"
              >
                HOME
              </Link>
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 border border-neutral-900 bg-white font-mono text-sm hover:bg-neutral-100 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    COPIED
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    SHARE
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Winner Spotlight */}
          {stats.winner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-yellow-50 p-6 mb-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-500" />
                <span className="font-mono font-bold text-amber-700 text-sm">WINNER</span>
              </div>

              <div className="flex items-center gap-6">
                {/* Winner Icon */}
                <div className="shrink-0">
                  {(() => {
                    const ModelIcon = getModelIcon(stats.winner.modelId);
                    return ModelIcon ? <ModelIcon size={64} /> : null;
                  })()}
                </div>

                {/* Winner Info */}
                <div className="flex-1">
                  <h2 className="font-mono font-bold text-2xl text-neutral-900 mb-2">
                    {getModelDisplayName(stats.winner.modelId)}
                  </h2>
                  <div className="flex flex-wrap gap-4 text-sm font-mono">
                    <div>
                      <span className="text-neutral-500">Final:</span>{" "}
                      <span className="font-bold text-neutral-900">
                        ${stats.winner.finalChips.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Profit:</span>{" "}
                      <span className="font-bold text-green-600">
                        +${stats.winner.profit.toLocaleString()} (+{Math.round((stats.winner.profit / stats.winner.buyIn) * 100)}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm font-mono mt-2">
                    <div>
                      <span className="text-neutral-500">Hands Won:</span>{" "}
                      <span className="font-bold">{stats.handsWonByPlayer.get(stats.winner.modelId) || 0}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Showdowns Won:</span>{" "}
                      <span className="font-bold">{stats.showdownWinsByPlayer.get(stats.winner.modelId) || 0}</span>
                    </div>
                    {stats.winnerStats && (
                      <div>
                        <span className="text-neutral-500">VPIP:</span>{" "}
                        <span className="font-bold">{calculateVPIP(stats.winnerStats)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Final Standings */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="border border-neutral-900 bg-white mb-6"
          >
            <div className="px-4 py-3 border-b border-neutral-900 bg-neutral-50">
              <h3 className="font-mono font-bold text-sm text-neutral-900">FINAL STANDINGS</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 text-left">
                    <th className="px-4 py-2 font-mono text-xs text-neutral-500 font-normal">#</th>
                    <th className="px-4 py-2 font-mono text-xs text-neutral-500 font-normal">Model</th>
                    <th className="px-4 py-2 font-mono text-xs text-neutral-500 font-normal text-right">Final</th>
                    <th className="px-4 py-2 font-mono text-xs text-neutral-500 font-normal text-right">Profit</th>
                    <th className="px-4 py-2 font-mono text-xs text-neutral-500 font-normal text-right">Hands</th>
                    <th className="px-4 py-2 font-mono text-xs text-neutral-500 font-normal text-right">VPIP</th>
                    <th className="px-4 py-2 font-mono text-xs text-neutral-500 font-normal text-right">Aggr</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sortedResults.map((result, idx) => {
                    const analysis = stats.playerAnalysis.find((p) => p.modelId === result.modelId);
                    const ModelIcon = getModelIcon(result.modelId);
                    const handsWon = stats.handsWonByPlayer.get(result.modelId) || 0;

                    return (
                      <tr
                        key={result.modelId}
                        className={cn(
                          "border-b border-neutral-100 last:border-b-0",
                          idx === 0 && "bg-amber-50"
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-sm font-bold text-neutral-500">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {ModelIcon && <ModelIcon size={20} />}
                            <span className="font-mono text-sm font-bold text-neutral-900">
                              {getModelDisplayName(result.modelId)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-right text-neutral-900 tabular-nums">
                          ${result.finalChips.toLocaleString()}
                        </td>
                        <td className={cn(
                          "px-4 py-3 font-mono text-sm font-bold text-right tabular-nums",
                          result.profit > 0 ? "text-green-600" : result.profit < 0 ? "text-red-600" : "text-neutral-500"
                        )}>
                          {result.profit > 0 ? "+" : ""}{result.profit.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-right text-neutral-700 tabular-nums">
                          {handsWon}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-right text-neutral-700 tabular-nums">
                          {analysis?.vpip || 0}%
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-right text-neutral-700 tabular-nums">
                          {analysis?.aggression.toFixed(1) || "0.0"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Game Stats Row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-4 gap-3 mb-6"
          >
            <div className="border border-neutral-900 bg-white p-4 text-center">
              <div className="font-mono text-xs text-neutral-500 mb-1">HANDS PLAYED</div>
              <div className="font-mono text-2xl font-bold text-neutral-900">{game.currentHand}</div>
            </div>
            <div className="border border-neutral-900 bg-white p-4 text-center">
              <div className="font-mono text-xs text-neutral-500 mb-1">DURATION</div>
              <div className="font-mono text-2xl font-bold text-neutral-900">{formatDuration(duration)}</div>
            </div>
            <div className="border border-neutral-900 bg-white p-4 text-center">
              <div className="font-mono text-xs text-neutral-500 mb-1">AVG POT</div>
              <div className="font-mono text-2xl font-bold text-neutral-900">${stats.avgPot.toLocaleString()}</div>
            </div>
            <div className="border border-neutral-900 bg-white p-4 text-center">
              <div className="font-mono text-xs text-neutral-500 mb-1">BIGGEST POT</div>
              <div className="font-mono text-2xl font-bold text-neutral-900">${stats.biggestPot.toLocaleString()}</div>
            </div>
          </motion.div>

          {/* Play Style Awards */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="border border-neutral-900 bg-white mb-6"
          >
            <div className="px-4 py-3 border-b border-neutral-900 bg-neutral-50">
              <h3 className="font-mono font-bold text-sm text-neutral-900">PLAY STYLE AWARDS</h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Most Aggressive */}
              {stats.mostAggressive && stats.mostAggressive.aggression > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-100 flex items-center justify-center shrink-0">
                    <Flame className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-neutral-500">MOST AGGRESSIVE</div>
                    <div className="font-mono text-sm font-bold text-neutral-900">
                      {getModelDisplayName(stats.mostAggressive.modelId)}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-neutral-600">
                    AF: {stats.mostAggressive.aggression.toFixed(1)}
                  </div>
                </div>
              )}

              {/* Most Conservative */}
              {stats.mostConservative && stats.mostConservative.foldRate > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-neutral-500">MOST CONSERVATIVE</div>
                    <div className="font-mono text-sm font-bold text-neutral-900">
                      {getModelDisplayName(stats.mostConservative.modelId)}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-neutral-600">
                    Fold Rate: {stats.mostConservative.foldRate}%
                  </div>
                </div>
              )}

              {/* Luckiest */}
              {stats.luckiest && stats.luckiest.showdownWins > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-neutral-500">LUCKIEST</div>
                    <div className="font-mono text-sm font-bold text-neutral-900">
                      {getModelDisplayName(stats.luckiest.modelId)}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-neutral-600">
                    {stats.luckiest.showdownWins} showdown wins
                  </div>
                </div>
              )}

              {/* Biggest Bluff */}
              {stats.biggestBluff && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-neutral-500">BIGGEST BLUFF</div>
                    <div className="font-mono text-sm font-bold text-neutral-900">
                      {getModelDisplayName(stats.biggestBluff.winnerModelIds[0])}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-neutral-600">
                    Won ${stats.biggestBluff.pot.toLocaleString()} (Hand #{stats.biggestBluff.handNumber})
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Notable Moments */}
          {stats.notableMoments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="border border-neutral-900 bg-white mb-6"
            >
              <div className="px-4 py-3 border-b border-neutral-900 bg-neutral-50">
                <h3 className="font-mono font-bold text-sm text-neutral-900">NOTABLE MOMENTS</h3>
              </div>
              <div className="p-4 space-y-2">
                {stats.notableMoments.map((moment, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="font-mono text-xs text-neutral-400 shrink-0">
                      Hand #{moment.hand}:
                    </span>
                    <span className="font-mono text-sm text-neutral-700">
                      {moment.description}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

        </div>
      </motion.div>
    </div>
  );
}
