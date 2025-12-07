"use client";

import { cn } from "@/lib/utils";
import type { Card as CardType, BettingPhase } from "@/types/poker";
import { Card, CardPlaceholder } from "./Card";

interface CommunityCardsProps {
  cards: CardType[];
  phase: BettingPhase;
  className?: string;
  animate?: boolean;
}

export function CommunityCards({
  cards,
  phase,
  className,
  animate = true,
}: CommunityCardsProps) {
  // Determine which cards to show based on phase
  const visibleCount =
    phase === "preflop"
      ? 0
      : phase === "flop"
        ? 3
        : phase === "turn"
          ? 4
          : phase === "river" || phase === "showdown"
            ? 5
            : 0;

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {Array.from({ length: 5 }).map((_, i) => {
        if (i < visibleCount && cards[i]) {
          return (
            <Card
              key={i}
              card={cards[i]}
              size="lg"
              animate={animate}
              className={cn(
                // Stagger animation
                animate && i === 3 && "animation-delay-100",
                animate && i === 4 && "animation-delay-200",
              )}
            />
          );
        }
        return <CardPlaceholder key={i} size="lg" />;
      })}
    </div>
  );
}

/**
 * Compact version for smaller displays
 */
export function CommunityCardsCompact({
  cards,
  phase,
  className,
}: {
  cards: CardType[];
  phase: BettingPhase;
  className?: string;
}) {
  const visibleCount =
    phase === "preflop" ? 0 : phase === "flop" ? 3 : phase === "turn" ? 4 : 5;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: 5 }).map((_, i) => {
        if (i < visibleCount && cards[i]) {
          return <Card key={i} card={cards[i]} size="sm" />;
        }
        return <CardPlaceholder key={i} size="sm" />;
      })}
    </div>
  );
}
