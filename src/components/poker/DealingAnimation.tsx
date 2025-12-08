"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { playDealSound } from "@/lib/sounds";

// Card sprite constants (matching Card.tsx)
const SPRITE_CARD_WIDTH = 97;
const SPRITE_CARD_HEIGHT = 129;
const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;

interface FlyingCard {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dealDelay: number;
}

interface DealingAnimationProps {
  isDealing: boolean;
  onComplete: () => void;
  playerCount: number;
  deckPosition: { x: number; y: number } | null;
  playerPositions: Array<{ x: number; y: number }>;
}

export function DealingAnimation({
  isDealing,
  onComplete,
  deckPosition,
  playerPositions,
}: DealingAnimationProps) {
  const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
  const [mounted, setMounted] = useState(false);
  const animationStartedRef = useRef(false);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setMounted(true);
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  // Reset when not dealing
  useEffect(() => {
    if (!isDealing) {
      animationStartedRef.current = false;
      setFlyingCards([]);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    }
  }, [isDealing]);

  // Start animation when dealing begins
  useEffect(() => {
    if (!isDealing || !deckPosition || animationStartedRef.current) return;
    if (playerPositions.length === 0) return;

    animationStartedRef.current = true;

    // Clear previous timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const cards: FlyingCard[] = [];
    let dealIndex = 0;
    const dealInterval = 0.1; // Time between each card deal
    const flyDuration = 0.25; // How long card takes to fly

    // Deal 2 cards to each player (first card to all, then second card to all)
    for (let round = 0; round < 2; round++) {
      for (let p = 0; p < playerPositions.length; p++) {
        const pos = playerPositions[p];
        if (!pos) continue;

        // Offset for left/right card slot
        const cardWidth = 64;
        const gap = 8;
        const offsetX =
          round === 0 ? -(cardWidth / 2 + gap / 2) : cardWidth / 2 + gap / 2;

        const dealDelay = dealIndex * dealInterval;

        cards.push({
          id: `card-${round}-${p}-${dealIndex}`,
          startX: deckPosition.x,
          startY: deckPosition.y,
          endX: pos.x + offsetX,
          endY: pos.y,
          dealDelay,
        });
        dealIndex++;
      }
    }

    setFlyingCards(cards);

    // Play sounds for each card when it starts flying
    cards.forEach((card) => {
      const timer = setTimeout(() => {
        playDealSound();
      }, card.dealDelay * 1000);
      timersRef.current.push(timer);
    });

    // Complete after last card arrives (no flip delay needed)
    const lastCard = cards[cards.length - 1];
    const totalDuration = lastCard ? lastCard.dealDelay + flyDuration + 0.1 : 1;
    const completeTimer = setTimeout(() => {
      onCompleteRef.current();
      setFlyingCards([]);
    }, totalDuration * 1000);
    timersRef.current.push(completeTimer);
  }, [isDealing, deckPosition, playerPositions]);

  if (!mounted || !isDealing || flyingCards.length === 0) return null;

  const scale = 64 / SPRITE_CARD_WIDTH;
  const spriteWidth = SPRITE_CARD_WIDTH * SPRITE_COLS * scale;
  const spriteHeight = SPRITE_CARD_HEIGHT * SPRITE_ROWS * scale;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {flyingCards.map((card) => (
        <motion.div
          key={card.id}
          className="absolute w-16 h-[86px] border border-neutral-900"
          style={{
            backgroundImage: "url(/assets/cards/playing_cards.png)",
            backgroundSize: `${spriteWidth}px ${spriteHeight}px`,
            backgroundPosition: "0px 0px",
            imageRendering: "pixelated",
          }}
          initial={{
            x: card.startX - 32,
            y: card.startY - 43,
            scale: 0.8,
            opacity: 1,
          }}
          animate={{
            x: card.endX - 32,
            y: card.endY - 43,
            scale: 1,
            opacity: 0,
          }}
          transition={{
            duration: 0.25,
            delay: card.dealDelay,
            ease: [0.2, 0.8, 0.4, 1],
            opacity: { duration: 0.1, delay: card.dealDelay + 0.2 },
          }}
        />
      ))}
    </div>,
    document.body,
  );
}

/**
 * Visual deck stack component
 */
export function DeckStack({ className }: { className?: string }) {
  const scale = 48 / SPRITE_CARD_WIDTH;
  const spriteWidth = SPRITE_CARD_WIDTH * SPRITE_COLS * scale;
  const spriteHeight = SPRITE_CARD_HEIGHT * SPRITE_ROWS * scale;

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ width: 48, height: 64 }}
    >
      {/* Stack layers */}
      {[4, 3, 2, 1, 0].map((i) => (
        <div
          key={`stack-layer-${i}`}
          className="absolute w-12 h-16 bg-neutral-300 border border-neutral-400"
          style={{
            top: i * -1.5,
            left: i * -0.5,
            zIndex: 5 - i,
          }}
        />
      ))}
      {/* Top card (face down) */}
      <div
        className="absolute w-12 h-16 border border-neutral-900"
        style={{
          top: -7.5,
          left: -2.5,
          backgroundImage: "url(/assets/cards/playing_cards.png)",
          backgroundSize: `${spriteWidth}px ${spriteHeight}px`,
          backgroundPosition: "0px 0px",
          imageRendering: "pixelated",
          zIndex: 10,
        }}
      />
    </div>
  );
}
