import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { headers } from "next/headers";
import { z } from "zod";
import { checkAllRateLimits } from "@/lib/ratelimit";
import { POKER_SYSTEM_PROMPT, generatePokerPrompt } from "@/lib/poker-prompts";

// Zod schema for request validation
const CardSchema = z.object({
  suit: z.enum(["h", "d", "c", "s"]),
  rank: z.enum([
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "j",
    "q",
    "k",
    "a",
  ]),
});

const OpponentSchema = z.object({
  label: z.string(),
  chipStack: z.number(),
  currentBet: z.number(),
  status: z.enum(["active", "folded", "all-in", "sitting-out"]),
  position: z.string(),
  hasActed: z.boolean(),
});

const HistoryEntrySchema = z.object({
  label: z.string(),
  action: z.enum(["fold", "check", "call", "raise", "all-in"]),
  amount: z.number().optional(),
  phase: z.enum(["preflop", "flop", "turn", "river", "showdown"]),
});

const PokerAgentContextSchema = z.object({
  holeCards: z.array(CardSchema),
  communityCards: z.array(CardSchema),
  currentPhase: z.enum(["preflop", "flop", "turn", "river", "showdown"]),
  potSize: z.number(),
  currentBet: z.number(),
  minRaise: z.number(),
  ownChipStack: z.number(),
  ownCurrentBet: z.number(),
  amountToCall: z.number(),
  position: z.enum(["early", "middle", "late", "blinds"]),
  isDealer: z.boolean(),
  playersToActAfterMe: z.number(),
  opponents: z.array(OpponentSchema),
  bettingHistory: z.array(HistoryEntrySchema),
  handNumber: z.number(),
  totalHands: z.number(),
});

const RequestBodySchema = z.object({
  modelId: z.string().min(1),
  context: PokerAgentContextSchema,
});

/**
 * POST /api/game/poker-think
 *
 * Streaming endpoint for poker AI decision making
 * Each model receives the same prompt structure with:
 * - Their private hole cards
 * - Public game state (community cards, pot, bets)
 * - Anonymized opponent information
 */
export async function POST(req: Request) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";

    const body = await req.json();

    // Validate request body with Zod
    const parseResult = RequestBodySchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: parseResult.error.flatten(),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { modelId, context } = parseResult.data;

    // Check rate limits
    const rateLimitResult = await checkAllRateLimits(ip, modelId);
    if (!rateLimitResult.success) {
      return new Response(JSON.stringify({ error: rateLimitResult.error }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate the poker prompt with current game context
    const userPrompt = generatePokerPrompt(context);

    // Stream the AI's thinking and decision
    const result = streamText({
      model: gateway(modelId),
      system: POKER_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 80, // Very brief responses
      temperature: 0.3, // More deterministic for faster decisions
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Poker think error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to stream poker decision" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
