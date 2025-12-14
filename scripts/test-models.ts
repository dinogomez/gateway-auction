/**
 * Test script for multiple models' structured output capability
 * Run with: npx tsx scripts/test-models.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local file
const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  }
} catch (e) {
  console.log("Warning: Could not load .env.local");
}

import { gateway, type GatewayProviderOptions } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { z } from "zod";

// Same schema used in the poker game
const PokerActionSchema = z.object({
  reasoning: z.string().max(300).describe("Brief reasoning (max 300 chars)"),
  action: z.enum(["fold", "check", "call", "raise"]),
  amount: z.number().optional().describe("For raise only"),
});

const POKER_SYSTEM_PROMPT = `You are an expert poker player. Key concepts:
- Opponents cannot see your cards - your betting tells a story
- Raising can win the pot immediately if opponents fold (fold equity)
- Consider pot odds, position advantage, and opponent tendencies`;

const TEST_PROMPT = `Texas Hold'em. Hand 5/20, preflop, blinds 10/20
Position: Button
Stacks: SONNET:980(Y) GROK:1020
Cards: Ah Kd | Board: -
Pot: 30, Your chips: 980
Actions: call 20, raise 40-980, fold
Decide action.`;

const MODELS_TO_TEST = [
  {
    id: "deepseek/deepseek-v3.2",
  },
  // {
  //   id: "alibaba/qwen-3-235b",
  //   providerOrder: ["baseten", "deepinfra"],
  // },
  // {
  //   id: "meta/llama-4-maverick",
  // },
  // {
  //   id: "meta/llama-4-scout",
  // },
];

type ModelConfig = {
  id: string;
  providerOrder?: string[];
};

async function testModel(config: ModelConfig): Promise<void> {
  const { id: modelId, providerOrder } = config;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${modelId}`);
  if (providerOrder) {
    console.log(`Provider order: ${providerOrder.join(" → ")}`);
  }
  console.log("=".repeat(60));

  const startTime = Date.now();

  try {
    const result = await generateObject({
      model: gateway(modelId),
      system: POKER_SYSTEM_PROMPT,
      schema: PokerActionSchema,
      schemaName: "PokerAction",
      schemaDescription: "A poker action decision with reasoning",
      prompt: TEST_PROMPT,
      providerOptions: providerOrder
        ? { gateway: { order: providerOrder } satisfies GatewayProviderOptions }
        : undefined,
    });

    const elapsed = Date.now() - startTime;

    console.log("✅ SUCCESS!");
    console.log("Response:", JSON.stringify(result.object, null, 2));
    console.log(
      `Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`
    );
    console.log(`Time: ${elapsed}ms`);

    const responseBody = result.response?.body as any;
    const cost = responseBody?.providerMetadata?.gateway?.cost;
    if (cost) {
      console.log(`Cost: $${parseFloat(cost).toFixed(7)}`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.log("❌ FAILED!");
    console.log("Error:", error.message?.slice(0, 100));

    if (error.text) {
      console.log("Raw text:", error.text.slice(0, 200));
    }

    console.log(`Time: ${elapsed}ms`);
  }
}

async function main() {
  console.log("Testing multiple models for structured output capability...\n");
  console.log("Test prompt:", TEST_PROMPT);

  for (const config of MODELS_TO_TEST) {
    await testModel(config);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Testing complete!");
}

main().catch(console.error);
