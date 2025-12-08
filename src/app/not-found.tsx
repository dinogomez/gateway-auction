"use client";

import Link from "next/link";
import { CardBackground } from "@/components/CardBackground";

const CARD_WIDTH = 97;
const CARD_HEIGHT = 129;
const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-center relative overflow-hidden">
      <CardBackground cardCount={12} opacity={0.2} />

      {/* Content */}
      <div className="relative z-10 text-center">
        <h1
          className="font-mono font-black text-neutral-900 leading-none"
          style={{ fontSize: "clamp(8rem, 30vw, 20rem)" }}
        >
          404
        </h1>
        <p className="text-neutral-600 font-mono text-lg mt-4 mb-8">
          This hand doesn&apos;t exist
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-neutral-900 text-white font-mono font-bold hover:bg-neutral-800 transition-colors"
        >
          Back to Table
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
              backgroundPosition: `${-14 * CARD_WIDTH * 0.5}px 0px`, // Card back
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
              backgroundPosition: `${-14 * CARD_WIDTH * 0.5}px 0px`, // Card back
              imageRendering: "pixelated",
              transform: `rotate(${175 + i * 5}deg)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
