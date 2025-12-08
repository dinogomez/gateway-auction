/**
 * Web Worker for poker odds calculation
 * Runs Monte Carlo simulation off the main thread to prevent UI blocking
 */

import { CardGroup, OddsCalculator } from "@agonyz/poker-odds-calculator";

interface Card {
  suit: "h" | "d" | "c" | "s";
  rank: string;
}

interface WorkerMessage {
  type: "calculate";
  players: Array<{ playerId: string; holeCards: Card[] }>;
  communityCards: Card[];
  requestId: number;
}

interface WorkerResponse {
  type: "result" | "error";
  requestId: number;
  results?: Array<{
    playerId: string;
    winPercentage: number;
    tiePercentage: number;
  }>;
  error?: string;
}

/**
 * Convert our Card type to poker-odds-calculator format
 */
function cardToOddsFormat(card: Card): string {
  const rankMap: Record<string, string> = {
    "10": "T",
    j: "J",
    q: "Q",
    k: "K",
    a: "A",
  };
  const rank = rankMap[card.rank] || card.rank;
  return `${rank}${card.suit}`;
}

function cardsToOddsString(cards: Card[]): string {
  return cards.map(cardToOddsFormat).join("");
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, players, communityCards, requestId } = event.data;

  if (type !== "calculate") return;

  try {
    // Convert player hands to CardGroup format
    const playerHands = players.map((p) => {
      const cardsStr = cardsToOddsString(p.holeCards);
      return CardGroup.fromString(cardsStr);
    });

    // Convert community cards if any
    const board =
      communityCards.length > 0
        ? CardGroup.fromString(cardsToOddsString(communityCards))
        : null;

    // Calculate odds (this is the expensive operation)
    const result = OddsCalculator.calculate(playerHands, board || undefined);

    // Map results to our format
    const results = players.map((player, index) => ({
      playerId: player.playerId,
      winPercentage: result.equities[index]?.getEquity() ?? 0,
      tiePercentage: result.equities[index]?.getTiePercentage() ?? 0,
    }));

    const response: WorkerResponse = {
      type: "result",
      requestId,
      results,
    };

    self.postMessage(response);
  } catch (error) {
    // Return equal odds on error
    const equalOdds = 100 / players.length;
    const results = players.map((p) => ({
      playerId: p.playerId,
      winPercentage: equalOdds,
      tiePercentage: 0,
    }));

    const response: WorkerResponse = {
      type: "error",
      requestId,
      results, // Still return fallback results
      error: error instanceof Error ? error.message : "Unknown error",
    };

    self.postMessage(response);
  }
};
