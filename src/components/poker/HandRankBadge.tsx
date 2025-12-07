"use client";

import { cn } from "@/lib/utils";
import { HandRank, HAND_RANK_NAMES } from "@/types/poker";

interface HandRankBadgeProps {
  rank: HandRank;
  description?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// Black/white styling based on hand strength
const getRankStyle = (rank: HandRank) => {
  if (rank >= HandRank.FULL_HOUSE) {
    return "bg-white text-black font-bold"; // Premium hands
  }
  if (rank >= HandRank.THREE_OF_A_KIND) {
    return "bg-neutral-300 text-black"; // Strong hands
  }
  if (rank >= HandRank.PAIR) {
    return "bg-neutral-700 text-white"; // Medium hands
  }
  return "bg-neutral-900 text-neutral-400"; // Weak hands
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-2 text-base",
};

export function HandRankBadge({
  rank,
  description,
  size = "md",
  className,
}: HandRankBadgeProps) {
  const rankName = HAND_RANK_NAMES[rank];
  const style = getRankStyle(rank);

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center font-mono",
        "border border-neutral-600",
        style,
        SIZE_CLASSES[size],
        className,
      )}
      style={{ borderRadius: 0 }}
    >
      <span className="font-bold">{rankName}</span>
      {description && (
        <span className="text-[0.8em] opacity-80 font-normal">
          {description}
        </span>
      )}
    </div>
  );
}

/**
 * Inline hand rank display
 */
export function HandRankInline({
  rank,
  className,
}: {
  rank: HandRank;
  className?: string;
}) {
  const rankName = HAND_RANK_NAMES[rank];
  const style = getRankStyle(rank);

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-xs font-mono font-medium border border-neutral-600",
        style,
        className,
      )}
      style={{ borderRadius: 0 }}
    >
      {rankName}
    </span>
  );
}

/**
 * Winner announcement with hand rank
 */
export function WinnerAnnouncement({
  playerName,
  rank,
  description,
  amount,
  className,
}: {
  playerName: string;
  rank: HandRank;
  description: string;
  amount: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 p-4",
        "bg-black border border-white",
        "animate-in zoom-in duration-500",
        className,
      )}
      style={{ borderRadius: 0 }}
    >
      <span className="text-lg font-bold text-white font-mono">
        {playerName} WINS
      </span>
      <HandRankBadge rank={rank} description={description} size="lg" />
      <span className="text-2xl font-bold text-white font-mono">
        +${amount.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * Hand strength meter for decision making hints
 */
export function HandStrengthMeter({
  strength,
  className,
}: {
  strength: number; // 0-100
  className?: string;
}) {
  const getLabel = () => {
    if (strength >= 80) return "MONSTER";
    if (strength >= 60) return "STRONG";
    if (strength >= 40) return "MODERATE";
    if (strength >= 20) return "WEAK";
    return "VERY WEAK";
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex justify-between text-xs font-mono">
        <span className="text-neutral-500">Hand Strength</span>
        <span className="font-medium text-white">{getLabel()}</span>
      </div>
      <div
        className="h-1 bg-neutral-900 overflow-hidden"
        style={{ borderRadius: 0 }}
      >
        <div
          className="h-full bg-white transition-all duration-500"
          style={{ width: `${strength}%`, borderRadius: 0 }}
        />
      </div>
    </div>
  );
}
