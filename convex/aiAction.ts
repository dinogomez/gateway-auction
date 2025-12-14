/**
 * AI Action for Ranked Mode
 * Uses Convex actions to call AI models via generateObject
 */

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getValidActions,
  getPositionName,
  cardToString,
  type Card,
  type PlayerState,
} from "./pokerLogic";
import { applyAIDecisionRef } from "./internalRefs";
import { generateObject, NoObjectGeneratedError } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

// Schema for poker action response (optimized for cost)
const PokerActionSchema = z.object({
  reasoning: z.string().max(300).describe("Brief reasoning (max 300 chars)"),
  action: z.enum(["fold", "check", "call", "raise"]),
  amount: z.number().optional().describe("For raise only"),
});

// System prompt providing strategic poker context
const POKER_SYSTEM_PROMPT = `You are an expert poker player. Key concepts:
- Opponents cannot see your cards - your betting tells a story
- Raising can win the pot immediately if opponents fold (fold equity)
- Opponent stats: VPIP=loose/tight, PFR=passive/aggressive, Agg=betting frequency
- Consider pot odds, position advantage, and opponent tendencies
- Balance your play - be unpredictable`;

/**
 * Extract base action and optional amount from strings like "call 20" or "raise 100"
 * Handles cases where AI includes amount in action field (e.g., Kimi K2)
 */
function extractActionAndAmount(
  actionStr: unknown,
): { action: "fold" | "check" | "call" | "raise"; amount?: number } | null {
  if (typeof actionStr !== "string") return null;
  const normalized = actionStr.toLowerCase().trim();
  // Match action at start, optionally followed by space and amount
  const match = normalized.match(/^(fold|check|call|raise)(?:\s+(\d+))?/);
  if (!match) return null;
  return {
    action: match[1] as "fold" | "check" | "call" | "raise",
    amount: match[2] ? parseInt(match[2], 10) : undefined,
  };
}

// =============================================================================
// TYPES
// =============================================================================

interface AIDecision {
  action: "fold" | "check" | "call" | "raise";
  amount?: number;
  reasoning: string;
  responseTimeMs: number;
  tokensUsed: { input: number; output: number };
  cost: number; // Actual USD cost from AI Gateway
  valid: boolean;
}

interface GameContext {
  currentHand: number;
  maxHands: number;
  phase: string;
  pot: number;
  currentBet: number;
  minRaise: number;
  communityCards: Card[];
  playerStates: PlayerState[];
  dealerIndex: number;
  currentPlayerIndex: number;
  blinds: { small: number; big: number };
  inGameStats: Array<{
    modelId: string;
    stats: {
      handsDealt: number;
      handsPlayed: number;
      preflopRaises: number;
      preflopCalls: number;
      preflopFolds: number;
      totalBets: number;
      totalRaises: number;
      totalCalls: number;
      totalFolds: number;
      totalChecks: number;
      showdownsReached: number;
      showdownsWon: number;
    };
  }>;
}

// =============================================================================
// PROMPT GENERATION
// =============================================================================

/**
 * Generate the poker prompt for AI decision (optimized for cost)
 * Uses compact format to minimize input tokens
 */
