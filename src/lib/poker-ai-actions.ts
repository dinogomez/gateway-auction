"use server";

import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { PokerAction, Card } from "@/types/poker";
import { cardToString } from "./cards";

/**
 * Generate poker commentary for exciting moments
 */
export async function generatePokerCommentary(
  trigger: string,
  playerName: string,
  context?: {
    potSize?: number;
    raiseAmount?: number;
    handDescription?: string;
  },
): Promise<string> {
  const COMMENTARY_PROMPTS: Record<string, string> = {
    big_raise: `Generate a 12-word dramatic poker announcement for a big raise. Player: ${playerName}. Pot: $${context?.potSize?.toLocaleString() || 0}. Raise: $${context?.raiseAmount?.toLocaleString() || 0}. Be intense!`,
    all_in: `Generate a 12-word dramatic poker announcement for an ALL-IN move. Player: ${playerName}. Be dramatic and tense!`,
    bluff_detected: `Generate a 12-word suspicious announcement about a possible bluff. Player: ${playerName}. Be intrigued!`,
    big_fold: `Generate a 12-word surprising announcement about a big fold under pressure. Player: ${playerName}. Be dramatic!`,
    slow_play: `Generate a 12-word crafty announcement about someone checking with a strong hand. Player: ${playerName}. Be impressed!`,
    comeback: `Generate a 12-word triumphant announcement about a player recovering chips. Player: ${playerName}. Be uplifting!`,
    monster_hand: `Generate a 12-word awed announcement about revealing a monster hand. Player: ${playerName}. Hand: ${context?.handDescription || "incredible"}. Be amazed!`,
    bad_beat: `Generate a 12-word sympathetic announcement about a bad beat. Player: ${playerName}. Be dramatic!`,
    heads_up: `Generate a 12-word tense announcement about heads-up play. Be suspenseful!`,
    final_table: `Generate a 12-word exciting announcement about reaching the final showdown. Be epic!`,
  };

  const prompt = COMMENTARY_PROMPTS[trigger];
  if (!prompt) {
    return `${playerName} makes a move!`;
  }

  try {
    const { text } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      prompt,
      maxOutputTokens: 50,
      temperature: 0.9,
    });

    const cleaned = text
      .replace(/^["']|["']$/g, "")
      .replace(/^(Here'?s?|Output|Response):\s*/i, "")
      .trim();

    if (cleaned.length > 120 || cleaned.length < 10) {
      return getFallbackPokerCommentary(trigger, playerName);
    }

    return cleaned;
  } catch (error) {
    console.error("Poker commentary error:", error);
    return getFallbackPokerCommentary(trigger, playerName);
  }
}

function getFallbackPokerCommentary(trigger: string, name: string): string {
  const fallbacks: Record<string, string> = {
    big_raise: `POWER MOVE: ${name} fires a massive raise into the pot!`,
    all_in: `ALL IN: ${name} pushes everything to the middle! The tension is electric!`,
    bluff_detected: `SUSPICIOUS: Is ${name} running a bluff here? The stakes are high!`,
    big_fold: `DISCIPLINE: ${name} makes the tough laydown. Living to fight another hand.`,
    slow_play: `CRAFTY: ${name} checks with a monster! The trap is set.`,
    comeback: `REDEMPTION: ${name} is mounting an incredible comeback at this table!`,
    monster_hand: `MONSTER: ${name} reveals an absolute crusher! What a hand!`,
    bad_beat: `BAD BEAT: ${name} had it locked up but the poker gods had other plans!`,
    heads_up: `HEADS UP: Two players remain. This is where legends are made!`,
    final_table: `SHOWDOWN: The cards are about to hit the felt. Who takes it all?`,
  };
  return fallbacks[trigger] || `${name} is in the zone!`;
}

/**
 * Analyze a player's poker playing style
 */
export interface PokerPlayerAnalysis {
  playStyle: string;
  aggression: "passive" | "neutral" | "aggressive" | "maniac";
  tightness: "loose" | "neutral" | "tight" | "nit";
  bluffFrequency: string;
  insight: string;
}

export async function analyzePokerPlayer(stats: {
  name: string;
  handsPlayed: number;
  vpip: number; // Voluntarily put money in pot %
  pfr: number; // Pre-flop raise %
  aggFactor: number;
  showdownWinRate: number;
  foldToThreeBet: number;
  cBetPercent: number;
}): Promise<PokerPlayerAnalysis> {
  try {
    const prompt = `Analyze this poker player's style based on statistics:

Player: ${stats.name}
Hands Played: ${stats.handsPlayed}
VPIP: ${(stats.vpip * 100).toFixed(0)}%
PFR: ${(stats.pfr * 100).toFixed(0)}%
Aggression Factor: ${stats.aggFactor.toFixed(1)}
Showdown Win Rate: ${(stats.showdownWinRate * 100).toFixed(0)}%
Fold to 3-Bet: ${(stats.foldToThreeBet * 100).toFixed(0)}%
C-Bet: ${(stats.cBetPercent * 100).toFixed(0)}%

Return ONLY valid JSON (no markdown):
{"playStyle":"TAG","aggression":"aggressive","tightness":"tight","bluffFrequency":"selective","insight":"Two sentence analysis of this player's tendencies and how to exploit them."}

Rules:
- playStyle: 3-5 words describing overall approach (e.g., "Tight Aggressive Pro", "Loose Passive Fish")
- aggression: passive/neutral/aggressive/maniac
- tightness: loose/neutral/tight/nit
- bluffFrequency: rarely/selective/often/constantly
- insight: 2 sentences about tendencies and counter-strategy`;

    const { text } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      prompt,
      maxOutputTokens: 150,
      temperature: 0.7,
    });

    const cleanContent = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      const parsed = JSON.parse(cleanContent);
      return {
        playStyle: parsed.playStyle || "Unknown Style",
        aggression: parsed.aggression || "neutral",
        tightness: parsed.tightness || "neutral",
        bluffFrequency: parsed.bluffFrequency || "unknown",
        insight: parsed.insight || "Not enough data to analyze.",
      };
    } catch {
      return getDefaultPokerAnalysis(stats);
    }
  } catch (error) {
    console.error("Poker analysis error:", error);
    return getDefaultPokerAnalysis(stats);
  }
}

