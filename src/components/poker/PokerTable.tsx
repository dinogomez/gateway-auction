"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type {
  Card as CardType,
  BettingPhase,
  PokerPlayerState,
  EvaluatedHand,
  Model,
} from "@/types/poker";
import { CommunityCards } from "./CommunityCards";
import { PlayerSeat } from "./PlayerSeat";
import { PotDisplay } from "./PotDisplay";
import { calculateOdds, type PlayerOdds } from "@/lib/poker-odds";
import { evaluateHand } from "@/lib/hand-evaluator";

interface PokerTableProps {
  players: Model[];
  playerStates: Record<string, PokerPlayerState>;
  communityCards: CardType[];
  phase: BettingPhase;
  potSize: number;
  currentPlayerId: string | null;
  dealerPosition: number;
  humanPlayerId: string | null;
  showAllCards?: boolean;
  isSpectating?: boolean;
  thinkingText?: Record<string, string>;
  lastActions?: Record<string, { action: string; amount?: number }>;
  className?: string;
}

// Position configurations for different player counts
const POSITIONS: Record<
  number,
  Array<{ top: string; left: string; transform: string }>
> = {
  2: [
    { top: "80%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "20%", left: "50%", transform: "translate(-50%, -50%)" },
  ],
  3: [
    { top: "80%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "30%", left: "15%", transform: "translate(-50%, -50%)" },
    { top: "30%", left: "85%", transform: "translate(-50%, -50%)" },
  ],
  4: [
    { top: "80%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "50%", left: "10%", transform: "translate(-50%, -50%)" },
    { top: "20%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "50%", left: "90%", transform: "translate(-50%, -50%)" },
  ],
  5: [
    { top: "85%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "65%", left: "10%", transform: "translate(-50%, -50%)" },
    { top: "25%", left: "20%", transform: "translate(-50%, -50%)" },
    { top: "25%", left: "80%", transform: "translate(-50%, -50%)" },
    { top: "65%", left: "90%", transform: "translate(-50%, -50%)" },
  ],
  6: [
    { top: "85%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "70%", left: "10%", transform: "translate(-50%, -50%)" },
    { top: "30%", left: "10%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "30%", left: "90%", transform: "translate(-50%, -50%)" },
    { top: "70%", left: "90%", transform: "translate(-50%, -50%)" },
  ],
  7: [
    { top: "85%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "75%", left: "15%", transform: "translate(-50%, -50%)" },
    { top: "45%", left: "5%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "25%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "75%", transform: "translate(-50%, -50%)" },
    { top: "45%", left: "95%", transform: "translate(-50%, -50%)" },
    { top: "75%", left: "85%", transform: "translate(-50%, -50%)" },
  ],
  8: [
    { top: "85%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "80%", left: "20%", transform: "translate(-50%, -50%)" },
    { top: "55%", left: "5%", transform: "translate(-50%, -50%)" },
    { top: "25%", left: "10%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "25%", left: "90%", transform: "translate(-50%, -50%)" },
    { top: "55%", left: "95%", transform: "translate(-50%, -50%)" },
    { top: "80%", left: "80%", transform: "translate(-50%, -50%)" },
  ],
  9: [
    { top: "85%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "82%", left: "25%", transform: "translate(-50%, -50%)" },
    { top: "60%", left: "5%", transform: "translate(-50%, -50%)" },
    { top: "30%", left: "5%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "30%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "70%", transform: "translate(-50%, -50%)" },
    { top: "30%", left: "95%", transform: "translate(-50%, -50%)" },
    { top: "60%", left: "95%", transform: "translate(-50%, -50%)" },
    { top: "82%", left: "75%", transform: "translate(-50%, -50%)" },
  ],
  10: [
    { top: "85%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "85%", left: "25%", transform: "translate(-50%, -50%)" },
    { top: "65%", left: "5%", transform: "translate(-50%, -50%)" },
    { top: "35%", left: "5%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "20%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "50%", transform: "translate(-50%, -50%)" },
    { top: "15%", left: "80%", transform: "translate(-50%, -50%)" },
    { top: "35%", left: "95%", transform: "translate(-50%, -50%)" },
    { top: "65%", left: "95%", transform: "translate(-50%, -50%)" },
    { top: "85%", left: "75%", transform: "translate(-50%, -50%)" },
  ],
};

export function PokerTable({
  players,
  playerStates,
  communityCards,
  phase,
  potSize,
  currentPlayerId,
  dealerPosition,
  humanPlayerId,
  showAllCards = false,
  isSpectating = false,
  thinkingText = {},
  lastActions = {},
  className,
}: PokerTableProps) {
  const playerCount = Math.min(Math.max(players.length, 2), 10);
  const positions = POSITIONS[playerCount] || POSITIONS[6];

  // When spectating, always show all cards
  const shouldShowCards = isSpectating || showAllCards || phase === "showdown";

  // Calculate odds for active players (only when spectating and cards are visible)
  const playerOdds = useMemo(() => {
    if (!isSpectating) return {};

    const activePlayers = players.filter((p) => {
      const state = playerStates[p.id];
      return state && state.status !== "folded" && state.holeCards.length === 2;
    });

    if (activePlayers.length < 2) return {};

    try {
      const odds = calculateOdds(
        activePlayers.map((p) => ({
          playerId: p.id,
          holeCards: playerStates[p.id].holeCards,
        })),
        communityCards,
      );

      return odds.reduce(
        (acc, o) => {
          acc[o.playerId] = o;
          return acc;
        },
        {} as Record<string, PlayerOdds>,
      );
    } catch {
      return {};
    }
  }, [isSpectating, players, playerStates, communityCards]);

  // Calculate hand combinations for active players (when community cards are available)
  const playerHands = useMemo(() => {
    if (!shouldShowCards || communityCards.length < 3) return {};

    const hands: Record<string, EvaluatedHand> = {};
    players.forEach((p) => {
      const state = playerStates[p.id];
      if (state && state.status !== "folded" && state.holeCards.length === 2) {
        try {
          hands[p.id] = evaluateHand(state.holeCards, communityCards);
        } catch {
          // Ignore evaluation errors
        }
      }
    });
    return hands;
  }, [shouldShowCards, players, playerStates, communityCards]);

  return (
    <div
      className={cn(
        "relative w-full aspect-[16/10] max-w-5xl mx-auto",
        className,
      )}
    >
      {/* Table - black/white minimalist style - NO gradient */}
      <div
        className={cn(
          "absolute inset-[15%]",
          "bg-neutral-900 border-2 border-neutral-700",
        )}
        style={{ borderRadius: 0 }}
      >
        {/* Inner border */}
        <div
          className="absolute inset-3 border border-neutral-800"
          style={{ borderRadius: 0 }}
        />

        {/* Center area */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {/* POT - Large and prominent in center */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-neutral-500 font-mono uppercase tracking-wider">
              POT
            </span>
            <div className="px-6 py-3 bg-black border-2 border-white">
              <span className="text-2xl font-bold text-white font-mono">
                ${potSize.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Community cards */}
          <CommunityCards cards={communityCards} phase={phase} animate={true} />
        </div>
      </div>

      {/* Player seats */}
      {players.map((player, index) => {
        const pos = positions[index] || positions[0];
        const state = playerStates[player.id];
        if (!state) return null;

        const odds = playerOdds[player.id];
        const hand = playerHands[player.id];

        return (
          <div
            key={player.id}
            className="absolute z-10"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.transform,
            }}
          >
            <PlayerSeat
              name={player.name}
              color={player.color}
              playerState={state}
              holeCards={state.holeCards}
              isCurrentPlayer={currentPlayerId === player.id}
              isDealer={index === dealerPosition}
              isHuman={player.id === humanPlayerId}
              showCards={shouldShowCards || player.id === humanPlayerId}
              thinking={thinkingText[player.id]}
              lastAction={lastActions[player.id]}
              winPercentage={odds?.winPercentage}
              handDescription={hand?.description}
              handRank={hand?.rank}
            />
          </div>
        );
      })}
    </div>
  );
}