function generatePrompt(
  context: GameContext,
  currentPlayer: PlayerState,
  validActions: ReturnType<typeof getValidActions>,
): string {
  const {
    currentHand,
    maxHands,
    phase,
    pot,
    communityCards,
    playerStates,
    dealerIndex,
    inGameStats,
    blinds,
  } = context;

  // Only include active players (not folded)
  const activePlayers = playerStates.filter((p) => !p.folded);
  const positionName = getPositionName(
    currentPlayer.position,
    dealerIndex,
    playerStates.length,
  );

  // Compact stack format: "Name:1000 Name:500(A)" where (A)=all-in, (Y)=you
  const stacks = activePlayers
    .map((p) => {
      const tag =
        p.modelId === currentPlayer.modelId ? "(Y)" : p.isAllIn ? "(A)" : "";
      return `${p.codename}:${p.chips}${tag}`;
    })
    .join(" ");

  // Compact opponent tendencies: only for active opponents with enough data
  const tendencies = inGameStats
    .filter((s) => {
      const player = activePlayers.find((p) => p.modelId === s.modelId);
      return (
        player && s.modelId !== currentPlayer.modelId && s.stats.handsDealt >= 3
      );
    })
    .map((s) => {
      const { stats } = s;
      const player = activePlayers.find((p) => p.modelId === s.modelId);
      if (!player) return "";

      const vpip =
        stats.handsDealt > 0
          ? Math.round((stats.handsPlayed / stats.handsDealt) * 100)
          : 0;
      const pfr =
        stats.handsDealt > 0
          ? Math.round((stats.preflopRaises / stats.handsDealt) * 100)
          : 0;

      // Compact aggression: H/M/L/VL
      const totalActions =
        stats.totalBets +
        stats.totalRaises +
        stats.totalCalls +
        stats.totalFolds;
      let agg = "?";
      if (totalActions >= 5) {
        const ratio =
          stats.totalCalls + stats.totalChecks > 0
            ? (stats.totalBets + stats.totalRaises) /
              (stats.totalCalls + stats.totalChecks)
            : 2;
        agg =
          ratio > 2
            ? "VH"
            : ratio > 1.2
              ? "H"
              : ratio > 0.8
                ? "M"
                : ratio > 0.4
                  ? "L"
                  : "VL";
      }

      return `${player.codename}:${vpip}/${pfr}/${agg}`;
    })
    .filter(Boolean)
    .join(" ");

  // Format cards compactly
  const hole = currentPlayer.hand.map(cardToString).join("");
  const board =
    communityCards.length > 0 ? communityCards.map(cardToString).join("") : "-";

  // Compact valid actions
  const actions: string[] = [];
  if (validActions.canCheck) actions.push("check");
  if (validActions.canCall) actions.push(`call ${validActions.callAmount}`);
  if (validActions.canRaise)
    actions.push(
      `raise ${validActions.minRaiseTotal}-${validActions.maxRaiseTotal}`,
    );
  actions.push("fold");

  return `Texas Hold'em. Hand ${currentHand}/${maxHands}, ${phase}, blinds ${blinds.small}/${blinds.big}
Position: ${positionName}
Stacks: ${stacks}
${tendencies ? `Stats(VPIP/PFR/Agg): ${tendencies}\n` : ""}Cards: ${hole} | Board: ${board}
Pot: ${pot}, Your chips: ${currentPlayer.chips}
Actions: ${actions.join(", ")}
Decide action.`;
}

// =============================================================================
// AI ACTION
// =============================================================================

/**
 * Call AI model to get poker decision
 * This is a Convex action that uses the AI SDK directly
 */
