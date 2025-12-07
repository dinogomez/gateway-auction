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
      system: `You summarize poker player thinking into a single brief sentence (max 15 words).
Focus on the KEY REASON for their decision, not the action itself.
Examples:
- "Weak hand with bad position, not worth the risk"
- "Strong pocket pair, building the pot early"
- "Good pot odds with flush draw potential"
- "Opponent likely bluffing based on betting pattern"
Do NOT mention the action (fold/call/raise) - just the reasoning.
Be concise and natural sounding.`,
      prompt: `Summarize this poker thinking in one brief sentence:\n\n${thinking.slice(0, 1000)}`,
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
