"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

import { CardBackground } from "@/components/CardBackground";
import { ModelSelector } from "@/components/ModelSelector";
import { useSounds, useHydratedMusicStart } from "@/hooks/useSounds";
import { cn } from "@/lib/utils";
import type { Model } from "@/types/poker";
import { DEFAULT_POKER_CONFIG } from "@/types/poker";
import { env } from "@/env";

// Only allow dev game in dev mode
const isDev = env.NEXT_PUBLIC_DEV_MODE;

export default function DevGamePage() {
  const router = useRouter();
  const [selectedModels, setSelectedModels] = useState<Model[]>([]);
  const [playMode, setPlayMode] = useState<"spectate" | "play">("spectate");
  const [isStarting, setIsStarting] = useState(false);
  const { startMenu, stopMenu } = useSounds();

  // Start menu music after hydration (respects mute state)
  useHydratedMusicStart(startMenu, stopMenu);

  const handleStartGame = () => {
    if (selectedModels.length < 2) return;

    setIsStarting(true);
    stopMenu(); // Stop menu music before navigating
    sessionStorage.setItem("selectedModels", JSON.stringify(selectedModels));
    sessionStorage.setItem(
      "pokerHumanMode",
      playMode === "play" ? "true" : "false",
    );
    router.push("/game/poker");
  };

  // Show not available message if not in dev mode
  if (!isDev) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-mono font-bold text-neutral-900">
            DEV GAME
          </h1>
          <p className="text-neutral-600 font-mono">
            This page is only available in dev mode.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-neutral-900 text-white font-mono hover:bg-neutral-800"
          >
            &larr; BACK HOME
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 relative">
      <CardBackground cardCount={25} opacity={0.18} />
      <div className="max-w-3xl mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/"
              className="text-sm font-mono text-neutral-700 hover:text-neutral-900"
            >
              &larr; BACK
            </Link>
          </div>
          <h1 className="text-4xl font-mono font-bold text-neutral-900 mb-2">
            DEV GAME
          </h1>
          <p className="text-neutral-700 font-mono">
            Start a custom game with selected AI models
          </p>
        </header>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div className="p-6 bg-white border border-neutral-900 shadow-sm">
            <h2 className="text-lg font-mono font-bold mb-4 text-neutral-900">
              MODE
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setPlayMode("spectate")}
                className={cn(
                  "p-4 border transition-all text-left",
                  playMode === "spectate"
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 hover:border-neutral-400 text-neutral-900 bg-white",
                )}
              >
                <div className="font-mono font-bold text-lg mb-1">SPECTATE</div>
                <div
                  className={cn(
                    "text-sm font-mono",
                    playMode === "spectate"
                      ? "text-neutral-400"
                      : "text-neutral-700",
                  )}
                >
                  Watch AI models compete
                </div>
              </button>
              <button
                onClick={() => setPlayMode("play")}
                className={cn(
                  "p-4 border transition-all text-left",
                  playMode === "play"
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 hover:border-neutral-400 text-neutral-900 bg-white",
                )}
              >
                <div className="font-mono font-bold text-lg mb-1">PLAY</div>
                <div
                  className={cn(
                    "text-sm font-mono",
                    playMode === "play"
                      ? "text-neutral-400"
                      : "text-neutral-700",
                  )}
                >
                  Join and compete
                </div>
              </button>
            </div>
          </div>

          {/* Model Selection */}
          <div className="p-6 bg-white border border-neutral-900 shadow-sm">
            <h2 className="text-lg font-mono font-bold mb-4 text-neutral-900">
              AI PLAYERS
            </h2>
            <ModelSelector
              onSelect={setSelectedModels}
              disabled={isStarting}
              minModels={2}
              maxModels={playMode === "play" ? 9 : 10}
            />
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartGame}
            disabled={selectedModels.length < 2 || isStarting}
            className={cn(
              "w-full py-4 font-mono font-bold text-lg transition-colors",
              selectedModels.length >= 2 && !isStarting
                ? "bg-neutral-900 text-white hover:bg-neutral-800"
                : "bg-neutral-200 text-neutral-400 cursor-not-allowed",
            )}
          >
            {isStarting ? "STARTING..." : "START GAME"}
          </button>

          {/* Game Info */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-white border border-neutral-900 shadow-sm">
              <div className="text-2xl font-bold text-neutral-900 font-mono">
                ${DEFAULT_POKER_CONFIG.startingChips.toLocaleString()}
              </div>
              <div className="text-xs text-neutral-700 font-mono">CHIPS</div>
            </div>
            <div className="p-4 bg-white border border-neutral-900 shadow-sm">
              <div className="text-2xl font-bold text-neutral-900 font-mono">
                {DEFAULT_POKER_CONFIG.totalHands}
              </div>
              <div className="text-xs text-neutral-700 font-mono">HANDS</div>
            </div>
            <div className="p-4 bg-white border border-neutral-900 shadow-sm">
              <div className="text-2xl font-bold text-neutral-900 font-mono">
                ${DEFAULT_POKER_CONFIG.smallBlind}/$
                {DEFAULT_POKER_CONFIG.bigBlind}
              </div>
              <div className="text-xs text-neutral-700 font-mono">BLINDS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
