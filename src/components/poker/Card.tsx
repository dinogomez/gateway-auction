"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Card as CardType } from "@/types/poker";
import { SUIT_SYMBOLS, SUIT_COLORS } from "@/types/poker";

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
  delay?: number; // Animation delay in seconds for staggered effects
}

// Preload sprite sheet
if (typeof window !== "undefined") {
  const img = new Image();
  img.src = "/assets/cards/playing_cards.png";
}

// Sprite sheet: playing_cards.png
// Layout: 15 columns (back, A, 2-10, J, Q, K, Joker) x 4 rows (Spades, Diamonds, Clubs, Hearts)
// Each card is 97x129 pixels in the sprite sheet
const SPRITE_CARD_WIDTH = 97;
const SPRITE_CARD_HEIGHT = 129;
const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;

// Map suit to row index
const SUIT_ROW: Record<string, number> = {
  s: 0, // Spades
  d: 1, // Diamonds
  c: 2, // Clubs
  h: 3, // Hearts
};

// Map rank to column index (column 0 is card back)
const RANK_COL: Record<string, number> = {
  a: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  j: 11,
  q: 12,
  k: 13,
};

const sizeClasses = {
  sm: "w-12 h-16",
  md: "w-16 h-[86px]",
  lg: "w-[97px] h-[129px]",
};

// Size multipliers for scaling the sprite
const sizeScales = {
  sm: { width: 48, height: 64, scale: 48 / SPRITE_CARD_WIDTH },
  md: { width: 64, height: 86, scale: 64 / SPRITE_CARD_WIDTH },
  lg: { width: 97, height: 129, scale: 1 }, // Native sprite size
};

/**
 * Get sprite background position for a card
 */
function getSpritePosition(
  card: CardType,
  scale: number,
): { x: number; y: number } {
  const col = RANK_COL[card.rank] ?? 1;
  const row = SUIT_ROW[card.suit] ?? 0;
  return {
    x: -col * SPRITE_CARD_WIDTH * scale,
    y: -row * SPRITE_CARD_HEIGHT * scale,
  };
}

/**
 * Get sprite background position for card back (column 0, row 0 for gray back)
 */
function getBackPosition(scale: number): { x: number; y: number } {
  return {
    x: 0, // Column 0
    y: 0, // Row 0 (gray back)
  };
}

export function Card({
  card,
  faceDown = false,
  size = "md",
  className,
  animate = false, // Disabled by default for smoother initial render
  delay = 0,
}: CardProps) {
  const { scale } = sizeScales[size];
  const spriteWidth = SPRITE_CARD_WIDTH * SPRITE_COLS * scale;
  const spriteHeight = SPRITE_CARD_HEIGHT * SPRITE_ROWS * scale;

  const baseStyle = {
    backgroundImage: "url(/assets/cards/playing_cards.png)",
    backgroundSize: `${spriteWidth}px ${spriteHeight}px`,
    imageRendering: "pixelated" as const,
    // GPU acceleration for smoother animations
    transform: "translateZ(0)",
    backfaceVisibility: "hidden" as const,
  };

  // Add will-change only for animated cards to hint GPU compositing
  const animatedStyle = animate
    ? { ...baseStyle, willChange: "opacity, transform" as const }
    : baseStyle;

  if (faceDown || !card) {
    const backPos = getBackPosition(scale);

    if (!animate) {
      return (
        <div
          className={cn(
            sizeClasses[size],
            "relative overflow-hidden border border-neutral-900",
            className,
          )}
          style={{
            ...baseStyle,
            backgroundPosition: `${backPos.x}px ${backPos.y}px`,
          }}
          aria-label="Card back"
        />
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay, ease: "easeOut" }}
        className={cn(sizeClasses[size], "relative overflow-hidden border border-neutral-900", className)}
        style={{
          ...animatedStyle,
          backgroundPosition: `${backPos.x}px ${backPos.y}px`,
        }}
        aria-label="Card back"
      />
    );
  }

  const pos = getSpritePosition(card, scale);

  if (!animate) {
    return (
      <div
        className={cn(sizeClasses[size], "relative overflow-hidden border border-neutral-900", className)}
        style={{
          ...baseStyle,
          backgroundPosition: `${pos.x}px ${pos.y}px`,
        }}
        aria-label={`${card.rank} of ${card.suit}`}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay, ease: "easeOut" }}
      className={cn(sizeClasses[size], "relative overflow-hidden border border-neutral-900", className)}
      style={{
        ...animatedStyle,
        backgroundPosition: `${pos.x}px ${pos.y}px`,
      }}
      aria-label={`${card.rank} of ${card.suit}`}
    />
  );
}

/**
 * Mini card for compact displays (text-based)
 */
export function MiniCard({
  card,
  className,
}: {
  card: CardType;
  className?: string;
}) {
  const suitColor = SUIT_COLORS[card.suit];
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const rankDisplay = card.rank === "10" ? "10" : card.rank.toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1 py-0.5",
        "bg-white border border-neutral-900",
        "font-mono text-sm font-bold",
        className,
      )}
      style={{ color: suitColor }}
    >
      {rankDisplay}
      {suitSymbol}
    </span>
  );
}

/**
 * Card placeholder (empty slot)
 */
export function CardPlaceholder({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        sizeClasses[size],
        "border border-dashed border-neutral-900",
        "bg-neutral-200/50",
        className,
      )}
    />
  );
}
