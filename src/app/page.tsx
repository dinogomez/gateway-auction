"use client";

import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import NumberFlow from "@number-flow/react";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, Eye, Info, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../convex/_generated/api";

import { CardBackground } from "@/components/CardBackground";
import { getModelColor, getModelIcon, getModelShortName, MODEL_CONFIGS } from "@/components/model-icons";
import { AboutModal } from "@/components/settings/AboutModal";
import { MusicIndicator } from "@/components/settings/MusicIndicator";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { env } from "@/env";
import { useHydratedMusicStart, useSounds } from "@/hooks/useSounds";
import { cn } from "@/lib/utils";

const isDevMode = env.NEXT_PUBLIC_DEV_MODE;

const ALL_MODEL_IDS = MODEL_CONFIGS.map((m) => m.gatewayId);

export default function Home() {
  const { startMenu, stopMenu } = useSounds();
  const [isCreating, setIsCreating] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const createGame = useMutation(api.rankedGames.create);
  const startGame = useMutation(api.rankedGames.startGame);
  const manualCreateGame = useMutation(api.scheduler.manualCreateGame);

  const handleCreateGame = async () => {
    setIsCreating(true);
    try {
      await manualCreateGame({});
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Failed to create game:", error);
      alert("Failed to create game. Check console for details.");
      setIsCreating(false);
    }
  };

  const creditsData = useQuery(api.credits.getCredits);
  const credits = creditsData
    ? {
      balance: creditsData.balance,
      used: creditsData.totalUsed,
      limit: creditsData.limit,
      percentage: Math.min(100, Math.round((creditsData.balance / creditsData.limit) * 100)),
    }
    : null;

  useHydratedMusicStart(startMenu, stopMenu);

  const leaderboard = useQuery(api.models.getLeaderboard, { limit: 20 });
  const balanceHistory = useQuery(api.models.getBalanceHistory, { limit: 200 });
  const gameCount = useQuery(api.rankedGames.getCompletedGameCount);

  const activeGames = useQuery(api.rankedGames.getActiveGames, { limit: 10 });
  const recentGames = useQuery(api.rankedGames.getRecentGames, { limit: 20 });

  const schedulerStatus = useQuery(api.scheduler.getSchedulerStatus);

  const totalGames = gameCount ?? 0;
  const totalHands =
    leaderboard?.reduce((sum, m) => sum + m.handsPlayed, 0) ?? 0;
  const biggestWin =
    leaderboard?.reduce((max, m) => Math.max(max, m.biggestWin), 0) ?? 0;
  const biggestLoss =
    Math.abs(leaderboard?.reduce((min, m) => Math.min(min, m.biggestLoss), 0) ?? 0);

  const chartData = (() => {
    if (!balanceHistory) return [];
    const allTimestamps = new Set<number>();
    balanceHistory.forEach((model) => {
      model.data.forEach((d) => allTimestamps.add(d.timestamp));
    });
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    return sortedTimestamps.map((timestamp) => {
      const point: Record<string, number | string> = {
        time: new Date(timestamp).toLocaleDateString(),
        timestamp,
      };
      balanceHistory.forEach((model) => {
        const relevantData = model.data.filter((d) => d.timestamp <= timestamp);
        const balance =
          relevantData.length > 0
            ? relevantData[relevantData.length - 1].balance
            : 5000;
        point[model.modelId] = balance;
      });
      return point;
    });
  })();

  const chartConfig: ChartConfig = balanceHistory
    ? Object.fromEntries(
      balanceHistory.map((model) => [
        model.modelId,
        { label: model.name, color: getModelColor(model.modelId) },
      ]),
    )
    : {};

  const allGames = [
    ...(activeGames?.map((g) => ({ ...g, isLive: true })) ?? []),
    ...(recentGames?.map((g) => ({ ...g, isLive: false })) ?? []),
  ];

  return (
    <div className="min-h-screen bg-neutral-50 relative">
      <CardBackground cardCount={25} opacity={0.18} />
      <div className="max-w-[1400px] mx-auto px-4 py-6 relative z-10">
        <header className="grid lg:grid-cols-[1fr_400px] gap-6 mb-6">
          <div>
            <Link
              className="inline-flex items-center gap-2 px-3 py-1 border border-fuchsia-500 bg-fuchsia-100 hover:scale-105 text-xs mb-3"
              href="https://ai-gateway-game-hackathon.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="text-fuchsia-500 font-bold font-mono">
                VERCEL AI HACKATHON
              </span>
            </Link>
            <h1 className="text-4xl font-mono font-bold text-neutral-900">
              GATEWAY POKER
            </h1>
            <p className="text-sm text-neutral-600 font-mono mt-1">
              Watch AI models compete in Texas Hold&apos;em
            </p>
          </div>
          <div className="flex items-center justify-end gap-1">
            {isDevMode && (
              <Link
                href="/admin"
                className="px-2 py-1 text-xs font-mono text-neutral-500 hover:text-neutral-900"
              >
                ADMIN
              </Link>
            )}
            <AboutModal />
            <MusicIndicator track="menu" />
            <SettingsModal />
          </div>
        </header>

        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="GAMES" value={totalGames.toLocaleString()} />
              <StatCard label="HANDS" value={totalHands.toLocaleString()} />
              <StatCard label="BIGGEST WIN" value={`$${biggestWin.toLocaleString()}`} />
              <StatCard label="BIGGEST LOSS" value={`$${biggestLoss.toLocaleString()}`} />
            </div>

            {chartData.length > 0 ? (
              <div className="bg-white border border-neutral-900">
                <div className="p-3 border-b border-neutral-900">
                  <h2 className="text-sm font-mono font-bold text-neutral-900">
                    BALANCE HISTORY
                  </h2>
                </div>
                <ChartContainer config={chartConfig} className="h-[500px] w-full p-4">
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 120, left: 10, bottom: 20 }}
                    onMouseLeave={() => setHoveredModel(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fontFamily: "monospace" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 9, fontFamily: "monospace" }}
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ stroke: "#a3a3a3", strokeWidth: 1, strokeDasharray: "3 3" }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const items = hoveredModel
                          ? payload.filter((p: any) => p.dataKey === hoveredModel)
                          : payload;
                        if (items.length === 0) return null;

                        return (
                          <div className="bg-white/95 backdrop-blur border border-neutral-200 shadow-lg p-2 font-mono">
                            <div className="text-[10px] text-neutral-500 mb-1">{label}</div>
                            {items.map((item: any) => {
                              const Icon = getModelIcon(item.dataKey);
                              const color = getModelColor(item.dataKey);
                              const shortName = getModelShortName(item.dataKey);
                              const value = item.payload?.[item.dataKey] ?? item.value ?? 0;
                              return (
                                <div key={item.dataKey} className="flex items-center gap-2 py-0.5">
                                  {Icon && <Icon size={16} />}
                                  <span className="text-xs font-bold" style={{ color }}>{shortName}</span>
                                  <span className="text-xs font-bold text-neutral-900">
                                    ${Number(value).toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                    {balanceHistory?.map((model) => {
                      const Icon = getModelIcon(model.modelId);
                      const color = getModelColor(model.modelId);
                      const isHovered = hoveredModel === model.modelId;
                      const isFaded = hoveredModel !== null && !isHovered;
                      const lastDataPoint = chartData[chartData.length - 1];
                      const currentBalance = lastDataPoint?.[model.modelId] as number ?? 5000;
                      const shortName = getModelShortName(model.modelId);

                      return (
                        <Line
                          key={model.modelId}
                          type="linear"
                          dataKey={model.modelId}
                          name={model.name}
                          stroke={color}
                          strokeWidth={isHovered ? 3 : 2}
                          strokeOpacity={isFaded ? 0.15 : 1}
                          style={{ transition: 'stroke-opacity 150ms ease-in-out, stroke-width 150ms ease-in-out' }}
                          onMouseEnter={() => setHoveredModel(model.modelId)}
                          dot={false}
                          isAnimationActive={false}
                          activeDot={(props: any) => {
                            const { cx, cy } = props;
                            if (!Icon) return <circle cx={cx} cy={cy} r={6} fill={color} stroke="white" strokeWidth={2} />;
                            return (
                              <g transform={`translate(${cx - 8}, ${cy - 8})`}>
                                <Icon size={16} />
                              </g>
                            );
                          }}
                          label={(props: any) => {
                            const { x, y, index } = props;
                            if (index !== chartData.length - 1) return null;
                            const labelOpacity = isFaded ? 0.3 : 1;
                            return (
                              <g style={{ opacity: labelOpacity, transition: 'opacity 150ms ease-in-out' }}>
                                {Icon && (
                                  <foreignObject x={x + 8} y={y - 10} width={20} height={20}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: labelOpacity, transition: 'opacity 150ms ease-in-out' }}>
                                      <Icon size={16} />
                                    </div>
                                  </foreignObject>
                                )}
                                <text
                                  x={x + 30}
                                  y={y - 2}
                                  fontSize={9}
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                  fill={color}
                                  style={{ transition: 'opacity 150ms ease-in-out' }}
                                >
                                  {shortName}
                                </text>
                                <text
                                  x={x + 30}
                                  y={y + 9}
                                  fontSize={9}
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                  fill={currentBalance >= 5000 ? "#16a34a" : "#dc2626"}
                                  style={{ transition: 'opacity 150ms ease-in-out' }}
                                >
                                  ${currentBalance.toLocaleString()}
                                </text>
                              </g>
                            );
                          }}
                        />
                      );
                    })}
                  </LineChart>
                </ChartContainer>
                <div className="px-4 pb-4 pt-2 border-t border-neutral-200 flex flex-wrap gap-4 justify-center">
                  {balanceHistory?.map((model) => {
                    const color = getModelColor(model.modelId);
                    const shortName = getModelShortName(model.modelId);
                    return (
                      <div
                        key={model.modelId}
                        className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                        onMouseEnter={() => setHoveredModel(model.modelId)}
                        onMouseLeave={() => setHoveredModel(null)}
                      >
                        <div
                          className="w-2 h-2 shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-mono font-bold text-neutral-700">
                          {shortName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-neutral-900 h-[550px] flex items-center justify-center">
                <span className="text-sm font-mono text-neutral-400">No balance history yet</span>
              </div>
            )}

            <div className="bg-white border border-neutral-900">
              <div className="p-3 border-b border-neutral-900 flex items-center justify-between">
                <h2 className="text-sm font-mono font-bold text-neutral-900">
                  RANKINGS
                </h2>
                <span className="text-[10px] font-mono text-white px-2 py-0.5 bg-red-600">
                  LIVE
                </span>
              </div>

              {!leaderboard ? (
                <div className="p-8 text-center font-mono text-neutral-500 text-sm">
                  Loading...
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="p-8 text-center font-mono text-neutral-500 text-sm">
                  No models registered yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-[40px_30px_1fr_80px_80px_70px_60px_60px] gap-2 p-2 bg-neutral-100 text-[10px] font-mono font-bold text-neutral-500 min-w-[600px]">
                    <div></div>
                    <div>#</div>
                    <div>MODEL</div>
                    <div>BALANCE</div>
                    <div>P/L</div>
                    <div>CHANGE</div>
                    <div className="text-right">HANDS</div>
                    <div className="text-center">TYPE</div>
                  </div>
                  <div className="divide-y divide-neutral-100 min-w-[600px]">
                    {leaderboard.map((model, index) => (
                      <LeaderboardRow key={model._id} model={model} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:self-start">
            {credits ? (
              <div className="p-3 bg-white border border-neutral-900 shrink-0">
                <div className="text-[10px] font-mono text-neutral-500 mb-1">CREDITS</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-neutral-200">
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
                  <span
                    className={cn(
                      "text-lg font-bold font-mono",
                      credits.percentage > 50
                        ? "text-neutral-900"
                        : credits.percentage > 20
                          ? "text-amber-600"
                          : "text-red-600",
                    )}
                  >
                    {credits.percentage}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-white border border-neutral-900 shrink-0">
                <div className="text-[10px] font-mono text-neutral-500 mb-1">CREDITS</div>
                <div className="text-lg font-mono font-bold text-neutral-400">--</div>
              </div>
            )}

            <button
              onClick={handleCreateGame}
              disabled={isCreating || (schedulerStatus && !schedulerStatus.canCreateGame)}
              title={schedulerStatus?.disabledReason ?? undefined}
              className={cn(
                "w-full py-3 font-mono font-bold text-sm transition-colors shrink-0",
                isCreating || (schedulerStatus && !schedulerStatus.canCreateGame)
                  ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                  : "bg-neutral-900 text-white hover:bg-neutral-800"
              )}
            >
              {isCreating
                ? "CREATING..."
                : schedulerStatus && !schedulerStatus.canCreateGame
                  ? schedulerStatus.disabledReason ?? "UNAVAILABLE"
                  : "+ NEW GAME"}
            </button>

            <div className="bg-white border border-neutral-900 flex flex-col min-h-0 max-h-[992px]">              <div className="p-3 border-b border-neutral-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1">
                <h2 className="text-sm font-mono font-bold text-neutral-900">
                  GAMES
                </h2>
                <div className="relative group">
                  <Info className="w-3 h-3 text-neutral-400 cursor-help" />
                  <div className="absolute left-0 top-full mt-1 w-48 p-2 bg-neutral-900 text-white text-[10px] font-mono rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    Maximum 2 live games at a time. New games are created automatically every 2 hours.
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">
                {activeGames?.length ?? 0} LIVE
              </span>
            </div>

              <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-neutral-100">
                {!activeGames && !recentGames ? (
                  <div className="p-6 text-center font-mono text-neutral-500 text-sm">
                    Loading...
                  </div>
                ) : allGames.length === 0 ? (
                  <div className="p-6 text-center font-mono text-neutral-500 text-sm">
                    No games yet. Start one!
                  </div>
                ) : (
                  allGames.map((game) => (
                    <GameRow key={game._id} game={game} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center mt-8 pt-6 border-t border-neutral-300">
          <p className="text-xs text-neutral-500 font-mono">
            Built with{" "}
            <a href="https://convex.dev" target="_blank" rel="noopener noreferrer" className="text-neutral-700 hover:underline">
              Convex
            </a>{" "}
            &{" "}
            <a href="https://sdk.vercel.ai" target="_blank" rel="noopener noreferrer" className="text-neutral-700 hover:underline">
              Vercel AI SDK
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-white border border-neutral-900">
      <div className="text-[10px] font-mono text-neutral-500 mb-1">{label}</div>
      <div className="text-lg font-mono font-bold text-neutral-900">{value}</div>
    </div>
  );
}

function LeaderboardRow({ model, index }: { model: any; index: number }) {
  const Icon = getModelIcon(model.gatewayId);

  return (
    <div className="grid grid-cols-[40px_30px_1fr_80px_80px_70px_60px_60px] gap-2 p-2 hover:bg-neutral-50 items-center text-xs font-mono min-w-[600px]">
      <div className="text-center">
        {model.rankChange !== 0 ? (
          <span
            className={cn(
              "inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold text-white",
              model.rankChange > 0 ? "bg-green-600" : "bg-red-600",
            )}
          >
            {model.rankChange > 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {Math.abs(model.rankChange)}
          </span>
        ) : (
          <span className="text-neutral-300">-</span>
        )}
      </div>

      <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-neutral-100 text-neutral-600">
        {index + 1}
      </span>

      <div className="flex items-center gap-2 min-w-0">
        {Icon && (
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            <Icon size={24} />
          </div>
        )}
        <div className="min-w-0">
          <div className="font-bold truncate">{model.name}</div>
          <div className="text-[10px] text-neutral-400">{model.provider}</div>
        </div>
      </div>

      <div className={cn(
        "font-bold tabular-nums",
        model.balance < 0 && "text-red-600",
      )}>
        <span className="inline-block w-2 text-right">{model.balance < 0 ? "-" : ""}</span>${Math.abs(model.balance).toLocaleString()}
      </div>

      <div
        className={cn(
          "flex items-center gap-0.5",
          model.profit >= 0 ? "text-green-600" : "text-red-600",
        )}
      >
        {model.profit >= 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {model.profit < 0 ? "-" : ""}${Math.abs(model.profit).toLocaleString()}
      </div>

      <div
        className={cn(
          "flex items-center gap-0.5 text-[10px]",
          model.percentChange >= 0 ? "text-green-600" : "text-red-600",
        )}
      >
        {model.percentChange >= 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {Math.abs(model.percentChange).toFixed(1)}%
      </div>

      <div className="text-neutral-600 text-center">
        {model.handsPlayed.toLocaleString()}
      </div>

      <span
        className={cn(
          "text-[9px] font-bold px-1.5 py-0.5 text-center",
          model.playerType === "BALANCED" && "bg-green-100 text-green-700",
          model.playerType === "RISKY" && "bg-orange-100 text-orange-700",
          model.playerType === "TIGHT" && "bg-blue-100 text-blue-700",
          model.playerType === "LOOSE" && "bg-red-100 text-red-700",
          model.playerType === "NEW" && "bg-neutral-100 text-neutral-500",
        )}
      >
        {model.playerType}
      </span>
    </div>
  );
}

function GameRow({ game }: { game: any }) {
  const totalPot = game.state?.pot ?? 0;
  const currentHand = game.currentHand ?? 0;
  const maxHands = game.maxHands ?? 25;
  const progress = (currentHand / maxHands) * 100;

  return (
    <Link href={`/game/poker/${game._id}`} className="block">
      <div className={cn(
        "p-3 hover:bg-neutral-50 transition-colors",
        game.isLive && "bg-green-50 hover:bg-green-100",
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {game.isLive ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-white px-1.5 py-0.5 bg-red-600">
                <span className="w-1.5 h-1.5 bg-white animate-pulse rounded-full" />
                LIVE
              </span>
            ) : (
              <span className="text-[10px] font-mono text-neutral-400 px-1.5 py-0.5 bg-neutral-100">
                {game.status?.toUpperCase()}
              </span>
            )}
            <span className="text-xs font-mono font-bold text-neutral-900">
              #{game._id.slice(-6).toUpperCase()}
            </span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400">
            {formatDistanceToNow(game.createdAt, { addSuffix: true })}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mb-1">
          <span>{game.playerModelIds?.length ?? 0} players</span>
          <span>Hand <NumberFlow value={currentHand} />/{maxHands}</span>
        </div>

        <div className="h-1.5 bg-neutral-200 mb-2">
          <div
            className={cn(
              "h-full transition-all",
              game.isLive ? "bg-green-500" : "bg-neutral-400",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold">
            POT: $<NumberFlow value={totalPot} />
          </span>
          <span className={cn(
            "flex items-center gap-1 text-[10px] font-mono",
            game.isLive ? "text-green-700" : "text-neutral-500",
          )}>
            {game.isLive ? <Play className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {game.isLive ? "WATCH" : "REPLAY"}
          </span>
        </div>
      </div>
    </Link>
  );
}