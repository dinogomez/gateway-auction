"use client";

import { useEffect, useState } from "react";
import { CardBackground } from "@/components/CardBackground";
import { CRTProvider } from "@/components/crt/CRTProvider";

const CARD_WIDTH = 97;
const CARD_HEIGHT = 129;
const SPRITE_COLS = 15;
const SPRITE_ROWS = 4;
const JOKER_COL = 14; // Joker is at column 14 (0-indexed)

interface MobileBlockerProps {
  children: React.ReactNode;
}

export function MobileBlocker({ children }: MobileBlockerProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Show a minimal loading state until we know if it's mobile
  // This prevents flash of no content while still hiding mobile-only UI
  if (isMobile === null) {
    return (
      <div
        className="min-h-screen bg-neutral-100"
        aria-busy="true"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (isMobile) {
    return (
      <CRTProvider>
        <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-center px-6 text-center relative">
          <CardBackground cardCount={10} opacity={0.15} />

          {/* Joker Card */}
          <div
            className="border-2 border-neutral-900 mb-8 relative z-10"
            style={{
              width: CARD_WIDTH * 1.5,
              height: CARD_HEIGHT * 1.5,
              backgroundImage: "url(/assets/cards/playing_cards.png)",
              backgroundSize: `${CARD_WIDTH * SPRITE_COLS * 1.5}px ${CARD_HEIGHT * SPRITE_ROWS * 1.5}px`,
              backgroundPosition: `${-JOKER_COL * CARD_WIDTH * 1.5}px 0px`,
              imageRendering: "pixelated",
            }}
          />

          {/* Text */}
          <h1 className="text-2xl font-mono font-bold text-neutral-900 mb-2 relative z-10">
            Mobile Support Coming Soon
          </h1>
          <p className="text-neutral-600 font-mono text-sm relative z-10">
            Please visit on a desktop device for the best experience
          </p>
        </div>
      </CRTProvider>
    );
  }

  return <>{children}</>;
}
