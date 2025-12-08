/**
 * Poker-specific prompts for AI agent decision making
 */

import type { Card, PokerAction, PokerAgentContext } from "@/types/poker";
import { RANK_NAMES } from "@/types/poker";
import { cardsToString } from "./cards";

/**
 * System prompt for poker AI agents - kept brief for fast responses
 */
export const POKER_SYSTEM_PROMPT = `Texas Hold'em. Be VERY brief (1 sentence).

Rankings: Royal Flush > Straight Flush > 4-Kind > Full House > Flush > Straight > 3-Kind > Two Pair > Pair > High

One short reason, then: ACTION: FOLD|CHECK|CALL|RAISE $X|ALL-IN`;

/**
 * Generate the user prompt for a poker decision
 */
export function generatePokerPrompt(context: PokerAgentContext): string {
  const {
    holeCards,
    communityCards,
    currentPhase,
    potSize,
    currentBet,
    minRaise,
    ownChipStack,
    ownCurrentBet,
    amountToCall,
    position,
    isDealer,
    playersToActAfterMe,
    opponents,
    bettingHistory,
    handNumber,
    totalHands,
  } = context;

  // Format hole cards
  const holeCardsStr = cardsToString(holeCards);

  // Format community cards
  const communityStr =
    communityCards.length > 0
      ? cardsToString(communityCards)
      : "None yet (Pre-flop)";

  // Format phase
  const phaseNames: Record<string, string> = {
    preflop: "Pre-Flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
  };
  const phaseName = phaseNames[currentPhase] || currentPhase;

  // Format opponents with position info
  const opponentLines = opponents
    .filter((o) => o.status !== "folded")
    .map(
      (o) =>
        `${o.label}: $${o.chipStack.toLocaleString()}${o.position !== "unknown" ? ` (${o.position})` : ""}, bet $${o.currentBet.toLocaleString()}, ${o.status}${o.hasActed ? " ✓" : ""}`,
    )
    .join(" | ");

  // Format folded opponents separately (brief)
  const foldedOpponents = opponents.filter((o) => o.status === "folded");
  const foldedLine =
    foldedOpponents.length > 0
      ? `Folded: ${foldedOpponents.map((o) => o.label).join(", ")}`
      : "";

  // Format betting history for this phase
  const phaseHistory = bettingHistory.filter((h) => h.phase === currentPhase);
  const historyLines =
    phaseHistory.length > 0
      ? phaseHistory
          .map(
            (h) =>
              `${h.label}: ${h.action.toUpperCase()}${h.amount ? ` $${h.amount.toLocaleString()}` : ""}`,
          )
          .join(" → ")
      : "No actions yet";

  // Available actions
  let actionsAvailable = "FOLD";
  if (amountToCall === 0) {
    actionsAvailable += ", CHECK";
  }
  if (amountToCall > 0 && amountToCall < ownChipStack) {
    actionsAvailable += `, CALL ($${amountToCall.toLocaleString()})`;
  }
  if (ownChipStack > amountToCall) {
    actionsAvailable += `, RAISE ($${minRaise.toLocaleString()} minimum)`;
  }
  actionsAvailable += ", ALL-IN";

  // Build prompt with all relevant info
  let prompt = `Hand ${handNumber}/${totalHands} - ${phaseName}

Cards: ${holeCardsStr} | Board: ${communityStr}
Pot: $${potSize} | To Call: $${amountToCall} | Stack: $${ownChipStack}
Position: ${position}${isDealer ? " (D)" : ""} | ${playersToActAfterMe} after you

Opponents: ${opponentLines}`;

  if (foldedLine) {
    prompt += `\n${foldedLine}`;
  }

  prompt += `\n\nThis round: ${historyLines}

Actions: ${actionsAvailable}

Decide.`;

  return prompt;
}

/**
 * Parse poker action from AI response text
 */
