"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ModelSelector } from "@/components/ModelSelector";
import { cn } from "@/lib/utils";
import type { Model } from "@/types/poker";
import { DEFAULT_POKER_CONFIG } from "@/types/poker";

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
    sessionStorage.setItem("selectedModels", JSON.stringify(selectedModels));
    sessionStorage.setItem(
      "pokerHumanMode",
      playMode === "play" ? "true" : "false",
    );
    router.push("/game/poker");
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1 border border-neutral-700">
            <span className="text-neutral-400 text-sm font-mono">
              VERCEL AI HACKATHON
            </span>
          </div>
          <h1 className="text-5xl font-mono">
            <span className="text-white">GATEWAY POKER</span>{" "}
          </h1>
          <p className="text-lg text-neutral-500 max-w-xl mx-auto font-mono">
            Watch AI models compete in Texas Hold&apos;em. Real-time strategic
            decision making.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: Game Setup */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mode Selection */}
            <div className="p-6 bg-black border border-neutral-800">
              <h2 className="text-lg font-mono font-bold mb-4 text-white">
                MODE
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPlayMode("spectate")}
                  className={cn(
                    "p-4 border transition-all text-left",
                    playMode === "spectate"
                      ? "border-white bg-white text-black"
                      : "border-neutral-700 hover:border-neutral-500 text-white",
                  )}
                >
                  <div className="font-mono font-bold text-lg mb-1">
                    SPECTATE
                  </div>
                  <div
                    className={cn(
                      "text-sm font-mono",
                      playMode === "spectate"
                        ? "text-neutral-700"
                        : "text-neutral-500",
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
                      ? "border-white bg-white text-black"
                      : "border-neutral-700 hover:border-neutral-500 text-white",
                  )}
                >
                  <div className="font-mono font-bold text-lg mb-1">PLAY</div>
                  <div
                    className={cn(
                      "text-sm font-mono",
                      playMode === "play"
                        ? "text-neutral-700"
                        : "text-neutral-500",
                    )}
                  >
                    Join and compete
                  </div>
                </button>
              </div>
            </div>

            {/* Model Selection */}
            <div className="p-6 bg-black border border-neutral-800">
              <h2 className="text-lg font-mono font-bold mb-4 text-white">
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
                  ? "bg-white text-black hover:bg-neutral-200"
                  : "bg-neutral-900 text-neutral-600 cursor-not-allowed",
              )}
            >
              {isStarting ? "STARTING..." : "START GAME"}
            </button>

            {/* Game Info */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-neutral-900 border border-neutral-800">
                <div className="text-2xl font-bold text-white font-mono">
                  ${DEFAULT_POKER_CONFIG.startingChips.toLocaleString()}
                </div>
                <div className="text-xs text-neutral-500 font-mono">CHIPS</div>
              </div>
              <div className="p-4 bg-neutral-900 border border-neutral-800">
                <div className="text-2xl font-bold text-white font-mono">
                  {DEFAULT_POKER_CONFIG.totalHands}
                </div>
                <div className="text-xs text-neutral-500 font-mono">HANDS</div>
              </div>
              <div className="p-4 bg-neutral-900 border border-neutral-800">
                <div className="text-2xl font-bold text-white font-mono">
                  ${DEFAULT_POKER_CONFIG.smallBlind}/$
                  {DEFAULT_POKER_CONFIG.bigBlind}
                </div>
                <div className="text-xs text-neutral-500 font-mono">BLINDS</div>
              </div>
            </div>
          </div>

          {/* Right: Leaderboard */}
          <div className="space-y-6">
            <div className="p-6 bg-black border border-neutral-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-mono font-bold text-white">
                  LEADERBOARD
                </h2>
                <span className="text-xs font-mono text-neutral-500 px-2 py-1 border border-neutral-700">
                  LIVE
                </span>
              </div>

              {!leaderboard ? (
                <div className="text-center py-8 text-neutral-500 font-mono">
                  Loading...
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 font-mono">
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
                          ? "border-white bg-white text-black"
                          : "border-neutral-800",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "w-6 h-6 flex items-center justify-center font-mono font-bold text-sm",
                            index === 0
                              ? "bg-black text-white"
                              : "bg-neutral-800 text-neutral-400",
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
                                ? "text-neutral-700"
                                : "text-neutral-500",
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
                              ? "text-black"
                              : "text-neutral-700"
                            : player.totalProfit >= 0
                              ? "text-white"
                              : "text-neutral-500",
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
              <div className="p-6 bg-black border border-neutral-800">
                <h3 className="text-sm font-mono font-bold text-neutral-500 mb-4">
                  ALL-TIME STATS
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold font-mono text-white">
                      {stats.totalGames}
                    </div>
                    <div className="text-xs text-neutral-500 font-mono">
                      GAMES
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-white">
                      {stats.totalHands}
                    </div>
                    <div className="text-xs text-neutral-500 font-mono">
                      HANDS
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-white">
                      {stats.totalPlayers}
                    </div>
                    <div className="text-xs text-neutral-500 font-mono">
                      MODELS
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-white">
                      {stats.topByProfit?.[0]?.modelName?.slice(0, 8) || "-"}
                    </div>
                    <div className="text-xs text-neutral-500 font-mono">
                      TOP
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* How It Works */}
            <div className="p-6 bg-black border border-neutral-800">
              <h3 className="text-sm font-mono font-bold text-neutral-500 mb-4">
                HOW IT WORKS
              </h3>
              <div className="space-y-3 text-sm font-mono">
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-white text-black flex items-center justify-center font-bold">
                    1
                  </span>
                  <span className="text-neutral-400">
                    Each AI receives 2 hole cards
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-white text-black flex items-center justify-center font-bold">
                    2
                  </span>
                  <span className="text-neutral-400">
                    Watch them bet, raise, or fold
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-white text-black flex items-center justify-center font-bold">
                    3
                  </span>
                  <span className="text-neutral-400">
                    Best hand wins at showdown
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 pt-8 border-t border-neutral-800">
          <p className="text-sm text-neutral-500 font-mono">
            Built with{" "}
            <a
              href="https://sdk.vercel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:underline"
            >
              Vercel AI SDK
            </a>{" "}
            &{" "}
            <a
              href="https://gateway.vercel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:underline"
            >
              AI Gateway
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
