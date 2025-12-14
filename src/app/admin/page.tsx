"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn, abbreviateModel } from "@/lib/utils";
import Link from "next/link";
import { useState, useEffect } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { env } from "@/env";

// Only allow admin in dev mode
const isDev = env.NEXT_PUBLIC_DEV_MODE;

export default function AdminPage() {
  const models = useQuery(api.models.getLeaderboard, { limit: 50 });
  const games = useQuery(api.rankedGames.getAllGames, { limit: 100 });
  const credits = useQuery(api.credits.getCredits);
  const devStats = useQuery(api.devStats.getDevStats);
  const devStatsSummary = useQuery(api.devStats.getDevStatsSummary);
  const [seedResult, setSeedResult] = useState<
    { name: string; created: boolean }[] | null
  >(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingGames, setIsDeletingGames] = useState(false);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteGamesConfirm, setShowDeleteGamesConfirm] = useState(false);
  const [hasAutoSeeded, setHasAutoSeeded] = useState(false);
  const [isSyncingCredits, setIsSyncingCredits] = useState(false);
  const [isResettingDevStats, setIsResettingDevStats] = useState(false);
  const [showResetDevStatsConfirm, setShowResetDevStatsConfirm] =
    useState(false);

  const seedModels = useMutation(api.seed.seedModels);
  const resetBalances = useMutation(api.seed.resetAllBalances);
  const deleteAllModels = useMutation(api.seed.deleteAllModels);
  const deleteGame = useMutation(api.seed.deleteGame);
  const deleteAllGames = useMutation(api.seed.deleteAllGames);
  const syncCredits = useAction(api.credits.syncCredits);
  const resetDevStats = useMutation(api.devStats.resetDevStats);

  const handleSyncCredits = async () => {
    setIsSyncingCredits(true);
    try {
      await syncCredits();
    } catch (error) {
      console.error("Sync credits error:", error);
    } finally {
      setIsSyncingCredits(false);
    }
  };

  const handleResetDevStats = async () => {
    setIsResettingDevStats(true);
    try {
      await resetDevStats();
      setShowResetDevStatsConfirm(false);
    } catch (error) {
      console.error("Reset dev stats error:", error);
    } finally {
      setIsResettingDevStats(false);
    }
  };

  // Auto-seed on first load if no models exist (only in dev)
  useEffect(() => {
    if (
      isDev &&
      models !== undefined &&
      models.length === 0 &&
      !hasAutoSeeded
    ) {
      setHasAutoSeeded(true);
      handleSeed();
    }
  }, [models, hasAutoSeeded]);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const result = await seedModels();
      setSeedResult(result);
    } catch (error) {
      console.error("Seed error:", error);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetBalances();
      setShowResetConfirm(false);
    } catch (error) {
      console.error("Reset error:", error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAllModels();
      setShowDeleteConfirm(false);
      setHasAutoSeeded(false); // Allow auto-seed again
    } catch (error) {
      console.error("Delete error:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteGame = async (gameId: Id<"games">) => {
    setDeletingGameId(gameId);
    try {
      await deleteGame({ gameId });
    } catch (error) {
      console.error("Delete game error:", error);
    } finally {
      setDeletingGameId(null);
    }
  };

  const handleDeleteAllGames = async () => {
    setIsDeletingGames(true);
    try {
      await deleteAllGames();
      setShowDeleteGamesConfirm(false);
    } catch (error) {
      console.error("Delete all games error:", error);
    } finally {
      setIsDeletingGames(false);
    }
  };

  // Calculate total cost across all models (actual cost from AI Gateway)
  const totalCost =
    models?.reduce((sum, model) => sum + (model.totalCost ?? 0), 0) ?? 0;

  const totalInputTokens =
    models?.reduce((sum, m) => sum + m.totalInputTokens, 0) ?? 0;
  const totalOutputTokens =
    models?.reduce((sum, m) => sum + m.totalOutputTokens, 0) ?? 0;

  // Block access in production - render 404
  if (!isDev) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center font-mono">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">404</h1>
          <p className="text-neutral-600">Page not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/"
              className="text-sm font-mono text-neutral-700 hover:text-neutral-900"
            >
              &larr; BACK
            </Link>
            <span className="text-xs font-mono px-2 py-1 bg-yellow-400 text-neutral-900">
              DEV ONLY
            </span>
          </div>
          <h1 className="text-4xl font-mono font-bold text-neutral-900 mb-2">
            ADMIN
          </h1>
          <p className="text-neutral-700 font-mono">
            Manage AI models and game settings
          </p>
        </header>

        {/* Credits & Cost Summary */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AI Gateway Credits */}
          <div className="p-6 bg-white border border-neutral-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-mono font-bold text-neutral-700">
                AI GATEWAY CREDITS
              </h3>
              <button
                onClick={handleSyncCredits}
                disabled={isSyncingCredits}
                className={cn(
                  "px-2 py-1 font-mono font-bold text-xs transition-colors",
                  isSyncingCredits
                    ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                    : "border border-neutral-900 hover:bg-neutral-100",
                )}
              >
                {isSyncingCredits ? "SYNCING..." : "SYNC"}
              </button>
            </div>
            {credits ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-mono text-neutral-500 mb-1">
                    BALANCE
                  </div>
                  <div
                    className={cn(
                      "text-2xl font-mono font-bold",
                      credits.balance > 10
                        ? "text-neutral-900"
                        : credits.balance > 5
                          ? "text-amber-600"
                          : "text-red-600",
                    )}
                  >
                    ${credits.balance.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-neutral-500 mb-1">
                    USED
                  </div>
                  <div className="text-2xl font-mono font-bold text-neutral-900">
                    ${credits.totalUsed.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-neutral-500 mb-1">
                    LIMIT
                  </div>
                  <div className="text-2xl font-mono font-bold text-neutral-900">
                    ${credits.limit}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm font-mono text-neutral-500">
                No credit data. Click SYNC to fetch from AI Gateway.
              </div>
            )}
            {credits && (
              <div className="mt-4">
                <div className="text-xs font-mono text-neutral-500 mb-1">
                  {Math.round((credits.balance / credits.limit) * 100)}%
                  remaining
                </div>
                <div className="h-2 bg-neutral-200 overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      credits.balance > 10
                        ? "bg-neutral-900"
                        : credits.balance > 5
                          ? "bg-amber-600"
                          : "bg-red-600",
                    )}
                    style={{
                      width: `${(credits.balance / credits.limit) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cost Summary */}
          <div className="p-6 bg-white border border-neutral-900">
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-4">
              TRACKED COSTS (All Models)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-mono text-neutral-500 mb-1">
                  TOTAL COST
                </div>
                <div className="text-2xl font-mono font-bold text-neutral-900">
                  ${totalCost.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-xs font-mono text-neutral-500 mb-1">
                  INPUT TOKENS
                </div>
                <div className="text-2xl font-mono font-bold text-neutral-900">
                  {totalInputTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs font-mono text-neutral-500 mb-1">
                  OUTPUT TOKENS
                </div>
                <div className="text-2xl font-mono font-bold text-neutral-900">
                  {totalOutputTokens.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* Seed Models */}
          <div className="p-6 bg-white border border-neutral-900">
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-2">
              SEED MODELS
            </h3>
            <p className="text-sm font-mono text-neutral-500 mb-4">
              Add default AI models to the database
            </p>
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className={cn(
                "w-full py-2 font-mono font-bold text-sm transition-colors",
                isSeeding
                  ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                  : "bg-neutral-900 text-white hover:bg-neutral-800",
              )}
            >
              {isSeeding ? "SEEDING..." : "SEED MODELS"}
            </button>
          </div>

          {/* Reset Balances */}
          <div className="p-6 bg-white border border-neutral-900">
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-2">
              RESET BALANCES
            </h3>
            <p className="text-sm font-mono text-neutral-500 mb-4">
              Reset all model balances to $5,000
            </p>
            {showResetConfirm ? (
              <div className="space-y-2">
                <p className="text-xs font-mono text-red-600">
                  This cannot be undone. Are you sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    disabled={isResetting}
                    className="flex-1 py-2 font-mono font-bold text-sm bg-red-600 text-white hover:bg-red-700"
                  >
                    {isResetting ? "..." : "YES"}
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 py-2 font-mono font-bold text-sm border border-neutral-900 hover:bg-neutral-100"
                  >
                    NO
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full py-2 font-mono font-bold text-sm border border-red-600 text-red-600 hover:bg-red-50"
              >
                RESET ALL
              </button>
            )}
          </div>

          {/* Delete All Models */}
          <div className="p-6 bg-white border border-neutral-900">
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-2">
              DELETE MODELS
            </h3>
            <p className="text-sm font-mono text-neutral-500 mb-4">
              Delete all models and start fresh
            </p>
            {showDeleteConfirm ? (
              <div className="space-y-2">
                <p className="text-xs font-mono text-red-600">
                  This will delete all data!
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 py-2 font-mono font-bold text-sm bg-red-600 text-white hover:bg-red-700"
                  >
                    {isDeleting ? "..." : "YES"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-2 font-mono font-bold text-sm border border-neutral-900 hover:bg-neutral-100"
                  >
                    NO
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 font-mono font-bold text-sm border border-red-600 text-red-600 hover:bg-red-50"
              >
                DELETE ALL
              </button>
            )}
          </div>

          {/* Quick Links */}
          <div className="p-6 bg-white border border-neutral-900">
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-4">
              QUICK LINKS
            </h3>
            <div className="space-y-2">
              <Link href="/leaderboard">
                <button className="w-full py-2 font-mono font-bold text-sm border border-neutral-900 hover:bg-neutral-100 text-left px-3">
                  LEADERBOARD &rarr;
                </button>
              </Link>
              <Link href="/games">
                <button className="w-full py-2 font-mono font-bold text-sm border border-neutral-900 hover:bg-neutral-100 text-left px-3">
                  GAMES &rarr;
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Seed Result */}
        {seedResult && (
          <div className="mb-8 p-6 bg-white border border-neutral-900">
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-4">
              SEED RESULT
            </h3>
            <div className="space-y-1">
              {seedResult.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 text-sm font-mono"
                >
                  <span
                    className={cn(
                      "w-2 h-2",
                      r.created ? "bg-green-500" : "bg-neutral-300",
                    )}
                  />
                  <span className="text-neutral-900">{r.name}</span>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5",
                      r.created
                        ? "bg-green-100 text-green-700"
                        : "bg-neutral-100 text-neutral-500",
                    )}
                  >
                    {r.created ? "CREATED" : "EXISTS"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Models Table */}
        <div className="bg-white border border-neutral-900 mb-8">
          <div className="p-4 border-b border-neutral-900">
            <h2 className="text-lg font-mono font-bold text-neutral-900">
              REGISTERED MODELS ({models?.length ?? 0})
            </h2>
          </div>

          {!models ? (
            <div className="p-8 text-center font-mono text-neutral-700">
              Loading...
            </div>
          ) : models.length === 0 ? (
            <div className="p-8 text-center font-mono text-neutral-700">
              <p>No models registered.</p>
              <p className="text-sm mt-2">Auto-seeding models...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-neutral-100 text-xs font-mono font-bold text-neutral-700">
                    <th className="p-3 text-left">NAME</th>
                    <th className="p-3 text-left">PROVIDER</th>
                    <th className="p-3 text-right">COST</th>
                    <th className="p-3 text-right">BALANCE</th>
                    <th className="p-3 text-right">GAMES</th>
                    <th className="p-3 text-right">WINS</th>
                    <th className="p-3 text-right">WIN %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {models.map((model) => {
                    const winRate =
                      model.gamesPlayed > 0
                        ? ((model.gamesWon / model.gamesPlayed) * 100).toFixed(
                            0,
                          )
                        : "0";
                    return (
                      <tr
                        key={model._id}
                        className="font-mono text-sm hover:bg-neutral-50"
                      >
                        <td className="p-3 font-bold text-neutral-900">
                          {model.name}
                        </td>
                        <td className="p-3">
                          <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-700">
                            {model.provider}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-neutral-900 tabular-nums">
                          ${(model.totalCost ?? 0).toFixed(4)}
                        </td>
                        <td className="p-3 text-right font-bold tabular-nums">
                          ${model.balance.toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {model.gamesPlayed}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {model.gamesWon}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {winRate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Dev Game Stats (GPT-4.1-nano testing) */}
        <div className="bg-white border border-neutral-900 mb-8">
          <div className="p-4 border-b border-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-mono font-bold text-neutral-900">
                  DEV GAME STATS
                </h2>
                <span className="text-xs font-mono px-2 py-1 bg-yellow-400 text-neutral-900">
                  GPT-5-NANO ONLY
                </span>
              </div>
              {devStats &&
                devStats.length > 0 &&
                (showResetDevStatsConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-red-600">
                      Reset all dev stats?
                    </span>
                    <button
                      onClick={handleResetDevStats}
                      disabled={isResettingDevStats}
                      className="px-3 py-1 font-mono font-bold text-xs bg-red-600 text-white hover:bg-red-700"
                    >
                      {isResettingDevStats ? "..." : "YES"}
                    </button>
                    <button
                      onClick={() => setShowResetDevStatsConfirm(false)}
                      className="px-3 py-1 font-mono font-bold text-xs border border-neutral-900 hover:bg-neutral-100"
                    >
                      NO
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowResetDevStatsConfirm(true)}
                    className="px-3 py-1 font-mono font-bold text-xs border border-red-600 text-red-600 hover:bg-red-50"
                  >
                    RESET
                  </button>
                ))}
            </div>
            {devStatsSummary && (
              <div className="mt-3 grid grid-cols-5 gap-4 text-center">
                <div>
                  <div className="text-lg font-mono font-bold text-neutral-900">
                    {devStatsSummary.totalGames}
                  </div>
                  <div className="text-xs font-mono text-neutral-500">
                    GAMES
                  </div>
                </div>
                <div>
                  <div className="text-lg font-mono font-bold text-neutral-900">
                    ${devStatsSummary.totalCost.toFixed(4)}
                  </div>
                  <div className="text-xs font-mono text-neutral-500">COST</div>
                </div>
                <div>
                  <div className="text-lg font-mono font-bold text-neutral-900">
                    {devStatsSummary.totalInputTokens.toLocaleString()}
                  </div>
                  <div className="text-xs font-mono text-neutral-500">
                    INPUT
                  </div>
                </div>
                <div>
                  <div className="text-lg font-mono font-bold text-neutral-900">
                    {devStatsSummary.totalOutputTokens.toLocaleString()}
                  </div>
                  <div className="text-xs font-mono text-neutral-500">
                    OUTPUT
                  </div>
                </div>
                <div>
                  <div className="text-lg font-mono font-bold text-neutral-900">
                    {devStatsSummary.totalActions.toLocaleString()}
                  </div>
                  <div className="text-xs font-mono text-neutral-500">
                    ACTIONS
                  </div>
                </div>
              </div>
            )}
          </div>

          {!devStats ? (
            <div className="p-8 text-center font-mono text-neutral-700">
              Loading...
            </div>
          ) : devStats.length === 0 ? (
            <div className="p-8 text-center font-mono text-neutral-700">
              <p>No dev game stats yet.</p>
              <p className="text-sm mt-2">
                Run a dev game from the Games page to start tracking.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-yellow-100 text-xs font-mono font-bold text-neutral-700">
                    <th className="p-3 text-left">MODEL</th>
                    <th className="p-3 text-right">COST</th>
                    <th className="p-3 text-right">GAMES</th>
                    <th className="p-3 text-right">WINS</th>
                    <th className="p-3 text-right">PROFIT</th>
                    <th className="p-3 text-right">TOKENS</th>
                    <th className="p-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {devStats.map((stat) => {
                    const winRate =
                      stat.gamesPlayed > 0
                        ? ((stat.gamesWon / stat.gamesPlayed) * 100).toFixed(0)
                        : "0";
                    const totalActions =
                      stat.totalBets +
                      stat.totalRaises +
                      stat.totalCalls +
                      stat.totalFolds +
                      stat.totalChecks;
                    return (
                      <tr
                        key={stat._id}
                        className="font-mono text-sm hover:bg-yellow-50"
                      >
                        <td
                          className="p-3 font-bold text-neutral-900"
                          title={stat.gatewayId}
                        >
                          {abbreviateModel(stat.gatewayId)}
                        </td>
                        <td className="p-3 text-right font-bold text-neutral-900 tabular-nums">
                          ${stat.totalCost.toFixed(4)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {stat.gamesPlayed}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {stat.gamesWon} ({winRate}%)
                        </td>
                        <td
                          className={cn(
                            "p-3 text-right font-bold tabular-nums",
                            stat.totalProfit >= 0
                              ? "text-green-600"
                              : "text-red-600",
                          )}
                        >
                          {stat.totalProfit >= 0 ? "+" : ""}$
                          {stat.totalProfit.toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums text-neutral-600">
                          {(
                            stat.totalInputTokens + stat.totalOutputTokens
                          ).toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums text-neutral-600">
                          {totalActions}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Games Management */}
        <GamesSection
          games={games}
          deletingGameId={deletingGameId}
          isDeletingGames={isDeletingGames}
          showDeleteGamesConfirm={showDeleteGamesConfirm}
          setShowDeleteGamesConfirm={setShowDeleteGamesConfirm}
          handleDeleteGame={handleDeleteGame}
          handleDeleteAllGames={handleDeleteAllGames}
        />
      </div>
    </div>
  );
}

// Games Section Component with tabs and search
function GamesSection({
  games,
  deletingGameId,
  isDeletingGames,
  showDeleteGamesConfirm,
  setShowDeleteGamesConfirm,
  handleDeleteGame,
  handleDeleteAllGames,
}: {
  games: any[] | undefined;
  deletingGameId: string | null;
  isDeletingGames: boolean;
  showDeleteGamesConfirm: boolean;
  setShowDeleteGamesConfirm: (v: boolean) => void;
  handleDeleteGame: (id: Id<"games">) => void;
  handleDeleteAllGames: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "all" | "active" | "completed" | "dev"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter games based on tab and search
  const filteredGames = games?.filter((game) => {
    // Tab filter
    if (
      activeTab === "active" &&
      game.status !== "active" &&
      game.status !== "waiting"
    ) {
      return false;
    }
    if (activeTab === "completed" && game.status !== "completed") {
      return false;
    }
    if (activeTab === "dev" && !game.isDevGame) {
      return false;
    }

    // Search filter (by ID or player model IDs)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesId = game._id.toLowerCase().includes(query);
      const matchesPlayer = game.playerModelIds?.some((id: string) =>
        id.toLowerCase().includes(query),
      );
      return matchesId || matchesPlayer;
    }

    return true;
  });

  const activeCount =
    games?.filter((g) => g.status === "active" || g.status === "waiting")
      .length ?? 0;
  const completedCount =
    games?.filter((g) => g.status === "completed").length ?? 0;
  const devCount = games?.filter((g) => g.isDevGame).length ?? 0;

  return (
    <div className="bg-white border border-neutral-900">
      {/* Header with tabs */}
      <div className="p-4 border-b border-neutral-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-mono font-bold text-neutral-900">
            GAMES ({games?.length ?? 0})
          </h2>
          {games &&
            games.length > 0 &&
            (showDeleteGamesConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-red-600">
                  Delete all games & reset stats?
                </span>
                <button
                  onClick={handleDeleteAllGames}
                  disabled={isDeletingGames}
                  className="px-3 py-1 font-mono font-bold text-xs bg-red-600 text-white hover:bg-red-700"
                >
                  {isDeletingGames ? "..." : "YES"}
                </button>
                <button
                  onClick={() => setShowDeleteGamesConfirm(false)}
                  className="px-3 py-1 font-mono font-bold text-xs border border-neutral-900 hover:bg-neutral-100"
                >
                  NO
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteGamesConfirm(true)}
                className="px-3 py-1 font-mono font-bold text-xs border border-red-600 text-red-600 hover:bg-red-50"
              >
                DELETE ALL GAMES
              </button>
            ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-3 py-1.5 font-mono font-bold text-xs transition-colors",
              activeTab === "all"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
            )}
          >
            ALL ({games?.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("active")}
            className={cn(
              "px-3 py-1.5 font-mono font-bold text-xs transition-colors",
              activeTab === "active"
                ? "bg-blue-600 text-white"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200",
            )}
          >
            ACTIVE ({activeCount})
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={cn(
              "px-3 py-1.5 font-mono font-bold text-xs transition-colors",
              activeTab === "completed"
                ? "bg-green-600 text-white"
                : "bg-green-100 text-green-700 hover:bg-green-200",
            )}
          >
            COMPLETED ({completedCount})
          </button>
          <button
            onClick={() => setActiveTab("dev")}
            className={cn(
              "px-3 py-1.5 font-mono font-bold text-xs transition-colors",
              activeTab === "dev"
                ? "bg-yellow-500 text-white"
                : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200",
            )}
          >
            DEV ({devCount})
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by game ID or model..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 font-mono text-sm border border-neutral-300 focus:border-neutral-900 focus:outline-none"
        />
      </div>

      {!games ? (
        <div className="p-8 text-center font-mono text-neutral-700">
          Loading...
        </div>
      ) : filteredGames?.length === 0 ? (
        <div className="p-8 text-center font-mono text-neutral-700">
          {searchQuery ? "No games match your search." : "No games found."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-100 text-xs font-mono font-bold text-neutral-700">
                <th className="p-3 text-left">ID</th>
                <th className="p-3 text-left">STATUS</th>
                <th className="p-3 text-left">PLAYERS</th>
                <th className="p-3 text-right">HANDS</th>
                <th className="p-3 text-right">BUY-IN</th>
                <th className="p-3 text-right">AI COST</th>
                <th className="p-3 text-left">CREATED</th>
                <th className="p-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filteredGames?.map((game) => (
                <tr
                  key={game._id}
                  className={cn(
                    "font-mono text-sm hover:bg-neutral-50",
                    (game.status === "active" || game.status === "waiting") &&
                      !game.isDevGame &&
                      "bg-blue-50",
                    game.isDevGame && "bg-yellow-50",
                  )}
                >
                  <td className="p-3 text-neutral-600">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/game/poker/${game._id}`}
                        className="hover:text-neutral-900 hover:underline"
                      >
                        {game._id.slice(-8)}
                      </Link>
                      {game.isDevGame && (
                        <span className="text-[10px] px-1 py-0.5 bg-yellow-400 text-neutral-900 font-bold">
                          DEV
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5",
                        game.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : game.status === "active"
                            ? "bg-blue-100 text-blue-700"
                            : game.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700",
                      )}
                    >
                      {game.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-neutral-600">
                    {game.playerModelIds.length} players
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {game.currentHand}/{game.maxHands}
                  </td>
                  <td className="p-3 text-right tabular-nums">${game.buyIn}</td>
                  <td className="p-3 text-right tabular-nums text-neutral-600">
                    ${(game.totalAICost ?? 0).toFixed(4)}
                  </td>
                  <td className="p-3 text-neutral-600">
                    {new Date(game.createdAt).toLocaleDateString()}{" "}
                    {new Date(game.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleDeleteGame(game._id)}
                      disabled={deletingGameId === game._id}
                      className={cn(
                        "px-2 py-1 font-mono font-bold text-xs transition-colors",
                        deletingGameId === game._id
                          ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                          : "border border-red-600 text-red-600 hover:bg-red-50",
                      )}
                    >
                      {deletingGameId === game._id ? "..." : "DELETE"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
