/**
 * Test script for Meta Llama 3.1 70B structured output
 * Run with: npx tsx scripts/test-llama.ts
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

import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";
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
- Opponent stats: VPIP=loose/tight, PFR=passive/aggressive, Agg=betting frequency
- Consider pot odds, position advantage, and opponent tendencies
- Balance your play - be unpredictable`;

const TEST_PROMPT = `Texas Hold'em. Hand 5/20, preflop, blinds 10/20
Position: Button (best position)
Stacks: SONNET:980(Y) GROK:1020
Cards: Ah Kd | Board: -
Pot: 30, Your chips: 980
Actions: call 20, raise 40-980, fold
Decide action.`;

async function testLlama() {
  console.log("Testing Meta Llama 3.1 70B structured output...\n");
  console.log("Model: meta/llama-3.1-70b");
  console.log("Prompt:", TEST_PROMPT);
  console.log("\n" + "=".repeat(50) + "\n");

  const startTime = Date.now();

  try {
    const result = await generateObject({
      model: gateway("meta/llama-3.1-70b"),
      system: POKER_SYSTEM_PROMPT,
      schema: PokerActionSchema,
      schemaName: "PokerAction",
      schemaDescription: "A poker action decision with reasoning",
      prompt: TEST_PROMPT,
    });

    const elapsed = Date.now() - startTime;

    console.log("✅ SUCCESS!\n");
    console.log("Response:");
    console.log(JSON.stringify(result.object, null, 2));
    console.log("\nToken Usage:");
    console.log(`  Input: ${result.usage.inputTokens}`);
    console.log(`  Output: ${result.usage.outputTokens}`);
    console.log(`\nTime: ${elapsed}ms`);

    // Check for cost in response
    const responseBody = result.response?.body as any;
    const gatewayMetadata = responseBody?.providerMetadata?.gateway;
    if (gatewayMetadata?.cost) {
      console.log(`Cost: $${parseFloat(gatewayMetadata.cost).toFixed(7)}`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.log("❌ FAILED!\n");
    console.log("Error:", error.message);

    if (error.text) {
      console.log("\nRaw text from model:");
      console.log(error.text.slice(0, 1000));
    }

    if (error.cause?.value) {
      console.log("\nParsed value (malformed):");
      console.log(JSON.stringify(error.cause.value, null, 2));
    }

    console.log(`\nTime: ${elapsed}ms`);
  }
}

// Run the test
testLlama().catch(console.error);
