"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

import { CardBackground } from "@/components/CardBackground";
import { ModelSelector } from "@/components/ModelSelector";
import { AboutModal } from "@/components/settings/AboutModal";
import { MusicIndicator } from "@/components/settings/MusicIndicator";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useSounds, useHydratedMusicStart } from "@/hooks/useSounds";
import { cn } from "@/lib/utils";
import type { Model } from "@/types/poker";
import { DEFAULT_POKER_CONFIG } from "@/types/poker";
import { getCredits } from "@/app/actions/credits";

type CreditsData = Awaited<ReturnType<typeof getCredits>>;

// Placeholder leaderboard data until Convex is connected
const mockLeaderboard: Array<{
  modelId: string;
  modelName: string;
  totalProfit: number;
  handsPlayed: number;
  gamesPlayed: number;
}> = [];

const mockStats = {
  totalGames: 0,
  totalHands: 0,
  totalPlayers: 0,
  topByProfit: [] as Array<{ modelName: string }>,
};

export default function Home() {
  const router = useRouter();
  const [selectedModels, setSelectedModels] = useState<Model[]>([]);
  const [playMode, setPlayMode] = useState<"spectate" | "play">("spectate");
  const [isStarting, setIsStarting] = useState(false);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const { startMenu, stopMenu } = useSounds();

  // Fetch credits on mount (cached server action, revalidates every 4 hours)
  useEffect(() => {
    getCredits().then(setCredits);
  }, []);

  // Start menu music after hydration (respects mute state)
  useHydratedMusicStart(startMenu, stopMenu);

  // TODO: Uncomment when Convex functions are deployed
  // import { useQuery } from "convex/react";
  // import { api } from "@/../convex/_generated/api";
  // const leaderboard = useQuery(api.players.getLeaderboard, { limit: 10 });
  // const stats = useQuery(api.players.getAllTimeStats, {});

  // Using mock data for now
  const leaderboard = mockLeaderboard;
  const stats = mockStats;

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

  return (
    <div className="min-h-screen bg-neutral-50 relative">
      <CardBackground cardCount={25} opacity={0.18} />
      <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <header className="text-center space-y-4 mb-12 relative">
          <div className="absolute top-0 right-0 flex items-center gap-1">
            <AboutModal />
            <MusicIndicator track="menu" />
            <SettingsModal />
          </div>
          <Link
            className="inline-flex items-center gap-2 px-4 py-1 border border-fuchsia-500 bg-fuchsia-100 hover:scale-105"
            href="https://ai-gateway-game-hackathon.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="text-fuchsia-500 text-sm font-bold font-mono">
              VERCEL AI HACKATHON
            </span>
          </Link>
          <h1 className="text-5xl font-mono">
            <span className="text-neutral-900">GATEWAY POKER</span>{" "}
          </h1>
          <p className="text-lg text-neutral-700 max-w-xl mx-auto font-mono">
            Watch AI models compete in Texas Hold&apos;em. Real-time strategic
            decision making.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: Game Setup */}
          <div className="lg:col-span-2 space-y-6">
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
                  <div className="font-mono font-bold text-lg mb-1">
                    SPECTATE
                  </div>
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

          {/* Right: Leaderboard */}
          <div className="space-y-6">
            {/* Credits Card */}
            {credits && (
              <div className="p-6 bg-white border border-neutral-900 shadow-sm">
                <h3 className="text-sm font-mono font-bold text-neutral-700 mb-4">
                  REMAINING CREDITS
                </h3>
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "text-4xl font-bold font-mono",
                      credits.percentage > 50
                        ? "text-neutral-900"
                        : credits.percentage > 20
                          ? "text-amber-600"
                          : "text-red-600",
                    )}
                  >
                    {credits.percentage}%
                  </div>
                  <div className="flex-1">
                    <div className="h-3 bg-neutral-200 overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          credits.percentage > 50
                            ? "bg-neutral-900"
                            : credits.percentage > 20
                              ? "bg-amber-600"
                              : "bg-red-600",
                        )}
                        style={{ width: `${credits.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-6 bg-white border border-neutral-900 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-mono font-bold text-neutral-900">
                  LEADERBOARD
                </h2>
                <span className="text-xs font-mono text-white px-2 py-1 border border-neutral-900 bg-neutral-900">
                  LIVE
                </span>
              </div>

              {!leaderboard ? (
                <div className="text-center py-8 text-neutral-700 font-mono">
                  Loading...
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-8 text-neutral-700 font-mono">
                  No games yet
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((player, index) => (
                    <div
                      key={player.modelId}
                      className={cn(
                        "flex items-center justify-between p-3 border",
                        index === 0
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-900 bg-white",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "w-6 h-6 flex items-center justify-center font-mono font-bold text-sm",
                            index === 0
                              ? "bg-white text-neutral-900"
                              : "bg-neutral-100 text-neutral-600",
                          )}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-mono font-medium text-sm">
                            {player.modelName}
                          </div>
                          <div
                            className={cn(
                              "text-xs font-mono",
                              index === 0
                                ? "text-neutral-400"
                                : "text-neutral-700",
                            )}
                          >
                            {player.handsPlayed} hands
                          </div>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "font-mono font-bold",
                          index === 0
                            ? player.totalProfit >= 0
                              ? "text-white"
                              : "text-neutral-400"
                            : player.totalProfit >= 0
                              ? "text-neutral-900"
                              : "text-neutral-700",
                        )}
                      >
                        {player.totalProfit >= 0 ? "+" : ""}$
                        {player.totalProfit.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            {stats && (
              <div className="p-6 bg-white border border-neutral-900 shadow-sm">
                <h3 className="text-sm font-mono font-bold text-neutral-700 mb-4">
                  ALL-TIME STATS
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold font-mono text-neutral-900">
                      {stats.totalGames}
                    </div>
                    <div className="text-xs text-neutral-700 font-mono">
                      GAMES
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-neutral-900">
                      {stats.totalHands}
                    </div>
                    <div className="text-xs text-neutral-700 font-mono">
                      HANDS
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-neutral-900">
                      {stats.totalPlayers}
                    </div>
                    <div className="text-xs text-neutral-700 font-mono">
                      MODELS
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-neutral-900">
                      {stats.topByProfit?.[0]?.modelName?.slice(0, 8) || "-"}
                    </div>
                    <div className="text-xs text-neutral-700 font-mono">
                      TOP
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* How It Works */}
            <div className="p-6 bg-white border border-neutral-900 shadow-sm">
              <h3 className="text-sm font-mono font-bold text-neutral-700 mb-4">
                HOW IT WORKS
              </h3>
              <div className="space-y-3 text-sm font-mono">
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-neutral-900 text-white flex items-center justify-center font-bold">
                    1
                  </span>
                  <span className="text-neutral-600">
                    Each AI receives 2 hole cards
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-neutral-900 text-white flex items-center justify-center font-bold">
                    2
                  </span>
                  <span className="text-neutral-600">
                    Watch them bet, raise, or fold
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-neutral-900 text-white flex items-center justify-center font-bold">
                    3
                  </span>
                  <span className="text-neutral-600">
                    Best hand wins at showdown
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 pt-8 border-t border-neutral-900">
          <p className="text-sm text-neutral-700 font-mono">
            Built with{" "}
            <a
              href="https://sdk.vercel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-900 hover:underline"
            >
              Vercel AI SDK
            </a>{" "}
            &{" "}
            <a
              href="https://gateway.vercel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-900 hover:underline"
            >
              AI Gateway
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