export const getAIDecision = internalAction({
  args: {
    gameId: v.id("games"),
    modelGatewayId: v.string(),
    prompt: v.string(),
    validActions: v.object({
      canCheck: v.boolean(),
      canCall: v.boolean(),
      canRaise: v.boolean(),
      callAmount: v.number(),
      minRaiseTotal: v.number(),
      maxRaiseTotal: v.number(),
    }),
    expectedTurn: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const startTime = Date.now();

    // Default fallback decision
    const defaultAction = args.validActions.canCheck ? "check" : "fold";
    let decision: AIDecision = {
      action: defaultAction,
      reasoning: "Fallback action",
      responseTimeMs: 0,
      tokensUsed: { input: 0, output: 0 },
      cost: 0,
      valid: false,
    };

    try {
      console.log(
        `[AI] Getting decision for ${args.modelGatewayId}, turn ${args.expectedTurn}`,
      );

      let object: {
        reasoning: string;
        action: "fold" | "check" | "call" | "raise";
        amount?: number;
      } = {
        reasoning: "Default fallback",
        action: defaultAction as "fold" | "check" | "call" | "raise",
        amount: undefined,
      };
      let tokenUsage = { inputTokens: 0, outputTokens: 0 };
      let cost = 0;

      try {
        // Use AI SDK directly with the gateway
        const result = await generateObject({
          model: gateway(args.modelGatewayId),
          system: POKER_SYSTEM_PROMPT,
          schema: PokerActionSchema,
          schemaName: "PokerAction",
          schemaDescription: "A poker action decision with reasoning",
          prompt: args.prompt,
          // Repair malformed JSON responses
          experimental_repairText: async ({ text }) => {
            // Try to fix common issues
            if (text.endsWith('"')) {
              return text + "}";
            }
            // Add closing brace if missing
            const openBraces = (text.match(/{/g) || []).length;
            const closeBraces = (text.match(/}/g) || []).length;
            if (openBraces > closeBraces) {
              return text + "}".repeat(openBraces - closeBraces);
            }
            return text;
          },
        });

        object = result.object;
        tokenUsage = {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        };

        // Extract cost from AI Gateway - it's in response.body.providerMetadata.gateway.cost
        // The cost is returned as a string like "0.0000071"
        const responseBody = result.response?.body as any;
        const gatewayMetadata = responseBody?.providerMetadata?.gateway;

        if (gatewayMetadata?.cost) {
          cost = parseFloat(gatewayMetadata.cost) || 0;
          console.log(
            `[AI] Cost from gateway: $${cost.toFixed(7)} (generationId: ${gatewayMetadata.generationId})`,
          );
        } else {
          console.log(
            `[AI] No cost in response, gateway metadata:`,
            gatewayMetadata,
          );
        }

        // Some models return malformed JSON like {"type":"object","properties":{...}}
        if (!object.action && (object as any).properties) {
          console.log(
            "[AI] Detected malformed response, extracting from properties",
          );
          const props = (object as any).properties;
          object = {
            reasoning: props.reasoning || "",
            action: props.action || "fold",
            amount: props.amount,
          };
        }
      } catch (parseError: any) {
        // Try to extract from the error's text/value if available
        console.log(
          "[AI] Schema validation failed, attempting manual extraction",
        );

        let extracted = false;

        // Check if error has the malformed value
        if (parseError?.cause?.value?.properties) {
          const props = parseError.cause.value.properties;
          const extracted_action = extractActionAndAmount(props.action);
          if (extracted_action) {
            object = {
              reasoning: String(props.reasoning || "Extracted from malformed response").slice(0, 300),
              action: extracted_action.action,
              amount:
                typeof props.amount === "number"
                  ? props.amount
                  : extracted_action.amount,
            };
            extracted = true;
            console.log(
              `[AI] Extracted from malformed response: ${object.action}`,
            );
          }
        }

        // Handle capitalized keys (e.g., Kimi returns "Action" instead of "action")
        // Also handles action with amount like "call 20" or "raise 100"
        if (!extracted && parseError?.cause?.value) {
          const val = parseError.cause.value;
          // Check for capitalized keys
          const actionVal = val.action || val.Action;
          const reasoningVal = val.reasoning || val.Reasoning;
          const amountVal = val.amount || val.Amount;

          const extracted_action = extractActionAndAmount(actionVal);
          if (extracted_action) {
            object = {
              reasoning: String(
                reasoningVal || "Extracted from capitalized response",
              ).slice(0, 300),
              action: extracted_action.action,
              amount:
                typeof amountVal === "number"
                  ? amountVal
                  : extracted_action.amount,
            };
            extracted = true;
            console.log(
              `[AI] Extracted from capitalized keys: ${object.action}`,
            );
          }
        }

        // Handle "decision" field (e.g., Kimi K2 returns decision instead of action)
        if (!extracted && parseError?.cause?.value) {
          const val = parseError.cause.value;
          const decisionVal = val.decision || val.Decision;

          if (decisionVal) {
            const extracted_action = extractActionAndAmount(decisionVal);
            if (extracted_action) {
              object = {
                reasoning: String(
                  val.reasoning || val.Reasoning || "Extracted from decision field"
                ).slice(0, 300),
                action: extracted_action.action,
                amount:
                  typeof val.amount === "number"
                    ? val.amount
                    : extracted_action.amount,
              };
              extracted = true;
              console.log(
                `[AI] Extracted from decision field: ${object.action}`,
              );
            }
          }
        }

        // Try parsing the text field
        // Also handles action with amount like "call 20" or "raise 100"
        if (!extracted && parseError?.text) {
          try {
            // Try to extract JSON from text (may have leading/trailing whitespace or text)
            const jsonMatch = parseError.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const props = parsed.properties || parsed;
              // Handle lowercase, capitalized keys, and decision field
              const actionVal = props.action || props.Action || props.decision || props.Decision;
              const reasoningVal = props.reasoning || props.Reasoning;
              const amountVal = props.amount || props.Amount;
              const extracted_action = extractActionAndAmount(actionVal);
              if (extracted_action) {
                object = {
                  reasoning: String(reasoningVal || "Extracted from text").slice(0, 300),
                  action: extracted_action.action,
                  amount:
                    typeof amountVal === "number"
                      ? amountVal
                      : extracted_action.amount,
                };
                extracted = true;
                console.log(`[AI] Extracted from text: ${object.action}`);
              }
            }
          } catch {}
        }

        if (!extracted) {
          throw parseError;
        }

        // Estimate token usage from error if available
        if (parseError?.usage) {
          tokenUsage = {
            inputTokens: parseError.usage.inputTokens ?? 0,
            outputTokens: parseError.usage.outputTokens ?? 0,
          };
        }
      }

      console.log(`[AI] Got response: ${object.action} ${object.amount || ""}`);

      // Validate the action is legal
      let validatedAction = object.action;
      let validatedAmount = object.amount;

      // Check if the action is valid for the current state
      if (validatedAction === "check" && !args.validActions.canCheck) {
        validatedAction = args.validActions.canCall ? "call" : "fold";
        validatedAmount = args.validActions.canCall
          ? args.validActions.callAmount
          : undefined;
      }

      if (validatedAction === "call" && !args.validActions.canCall) {
        validatedAction = args.validActions.canCheck ? "check" : "fold";
        validatedAmount = undefined;
      }

      if (validatedAction === "raise") {
        if (!args.validActions.canRaise) {
          // Can't raise - fall back to call if possible, otherwise check if possible, otherwise fold
          if (args.validActions.canCall) {
            validatedAction = "call";
            validatedAmount = args.validActions.callAmount;
          } else if (args.validActions.canCheck) {
            validatedAction = "check";
            validatedAmount = undefined;
          } else {
            validatedAction = "fold";
            validatedAmount = undefined;
          }
        } else if (validatedAmount !== undefined) {
          // Clamp raise amount to valid range
          validatedAmount = Math.max(
            args.validActions.minRaiseTotal,
            Math.min(args.validActions.maxRaiseTotal, validatedAmount),
          );
        } else {
          // Default to min raise if no amount specified
          validatedAmount = args.validActions.minRaiseTotal;
        }
      }

      decision = {
        action: validatedAction,
        amount: validatedAmount,
        reasoning: object.reasoning || "",
        responseTimeMs: Date.now() - startTime,
        tokensUsed: {
          input: tokenUsage.inputTokens,
          output: tokenUsage.outputTokens,
        },
        cost,
        valid: true,
      };
    } catch (error) {
      console.error("[AI] Decision error:", error);

      // Handle NoObjectGeneratedError specifically
      let errorMessage = "Unknown error";
      let tokenUsage = { input: 0, output: 0 };
      let rawText = "";

      if (NoObjectGeneratedError.isInstance(error)) {
        console.log("[AI] NoObjectGeneratedError - attempting to extract from text");
        errorMessage = `Model response could not be parsed`;
        rawText = error.text || "";

        // Try to extract action from the raw text
        if (rawText) {
          console.log("[AI] Raw text from error:", rawText.slice(0, 500));
          try {
            // Try to find JSON in the text
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const actionVal = parsed.action || parsed.Action || parsed.decision || parsed.Decision;
              const extracted = extractActionAndAmount(actionVal);
              if (extracted) {
                decision = {
                  action: extracted.action,
                  amount: extracted.amount ?? parsed.amount ?? parsed.Amount,
                  reasoning: String(parsed.reasoning || parsed.Reasoning || "Extracted from error text").slice(0, 300),
                  responseTimeMs: Date.now() - startTime,
                  tokensUsed: {
                    input: error.usage?.inputTokens ?? 0,
                    output: error.usage?.outputTokens ?? 0,
                  },
                  cost: 0,
                  valid: true,
                };
                console.log(`[AI] Extracted from NoObjectGeneratedError: ${decision.action}`);
              }
            }
          } catch (parseErr) {
            console.log("[AI] Could not parse text from NoObjectGeneratedError");
          }
        }

        // Get token usage from error if available
        if (error.usage) {
          tokenUsage = {
            input: error.usage.inputTokens ?? 0,
            output: error.usage.outputTokens ?? 0,
          };
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        // Try to extract raw text from other error types
        if ((error as any).text) {
          rawText = (error as any).text;
        }
      }

      // If extraction failed and we have raw text, try using GPT-5-nano as a fallback parser
      if (!decision.valid && rawText) {
        console.log("[AI] Attempting GPT-5-nano fallback parser");
        try {
          const fallbackResult = await generateObject({
            model: gateway("openai/gpt-5-nano"),
            schema: PokerActionSchema,
            schemaName: "PokerAction",
            schemaDescription: "Extract the poker action from the text",
            prompt: `Extract the poker action from this AI response. The valid actions are: fold, check, call, raise.

IMPORTANT: For the "reasoning" field, extract the ORIGINAL reasoning/explanation from the AI's response - do not summarize or paraphrase, copy the key reasoning text directly.

If the response mentions raising or betting an amount, use action "raise" with that amount.
If the response mentions calling, use action "call".
If the response mentions checking, use action "check".
If the response mentions folding, use action "fold".

AI Response to parse:
${rawText.slice(0, 1500)}

Extract the action, amount (if raise), and the original reasoning from the response.`,
          });

          const fallbackAction = fallbackResult.object;
          console.log(`[AI] GPT-5-nano extracted: ${fallbackAction.action}`);

          // Validate the extracted action
          let validatedAction = fallbackAction.action;
          let validatedAmount = fallbackAction.amount;

          if (validatedAction === "check" && !args.validActions.canCheck) {
            validatedAction = args.validActions.canCall ? "call" : "fold";
          }
          if (validatedAction === "call" && !args.validActions.canCall) {
            validatedAction = args.validActions.canCheck ? "check" : "fold";
          }
          if (validatedAction === "raise") {
            if (!args.validActions.canRaise) {
              validatedAction = args.validActions.canCall ? "call" : args.validActions.canCheck ? "check" : "fold";
              validatedAmount = undefined;
            } else if (validatedAmount !== undefined) {
              validatedAmount = Math.max(
                args.validActions.minRaiseTotal,
                Math.min(args.validActions.maxRaiseTotal, validatedAmount),
              );
            } else {
              validatedAmount = args.validActions.minRaiseTotal;
            }
          }

          // Get fallback cost
          const fallbackResponseBody = fallbackResult.response?.body as any;
          const fallbackCost = parseFloat(fallbackResponseBody?.providerMetadata?.gateway?.cost || "0") || 0;

          decision = {
            action: validatedAction,
            amount: validatedAmount,
            reasoning: fallbackAction.reasoning || "Parsed by fallback",
            responseTimeMs: Date.now() - startTime,
            tokensUsed: {
              input: tokenUsage.input + (fallbackResult.usage.inputTokens ?? 0),
              output: tokenUsage.output + (fallbackResult.usage.outputTokens ?? 0),
            },
            cost: fallbackCost,
            valid: true,
          };
        } catch (fallbackError) {
          console.error("[AI] GPT-5-nano fallback failed:", fallbackError);
        }
      }

      // If we still didn't extract a valid decision, use the default
      if (!decision.valid) {
        decision = {
          action: defaultAction,
          reasoning: `Error: ${errorMessage}`,
          responseTimeMs: Date.now() - startTime,
          tokensUsed: tokenUsage,
          cost: 0,
          valid: false,
        };
      }
    }

    // ALWAYS schedule the mutation to apply the AI decision
    try {
      console.log(
        `[AI] Scheduling applyAIDecision: ${decision.action} for turn ${args.expectedTurn}`,
      );
      await ctx.scheduler.runAfter(0, applyAIDecisionRef, {
        gameId: args.gameId,
        expectedTurn: args.expectedTurn,
        action: decision.action,
        amount: decision.amount,
        reasoning: decision.reasoning,
        responseTimeMs: decision.responseTimeMs,
        tokensUsed: decision.tokensUsed,
        cost: decision.cost,
      });
    } catch (scheduleError) {
      console.error("[AI] Failed to schedule applyAIDecision:", scheduleError);
      // This is critical - if scheduling fails, the game will stop
      throw scheduleError;
    }
  },
});

// Export helper for use in other files
export { generatePrompt };
