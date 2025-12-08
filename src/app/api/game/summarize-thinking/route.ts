import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";

/**
 * POST /api/game/summarize-thinking
 *
 * Uses a fast model to summarize AI poker thinking into a brief sentence
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { thinking, action } = body as {
      thinking: string;
      action?: string;
    };

    if (!thinking) {
      return new Response(JSON.stringify({ error: "Missing thinking text" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use GPT-4o-mini for fast, cheap summarization
    const result = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      system: `You summarize WHY a poker player chose their specific action in one brief sentence (max 15 words).
The player's ACTUAL action is provided - explain the reasoning that led to THAT action.
Focus on the KEY REASON for their decision.
Examples for FOLD:
- "Weak hand not worth the investment"
- "Too risky against aggressive betting"
- "Poor odds with marginal holdings"
Examples for CALL:
- "Good pot odds with draw potential"
- "Keeping opponent honest"
Examples for RAISE:
- "Strong hand, building the pot"
- "Applying pressure with position advantage"
Do NOT mention the action itself - just the reasoning.
Be concise and natural sounding.`,
      prompt: `The player chose to ${action?.toUpperCase() || "act"}. Summarize WHY in one brief sentence:\n\n${thinking.slice(0, 1000)}`,
      maxOutputTokens: 50,
      temperature: 0.3,
    });

    return new Response(JSON.stringify({ summary: result.text.trim() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Summarize thinking error:", error);
    // Return a fallback on error
    return new Response(
      JSON.stringify({ summary: "Analyzing the situation..." }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
