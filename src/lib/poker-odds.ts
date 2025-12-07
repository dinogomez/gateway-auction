import { CardGroup, OddsCalculator } from "@agonyz/poker-odds-calculator";
import type { Card, EvaluatedHand } from "@/types/poker";

/**
 * Convert our Card type to poker-odds-calculator format
 * Format: {rank}{suit} e.g., "Ah" for Ace of Hearts
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

/**
 * Convert array of cards to string format for the odds calculator
 */
function cardsToOddsString(cards: Card[]): string {
  return cards.map(cardToOddsFormat).join("");
}

export interface PlayerOdds {
  playerId: string;
  winPercentage: number;
  tiePercentage: number;
}

/**
 * Calculate win probabilities for all players
 * Uses Monte Carlo simulation for accurate odds
 */
export function calculateOdds(
  players: Array<{ playerId: string; holeCards: Card[] }>,
  communityCards: Card[],
): PlayerOdds[] {
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

    // Calculate odds
    const result = OddsCalculator.calculate(playerHands, board || undefined);

    // Map results to our format
    return players.map((player, index) => ({
      playerId: player.playerId,
      winPercentage: result.equities[index]?.getEquity() ?? 0,
      tiePercentage: result.equities[index]?.getTiePercentage() ?? 0,
    }));
  } catch (error) {
    console.error("Error calculating odds:", error);
    // Return equal odds on error
    const equalOdds = 100 / players.length;
    return players.map((p) => ({
      playerId: p.playerId,
      winPercentage: equalOdds,
      tiePercentage: 0,
    }));
  }
}

/**
 * Get a descriptive string for hand strength
 */
export function getHandStrengthLabel(winPercentage: number): string {
  if (winPercentage >= 80) return "Dominant";
  if (winPercentage >= 60) return "Strong";
  if (winPercentage >= 40) return "Competitive";
  if (winPercentage >= 25) return "Underdog";
  return "Weak";
}

/**
 * Get color class for win percentage
 */
export function getOddsColorClass(winPercentage: number): string {
  if (winPercentage >= 70) return "text-green-400";
  if (winPercentage >= 50) return "text-yellow-400";
  if (winPercentage >= 30) return "text-orange-400";
  return "text-red-400";
}