function getDefaultPokerAnalysis(stats: {
  vpip: number;
  pfr: number;
  aggFactor: number;
}): PokerPlayerAnalysis {
  const isLoose = stats.vpip > 0.3;
  const isTight = stats.vpip < 0.2;
  const isAggressive = stats.aggFactor > 2;
  const isPassive = stats.aggFactor < 1;

  let playStyle = "Balanced Player";
  let aggression: PokerPlayerAnalysis["aggression"] = "neutral";
  let tightness: PokerPlayerAnalysis["tightness"] = "neutral";

  if (isTight && isAggressive) {
    playStyle = "Tight Aggressive";
    tightness = "tight";
    aggression = "aggressive";
  } else if (isLoose && isAggressive) {
    playStyle = "Loose Aggressive";
    tightness = "loose";
    aggression = "aggressive";
  } else if (isTight && isPassive) {
    playStyle = "Tight Passive";
    tightness = "tight";
    aggression = "passive";
  } else if (isLoose && isPassive) {
    playStyle = "Loose Passive";
    tightness = "loose";
    aggression = "passive";
  }

  return {
    playStyle,
    aggression,
    tightness,
    bluffFrequency: isAggressive ? "often" : "selective",
    insight: `This player shows ${playStyle.toLowerCase()} tendencies. Adjust your strategy accordingly.`,
  };
}

/**
 * Extract key insights from AI thinking for display
 */
