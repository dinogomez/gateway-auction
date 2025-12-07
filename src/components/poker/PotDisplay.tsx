"use client";

import { cn } from "@/lib/utils";
import type { Pot } from "@/types/poker";

interface PotDisplayProps {
  amount: number;
  className?: string;
}

export function PotDisplay({ amount, className }: PotDisplayProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2",
        "bg-black border border-neutral-700",
        className,
      )}
      style={{ borderRadius: 0 }}
    >
      {/* Chip icon - minimalist */}
      <div className="w-4 h-4 bg-white" style={{ borderRadius: 0 }} />

      <span className="text-lg font-bold text-white font-mono">
        ${amount.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * Multi-pot display for side pots
 */
interface MultiPotDisplayProps {
  pots: Pot[];
  className?: string;
}

export function MultiPotDisplay({ pots, className }: MultiPotDisplayProps) {
  if (pots.length === 0) {
    return <PotDisplay amount={0} className={className} />;
  }

  if (pots.length === 1) {
    return <PotDisplay amount={pots[0].amount} className={className} />;
  }

  const total = pots.reduce((sum, pot) => sum + pot.amount, 0);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {/* Total pot */}
      <PotDisplay amount={total} />

      {/* Individual pots */}
      <div className="flex gap-2 flex-wrap justify-center">
        {pots.map((pot, index) => (
          <div
            key={index}
            className="flex items-center gap-1 px-2 py-0.5 bg-black border border-neutral-800 text-xs"
            style={{ borderRadius: 0 }}
          >
            <span className="text-neutral-500 font-mono">
              {pot.isMainPot ? "Main" : `Side ${index}`}:
            </span>
            <span className="text-white font-mono font-medium">
              ${pot.amount.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Animated pot that shows chips flying in
 */
export function AnimatedPotDisplay({
  amount,
  previousAmount = 0,
  className,
}: {
  amount: number;
  previousAmount?: number;
  className?: string;
}) {
  const increased = amount > previousAmount;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2",
        "bg-black border border-neutral-700",
        increased && "border-white",
        className,
      )}
      style={{ borderRadius: 0 }}
    >
      {/* Chip stack */}
      <div className="w-4 h-4 bg-white" style={{ borderRadius: 0 }} />

      <span
        className={cn(
          "text-lg font-bold text-white font-mono",
          increased && "animate-in zoom-in duration-300",
        )}
      >
        ${amount.toLocaleString()}
      </span>
    </div>
  );
}
