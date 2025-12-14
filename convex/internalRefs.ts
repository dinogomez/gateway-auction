/**
 * Internal function references for scheduler calls
 *
 * This file provides typed references for internal functions
 * that can be used with ctx.scheduler.runAfter()
 *
 * After running `npx convex dev`, you can replace these with
 * imports from "./_generated/api"
 */

import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

// Internal mutation references for rankedGames
export const startNewHandRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  void
>("rankedGames:startNewHand");

export const scheduleAITurnRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; expectedTurn: number },
  void
>("rankedGames:scheduleAITurn");

export const handleTimeoutRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; expectedTurn: number },
  void
>("rankedGames:handleTimeout");

export const processAITurnRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; expectedTurn: number },
  void
>("rankedGames:processAITurn");

export const settleGameRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  void
>("rankedGames:settleGame");

// AI action reference
export const getAIDecisionRef = makeFunctionReference<
  "action",
  {
    gameId: Id<"games">;
    modelGatewayId: string;
    prompt: string;
    validActions: {
      canCheck: boolean;
      canCall: boolean;
      canRaise: boolean;
      callAmount: number;
      minRaiseTotal: number;
      maxRaiseTotal: number;
    };
    expectedTurn: number;
  },
  void
>("aiAction:getAIDecision");

// AI decision application mutation reference
export const applyAIDecisionRef = makeFunctionReference<
  "mutation",
  {
    gameId: Id<"games">;
    expectedTurn: number;
    action: string;
    amount?: number;
    reasoning: string;
    responseTimeMs: number;
    tokensUsed: { input: number; output: number };
    cost?: number; // Actual USD cost from AI Gateway
  },
  void
>("rankedGames:applyAIDecision");

// Credits sync action reference (called after game settlement)
export const syncCreditsInternalRef = makeFunctionReference<
  "action",
  Record<string, never>,
  void
>("credits:syncCreditsInternal");

// Rank snapshot mutation reference (called after ranked game settlement)
export const saveRankSnapshotRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  void
>("models:saveRankSnapshot");

// Deal next street during all-in showdown
export const dealNextStreetRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; targetPhase: string },
  void
>("rankedGames:dealNextStreet");