export async function extractPokerThought(
  thinking: string,
  action: PokerAction,
): Promise<string[]> {
  if (!thinking || thinking.length < 50) {
    return getDefaultThoughts(action);
  }

  try {
    const { text } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      prompt: `Extract 2 key insights from this poker player's reasoning. Be concise (under 60 chars each).

1. Their read on the situation
2. Why they chose to ${action.type}${action.amount ? ` $${action.amount}` : ""}

Write in third person. No bullets, just 2 lines:

${thinking.slice(0, 1500)}`,
      maxOutputTokens: 100,
      temperature: 0.3,
    });

    const lines = text
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && l.length < 80)
      .slice(0, 2);

    return lines.length > 0 ? lines : getDefaultThoughts(action);
  } catch (error) {
    console.error("Thought extraction error:", error);
    return getDefaultThoughts(action);
  }
}

function getDefaultThoughts(action: PokerAction): string[] {
  const actionThoughts: Record<string, string[]> = {
    fold: [
      "Determined the risk wasn't worth the reward.",
      "Chose to preserve chips for a better spot.",
    ],
    check: [
      "Decided to see another card for free.",
      "Keeping options open with a check.",
    ],
    call: [
      "The pot odds justified the call.",
      "Staying in to see what develops.",
    ],
    raise: [
      "Saw value in building the pot.",
      "Applied pressure with a confident raise.",
    ],
    "all-in": [
      "Put everything on the line.",
      "Maximum commitment to this hand.",
    ],
  };

  return (
    actionThoughts[action.type] || [
      "Made a calculated decision.",
      "Executed the planned strategy.",
    ]
  );
}

/**
 * Generate hand summary for showdown
 */
export async function generateShowdownSummary(
  winners: Array<{ name: string; hand: string; winnings: number }>,
  losers: Array<{ name: string; hand: string }>,
  potSize: number,
): Promise<string> {
  if (winners.length === 0) {
    return "The hand ended without a showdown.";
  }

  try {
    const winnerText = winners
      .map((w) => `${w.name} (${w.hand}, won $${w.winnings.toLocaleString()})`)
      .join(", ");
    const loserText =
      losers.length > 0
        ? losers.map((l) => `${l.name} (${l.hand})`).join(", ")
        : "all others folded";

    const { text } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      prompt: `Write a 15-word dramatic poker hand summary.
Winner(s): ${winnerText}
Lost to: ${loserText}
Pot: $${potSize.toLocaleString()}

Be dramatic and exciting, like a poker broadcast!`,
      maxOutputTokens: 50,
      temperature: 0.9,
    });

    const cleaned = text.replace(/^["']|["']$/g, "").trim();

    return (
      cleaned ||
      `${winners[0].name} takes down the $${potSize.toLocaleString()} pot!`
    );
  } catch (error) {
    console.error("Showdown summary error:", error);
    return `${winners[0].name} wins $${potSize.toLocaleString()} with ${winners[0].hand}!`;
  }
}

/**
 * Analyze overall game behavior for end-game stats
 */
export async function analyzeGameBehavior(
  playerStats: Array<{
    name: string;
    handsWon: number;
    totalProfit: number;
    vpip: number;
    aggFactor: number;
    biggestPot: number;
  }>,
): Promise<string[]> {
  if (playerStats.length < 2) {
    return [];
  }

  const statsText = playerStats
    .map(
      (p) => `${p.name}:
  - Hands Won: ${p.handsWon}
  - Profit: $${p.totalProfit.toLocaleString()}
  - VPIP: ${(p.vpip * 100).toFixed(0)}%
  - Aggression: ${p.aggFactor.toFixed(1)}
  - Biggest Pot: $${p.biggestPot.toLocaleString()}`,
    )
    .join("\n\n");

  try {
    const { text } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      prompt: `Compare these AI poker players' performance:

${statsText}

Generate exactly 3 insights in bullet format, each under 70 characters:
- "[Name] showed X% more [behavior] than [Name]"
- "[Name] was most [specific tendency]"
- "[Name] vs [Name]: [comparative insight]"`,
      maxOutputTokens: 200,
      temperature: 0.7,
    });

    const insights = text
      .split("\n")
      .map((line: string) => line.replace(/^[-•*]\s*/, "").trim())
      .filter((line: string) => line.length > 10 && line.length < 100)
      .slice(0, 3);

    return insights;
  } catch (error) {
    console.error("Behavior analysis error:", error);
    return [];
  }
}
