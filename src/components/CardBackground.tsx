"use client";

import { useEffect, useState } from "react";

const CARD_WIDTH = 97;
const CARD_HEIGHT = 129;
const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;

// Seeded random number generator (mulberry32)
function seededRandom(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CardData {
  col: number;
  row: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  key: number;
}

interface CardBackgroundProps {
  cardCount?: number;
  opacity?: number;
  /**
   * Optional seed for deterministic card positions.
   * WARNING: Only use in client-only contexts to avoid hydration mismatches.
   * If used with SSR, ensure the component is wrapped in a client-only boundary.
   */
  seed?: number | null;
  cardScale?: number;
}

export function CardBackground({
  cardCount = 12,
  opacity = 0.15,
  seed = null,
  cardScale = 1,
}: CardBackgroundProps) {
  const [cards, setCards] = useState<CardData[]>([]);

  // Generate cards only on client to avoid hydration mismatch
  useEffect(() => {
    const random = seed !== null ? seededRandom(seed) : Math.random;

    const generatedCards = Array.from({ length: cardCount }, (_, i) => {
      // Random card from the deck (cols 1-13 are cards, col 14 is joker)
      const isJoker = random() < 0.08; // 8% chance for joker
      const col = isJoker ? 14 : Math.floor(random() * 13) + 1;
      const row = isJoker ? 0 : Math.floor(random() * 4);
      // Random position and rotation
      const x = random() * 100;
      const y = random() * 100;
      const rotation = -30 + random() * 60;
      const scale = 0.6 + random() * 0.4;
      return { col, row, x, y, rotation, scale, key: i };
    });
    setCards(generatedCards);
  }, [cardCount, seed]);

  if (cards.length === 0) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
      style={{ opacity }}
    >
      {cards.map((card) => (
        <div
          key={card.key}
          className="absolute"
          style={{
            left: `${card.x}%`,
            top: `${card.y}%`,
            transform: `translate(-50%, -50%) rotate(${card.rotation}deg) scale(${card.scale * cardScale})`,
          }}
        >
          <div
            className="border border-neutral-400"
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              backgroundImage: "url(/assets/cards/playing_cards.png)",
              backgroundSize: `${CARD_WIDTH * SPRITE_COLS}px ${CARD_HEIGHT * SPRITE_ROWS}px`,
              backgroundPosition: `${-card.col * CARD_WIDTH}px ${-card.row * CARD_HEIGHT}px`,
              imageRendering: "pixelated",
            }}
          />
        </div>
      ))}
    </div>
  );
}
