"use client";

import { cn } from "@/lib/utils";
import type {
  Card as CardType,
  PokerPlayerState,
  HandRank,
} from "@/types/poker";
import { HAND_RANK_NAMES } from "@/types/poker";
import { Card } from "./Card";
import { getOddsColorClass } from "@/lib/poker-odds";

interface PlayerSeatProps {
  name: string;
  color: string;
  playerState: PokerPlayerState;
  holeCards?: CardType[];
  isCurrentPlayer?: boolean;
  isDealer?: boolean;
  isHuman?: boolean;
  showCards?: boolean;
  thinking?: string;
  lastAction?: { action: string; amount?: number };
  winPercentage?: number;
  handDescription?: string;
  handRank?: HandRank;
  className?: string;
}

export function PlayerSeat({
  name,
  color,
  playerState,
  holeCards = [],
  isCurrentPlayer = false,
  isDealer = false,
  isHuman = false,
  showCards = false,
  thinking,
  lastAction,
  winPercentage,
  handDescription,
  handRank,
  className,
}: PlayerSeatProps) {
  const isFolded = playerState.status === "folded";
  const isAllIn = playerState.status === "all-in";

  // Get initials from name
  const initials = name
    .split(/[\s-]/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 p-3",
        "bg-black border-2",
        "transition-all duration-300",
        isCurrentPlayer ? "border-white" : "border-neutral-800",
        isFolded && "opacity-50",
        className,
      )}
      style={{ borderRadius: 0, minWidth: "120px" }}
    >
      {/* Player Name & Chips - at top */}
      <div className="flex items-center gap-2 w-full">
        <div
          className="w-5 h-5 flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: color, color: "#000", borderRadius: 0 }}
        >
          {initials}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span
            className="text-xs font-mono font-bold truncate"
            style={{ color }}
          >
            {name}
          </span>
          <span className="text-[10px] text-neutral-400 font-mono">
            ${playerState.chipStack.toLocaleString()}
          </span>
        </div>
        {isDealer && (
          <span className="text-[9px] px-1 py-0.5 bg-white text-black font-bold font-mono">
            D
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="flex gap-1">
        {holeCards.length > 0 ? (
          holeCards.map((card, i) => (
            <Card
              key={i}
              card={showCards || isHuman ? card : undefined}
              faceDown={!showCards && !isHuman}
              size="sm"
              className={cn(isFolded && "grayscale opacity-50")}
            />
          ))
        ) : (
          <div className="w-10 h-14 bg-neutral-900 border border-neutral-800" />
        )}
      </div>

      {/* Win Percentage - shown when spectating */}
      {winPercentage !== undefined && !isFolded && (
        <div
          className={cn(
            "text-sm font-mono font-bold",
            getOddsColorClass(winPercentage),
          )}
        >
          {winPercentage.toFixed(1)}% WIN
        </div>
      )}

      {/* Hand Description */}
      {handDescription && showCards && !isFolded && (
        <div className="text-[10px] text-neutral-300 font-mono text-center bg-neutral-900 px-2 py-0.5">
          {handDescription}
        </div>
      )}

      {/* Status badges */}
      <div className="flex gap-1 flex-wrap justify-center">
        {isAllIn && (
          <span className="text-[10px] px-2 py-0.5 bg-white text-black font-bold font-mono animate-pulse">
            ALL IN
          </span>
        )}
        {isFolded && (
          <span className="text-[10px] px-2 py-0.5 bg-neutral-800 text-neutral-500 font-mono">
            FOLDED
          </span>
        )}
      </div>

      {/* Current Bet */}
      {playerState.currentBet > 0 && !isFolded && (
        <div className="px-2 py-0.5 bg-neutral-900 border border-neutral-700">
          <span className="text-xs text-white font-mono font-bold">
            BET ${playerState.currentBet.toLocaleString()}
          </span>
        </div>
      )}

      {/* Last Action */}
      {lastAction && !isFolded && (
        <div
          className={cn(
            "text-[10px] px-2 py-1 font-mono font-bold w-full text-center",
            "animate-in fade-in slide-in-from-bottom-1 duration-300",
            lastAction.action === "raise" && "bg-white text-black",
            lastAction.action === "call" && "bg-neutral-700 text-white",
            lastAction.action === "check" && "bg-neutral-800 text-neutral-300",
            lastAction.action === "all-in" && "bg-white text-black",
          )}
          style={{ borderRadius: 0 }}
        >
          {lastAction.action.toUpperCase()}
          {lastAction.amount ? ` $${lastAction.amount.toLocaleString()}` : ""}
        </div>
      )}

      {/* Thinking indicator */}
      {isCurrentPlayer && thinking && (
        <div className="w-full text-[9px] text-neutral-400 italic text-center truncate animate-pulse font-mono bg-neutral-900 px-2 py-1">
          {thinking.slice(0, 50)}...
        </div>
      )}
    </div>
  );
}

/**
 * Compact player seat for tight layouts
 */
export function PlayerSeatCompact({
  name,
  color,
  chipStack,
  currentBet,
  status,
  isCurrentPlayer,
  className,
}: {
  name: string;
  color: string;
  chipStack: number;
  currentBet: number;
  status: string;
  isCurrentPlayer?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1",
        "bg-black border border-neutral-800",
        isCurrentPlayer && "border-white",
        status === "folded" && "opacity-50",
        className,
      )}
      style={{ borderRadius: 0 }}
    >
      <div className="w-2 h-2" style={{ backgroundColor: color }} />
      <span className="text-xs font-mono font-medium truncate max-w-[80px]">
        {name}
      </span>
      <span className="text-xs text-neutral-500 ml-auto font-mono">
        ${chipStack.toLocaleString()}
      </span>
      {currentBet > 0 && (
        <span className="text-xs text-white font-mono">
          (${currentBet.toLocaleString()})
        </span>
      )}
    </div>
  );
}
