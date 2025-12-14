/**
 * API Route for Ranked Mode AI Decisions
 * Uses generateObject for structured output
 */

import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { NextResponse } from "next/server";

// Schema for poker action response
const PokerActionSchema = z.object({
  reasoning: z
    .string()
    .max(500)
    .describe("Your thought process for this decision (max 500 chars)"),
  action: z.enum(["fold", "check", "call", "raise"]),
  amount: z
    .number()
    .optional()
    .describe("Required for raise, must be between minRaise and maxRaise"),
});

type PokerAction = z.infer<typeof PokerActionSchema>;

interface ValidActions {
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  minRaiseTotal: number;
  maxRaiseTotal: number;
}

/**
 * Attempt to repair malformed JSON from AI models
 * Some models return arrays like [7] instead of objects
 */
function repairMalformedJson(text: string, validActions: ValidActions): string {
  const trimmed = text.trim();

  // Handle array responses like [7] or ["raise", 100]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        // If it's a single number, treat it as a raise amount
        if (parsed.length === 1 && typeof parsed[0] === "number") {
          const amount = parsed[0];
          return JSON.stringify({
            reasoning: "AI returned malformed response (array with number)",
            action: validActions.canRaise ? "raise" : validActions.canCall ? "call" : "check",
            amount: validActions.canRaise ? amount : undefined,
          });
        }
        // If it's [action, amount] format
        if (parsed.length >= 1 && typeof parsed[0] === "string") {
          const action = parsed[0].toLowerCase();
          const amount = parsed[1];
          if (["fold", "check", "call", "raise"].includes(action)) {
            return JSON.stringify({
              reasoning: "AI returned malformed response (array format)",
              action,
              amount: typeof amount === "number" ? amount : undefined,
            });
          }
        }
      }
    } catch {
      // Fall through to other repairs
    }
  }

  // Handle responses that are just a number
  const numMatch = trimmed.match(/^(\d+)$/);
  if (numMatch) {
    const amount = parseInt(numMatch[1], 10);
    return JSON.stringify({
      reasoning: "AI returned only a number",
      action: validActions.canRaise ? "raise" : validActions.canCall ? "call" : "check",
      amount: validActions.canRaise ? amount : undefined,
    });
  }

  // Handle responses that are just an action word
  const actionMatch = trimmed.toLowerCase().match(/^(fold|check|call|raise)$/);
  if (actionMatch) {
    return JSON.stringify({
      reasoning: "AI returned only an action",
      action: actionMatch[1],
      amount: undefined,
    });
  }

  // Try to extract JSON from text that might have extra content
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Return original text if no repair possible
  return text;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { modelId, prompt, validActions } = body as {
      modelId: string;
      prompt: string;
      validActions: ValidActions;
    };

    if (!modelId || !prompt || !validActions) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const startTime = Date.now();

    try {
      const { object, usage } = await generateObject({
        model: gateway(modelId),
        schema: PokerActionSchema,
        schemaName: "PokerAction",
        schemaDescription: "A poker action decision with reasoning",
        prompt,
        experimental_repairText: async ({ text }) => {
          console.log(`[${modelId}] Attempting to repair malformed response:`, text);
          return repairMalformedJson(text, validActions);
        },
      });

      // Validate the action is legal
      let validatedAction = object.action;
      let validatedAmount = object.amount;

      // Check if the action is valid for the current state
      if (validatedAction === "check" && !validActions.canCheck) {
        validatedAction = validActions.canCall ? "call" : "fold";
        validatedAmount = validActions.canCall
          ? validActions.callAmount
          : undefined;
      }

      if (validatedAction === "call" && !validActions.canCall) {
        validatedAction = validActions.canCheck ? "check" : "fold";
        validatedAmount = undefined;
      }

      if (validatedAction === "raise") {
        if (!validActions.canRaise) {
          validatedAction = validActions.canCall ? "call" : "check";
          validatedAmount = validActions.canCall
            ? validActions.callAmount
            : undefined;
        } else if (validatedAmount !== undefined) {
          // Clamp raise amount to valid range
          validatedAmount = Math.max(
            validActions.minRaiseTotal,
            Math.min(validActions.maxRaiseTotal, validatedAmount),
          );
        } else {
          // Default to min raise if no amount specified
          validatedAmount = validActions.minRaiseTotal;
        }
      }

      return NextResponse.json({
        action: validatedAction,
        amount: validatedAmount,
        reasoning: object.reasoning,
        responseTimeMs: Date.now() - startTime,
        tokensUsed: {
          input: usage.inputTokens,
          output: usage.outputTokens,
        },
      });
    } catch (aiError) {
      console.error("AI generation error:", aiError);

      // Return default action on AI error
      const defaultAction = validActions.canCheck ? "check" : "fold";

      return NextResponse.json({
        action: defaultAction,
        amount: undefined,
        reasoning: `AI error: ${aiError instanceof Error ? aiError.message : "Unknown error"}`,
        responseTimeMs: Date.now() - startTime,
        tokensUsed: { input: 0, output: 0 },
        error: true,
      });
    }
  } catch (error) {
    console.error("Request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
