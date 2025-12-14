/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiAction from "../aiAction.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as devStats from "../devStats.js";
import type * as games from "../games.js";
import type * as hands from "../hands.js";
import type * as internalRefs from "../internalRefs.js";
import type * as models from "../models.js";
import type * as players from "../players.js";
import type * as pokerLogic from "../pokerLogic.js";
import type * as rankedGames from "../rankedGames.js";
import type * as scheduler from "../scheduler.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiAction: typeof aiAction;
  credits: typeof credits;
  crons: typeof crons;
  devStats: typeof devStats;
  games: typeof games;
  hands: typeof hands;
  internalRefs: typeof internalRefs;
  models: typeof models;
  players: typeof players;
  pokerLogic: typeof pokerLogic;
  rankedGames: typeof rankedGames;
  scheduler: typeof scheduler;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
