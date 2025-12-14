"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";

// Card sprite positions for face cards (col 11-13 are J, Q, K; col 1 is Ace)
// Rows: 0=hearts, 1=diamonds, 2=clubs, 3=spades
const FACE_CARDS = [
  { col: 13, row: 0 }, // King of Hearts
  { col: 12, row: 1 }, // Queen of Diamonds
  { col: 11, row: 2 }, // Jack of Clubs
  { col: 1, row: 3 }, // Ace of Spades
];

const CARD_WIDTH = 97;
const CARD_HEIGHT = 129;
const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;

function FaceCard({
  col,
  row,
  angle,
}: {
  col: number;
  row: number;
  angle: number;
}) {
  const scale = 0.4;
  return (
    <div
      className="shrink-0"
      style={{
        transform: `rotate(${angle}deg)`,
      }}
    >
      <div
        className="border border-neutral-300 rounded-sm shadow-sm"
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

export function AboutModal() {
  const [open, setOpen] = useState(false);

  // Generate random angles for each card (memoized so they don't change on re-render)
  const cardAngles = useMemo(
    () => [
      -8 + Math.random() * 6, // -8 to -2
      5 + Math.random() * 6, // 5 to 11
      -10 + Math.random() * 5, // -10 to -5
      3 + Math.random() * 8, // 3 to 11
    ],
    [],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="About"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] bg-white border-neutral-900">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">CREDITS</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Made by */}
          <div className="flex items-center gap-3 pb-4 border-b border-neutral-200">
            <a href="https://dinogomez.app/" target="_blank" rel="noopener noreferrer">
              <img
                src="https://avatars.githubusercontent.com/u/41871666?v=4"
                alt="Dino Gomez"
                className="w-10 h-10"
              />
            </a>
            <div>
              <div className="text-xs font-mono text-neutral-500">Made by</div>
              <a
                href="https://dinogomez.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono font-bold text-neutral-900 hover:underline"
              >
                Dino Gomez
              </a>
            </div>
          </div>
          {/* Music */}
          <div className="flex gap-4 items-start">
            <FaceCard
              col={FACE_CARDS[0].col}
              row={FACE_CARDS[0].row}
              angle={cardAngles[0]}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-mono font-bold text-neutral-700 mb-2">
                MUSIC
              </h3>
              <div className="space-y-1.5 text-xs font-mono">
                <a
                  href="https://pixabay.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-neutral-900 underline hover:text-neutral-600"
                >
                  Maksym Malko via Pixabay
                </a>
                <a
                  href="https://uppbeat.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-neutral-900 underline hover:text-neutral-600"
                >
                  Kevin MacLeod via Uppbeat
                </a>
              </div>
            </div>
          </div>

          {/* Sound Effects */}
          <div className="flex gap-4 items-start pt-4 border-t border-neutral-200">
            <FaceCard
              col={FACE_CARDS[1].col}
              row={FACE_CARDS[1].row}
              angle={cardAngles[1]}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-mono font-bold text-neutral-700 mb-2">
                SOUND EFFECTS
              </h3>
              <div className="space-y-1.5 text-xs font-mono">
                <a
                  href="https://mixkit.co/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-neutral-900 underline hover:text-neutral-600"
                >
                  Mixkit
                </a>
                <a
                  href="https://signaturesounds.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-neutral-900 underline hover:text-neutral-600"
                >
                  Signature Samples
                </a>
              </div>
            </div>
          </div>

          {/* Art Assets */}
          <div className="flex gap-4 items-start pt-4 border-t border-neutral-200">
            <FaceCard
              col={FACE_CARDS[2].col}
              row={FACE_CARDS[2].row}
              angle={cardAngles[2]}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-mono font-bold text-neutral-700 mb-2">
                ART ASSETS
              </h3>
              <a
                href="https://sdkfz181tiger.itch.io/assets-for-8bit-playing-card-games"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-neutral-900 underline hover:text-neutral-600"
              >
                Kajiru
              </a>
            </div>
          </div>

          {/* AI Models */}
          <div className="flex gap-4 items-start pt-4 border-t border-neutral-200">
            <FaceCard
              col={FACE_CARDS[3].col}
              row={FACE_CARDS[3].row}
              angle={cardAngles[3]}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-mono font-bold text-neutral-700 mb-2">
                AI MODELS
              </h3>
              <a
                href="https://vercel.com/ai-gateway"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-neutral-900 underline hover:text-neutral-600"
              >
                Vercel AI Gateway
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
