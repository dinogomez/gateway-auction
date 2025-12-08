"use client";

import { use } from "react";

const CARD_WIDTH = 97;
const CARD_HEIGHT = 129;
const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;

// Suit to row mapping (in sprite sheet)
// Order: Spades=0, Diamonds=1, Clubs=2, Hearts=3
const SUIT_MAP: Record<string, number> = {
  spades: 0,
  diamonds: 1,
  clubs: 2,
  hearts: 3,
};

// Rank to column mapping (in sprite sheet)
// Columns: 1=Ace, 2-10=number cards, 11=Jack, 12=Queen, 13=King
const RANK_MAP: Record<string, number> = {
  ace: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  jack: 11,
  queen: 12,
  king: 13,
};

interface CardPageProps {
  params: Promise<{
    suit: string;
    rank: string;
  }>;
}

export default function CardPage({ params }: CardPageProps) {
  const { suit, rank } = use(params);

  const row = SUIT_MAP[suit.toLowerCase()];
  const col = RANK_MAP[rank.toLowerCase()];

  // Invalid suit or rank
  if (row === undefined || col === undefined) {
    const jokerScale = 2;
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-center">
        {/* Joker Card */}
        <div
          className="border-2 border-neutral-900 mb-6"
          style={{
            width: CARD_WIDTH * jokerScale,
            height: CARD_HEIGHT * jokerScale,
            backgroundImage: "url(/assets/cards/playing_cards.png)",
            backgroundSize: `${CARD_WIDTH * SPRITE_COLS * jokerScale}px ${CARD_HEIGHT * SPRITE_ROWS * jokerScale}px`,
            backgroundPosition: `${-14 * CARD_WIDTH * jokerScale}px 0px`,
            imageRendering: "pixelated",
          }}
        />
        <h1 className="text-2xl font-mono font-bold text-neutral-900 mb-2">
          Card Not Found
        </h1>
        <p className="text-neutral-600 font-mono text-sm mb-4">
          Invalid suit or rank
        </p>
        <p className="text-neutral-500 font-mono text-xs">
          Suits: hearts, diamonds, clubs, spades
        </p>
        <p className="text-neutral-500 font-mono text-xs">
          Ranks: ace, two-ten, jack, queen, king
        </p>
      </div>
    );
  }

  const scale = 3; // Big card

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
      <div
        className="border-2 border-neutral-900"
        style={{
          width: CARD_WIDTH * scale,
          height: CARD_HEIGHT * scale,
          backgroundImage: "url(/assets/cards/playing_cards.png)",
          backgroundSize: `${CARD_WIDTH * SPRITE_COLS * scale}px ${CARD_HEIGHT * SPRITE_ROWS * scale}px`,
          backgroundPosition: `${-col * CARD_WIDTH * scale}px ${-row * CARD_HEIGHT * scale}px`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