export function parsePokerAction(
  text: string,
  context: {
    currentBet: number;
    ownBet: number;
    minRaise: number;
    chipStack: number;
  },
): PokerAction | null {
  // Look for ACTION: pattern
  const actionMatch = text.match(
    /ACTION:\s*(FOLD|CHECK|CALL|RAISE\s*\$?([\d,]+)|ALL[- ]?IN)/i,
  );

  if (!actionMatch) return null;

  const actionText = actionMatch[1].toUpperCase().replace(/\s+/g, " ");

  if (actionText === "FOLD") {
    return { type: "fold" };
  }

  if (actionText === "CHECK") {
    // Can only check if no bet to match
    if (context.currentBet <= context.ownBet) {
      return { type: "check" };
    }
    // If can't check, treat as call with amount
    const callAmount = Math.min(
      context.currentBet - context.ownBet,
      context.chipStack,
    );
    return { type: "call", amount: callAmount };
  }

  if (actionText === "CALL") {
    // Include the call amount (what player needs to add to match current bet)
    const callAmount = Math.min(
      context.currentBet - context.ownBet,
      context.chipStack,
    );
    return { type: "call", amount: callAmount };
  }

  if (actionText.startsWith("RAISE")) {
    const amountStr = actionMatch[2]?.replace(/,/g, "") || "0";
    let amount = parseInt(amountStr, 10);

    // Ensure raise is at least minimum
    if (amount < context.minRaise) {
      amount = context.minRaise;
    }

    // Cap at all-in
    const maxBet = context.ownBet + context.chipStack;
    if (amount >= maxBet) {
      return { type: "all-in" };
    }

    return { type: "raise", amount };
  }

  if (actionText.includes("ALL") && actionText.includes("IN")) {
    return { type: "all-in" };
  }

  return null;
}

/**
 * Generate a brief summary of hole cards for display
 */
export function describeHoleCards(cards: Card[]): string {
  if (cards.length !== 2) return "Unknown";

  const [c1, c2] = cards;
  const isPair = c1.rank === c2.rank;
  const isSuited = c1.suit === c2.suit;

  if (isPair) {
    return `Pocket ${RANK_NAMES[c1.rank]}s`;
  }

  const ranks = [c1.rank, c2.rank]
    .sort((a, b) => {
      const values: Record<string, number> = {
        a: 14,
        k: 13,
        q: 12,
        j: 11,
        "10": 10,
      };
      return (values[b] || parseInt(b)) - (values[a] || parseInt(a));
    })
    .map((r) => RANK_NAMES[r as keyof typeof RANK_NAMES]);

  return `${ranks[0]}-${ranks[1]}${isSuited ? " suited" : " offsuit"}`;
}

/**
 * Describe hand strength in words
 */
export function describeHandStrength(
  holeCards: Card[],
  communityCards: Card[],
): string {
  // Pre-flop
  if (communityCards.length === 0) {
    return describeHoleCards(holeCards);
  }

  // Post-flop - would need hand evaluation
  return "Evaluating...";
}

/**
 * Anonymize opponents for prompts
 */
export function anonymizeOpponents(
  players: Array<{ id: string; name: string }>,
  currentPlayerId: string,
  playerStates: Record<
    string,
    { chipStack: number; currentBet: number; status: string; hasActed: boolean }
  >,
): Array<{
  label: string;
  chipStack: number;
  currentBet: number;
  status: string;
  position: string;
  hasActed: boolean;
}> {
  const others = players.filter((p) => p.id !== currentPlayerId);
  return others.map((p, i) => ({
    label: `Opponent ${String.fromCharCode(65 + i)}`,
    chipStack: playerStates[p.id]?.chipStack ?? 0,
    currentBet: playerStates[p.id]?.currentBet ?? 0,
    status: playerStates[p.id]?.status ?? "unknown",
    position: "unknown",
    hasActed: playerStates[p.id]?.hasActed ?? false,
  }));
}
