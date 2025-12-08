import type { Card, Rank, Suit, EvaluatedHand } from "@/types/poker";
import {
  HandRank,
  HAND_RANK_NAMES,
  RANK_VALUES,
  RANK_NAMES,
} from "@/types/poker";
import {
  sortCardsByRank,
  groupBySuit,
  countRanks,
  hasFlush,
  findStraight,
} from "./cards";

/**
 * Generate all 5-card combinations from a set of cards
 */
function* combinations(cards: Card[], size: number): Generator<Card[]> {
  if (size === 0) {
    yield [];
    return;
  }
  if (cards.length < size) return;

  const [first, ...rest] = cards;

  // Include first card
  for (const combo of combinations(rest, size - 1)) {
    yield [first, ...combo];
  }
  // Exclude first card
  yield* combinations(rest, size);
}

/**
 * Evaluate a 5-card hand
 */
function evaluate5Cards(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error("Must provide exactly 5 cards");
  }

  const sorted = sortCardsByRank(cards);
  const rankCounts = countRanks(sorted);
  const flushSuit = hasFlush(sorted);
  const straightHigh = findStraight(sorted);

  // Check for flush
  const isFlush = flushSuit !== null;

  // Check for straight
  const isStraight = straightHigh !== null;

  // Get rank count distribution
  const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);

  // Royal Flush: A-K-Q-J-10 all same suit
  if (isFlush && isStraight && straightHigh === "a") {
    return {
      rank: HandRank.ROYAL_FLUSH,
      rankName: HAND_RANK_NAMES[HandRank.ROYAL_FLUSH],
      cards: sorted,
      kickers: [],
      score: calculateScore(HandRank.ROYAL_FLUSH, sorted),
      description: "Royal Flush",
    };
  }

  // Straight Flush (check straightHigh directly for type narrowing)
  if (isFlush && straightHigh !== null) {
    return {
      rank: HandRank.STRAIGHT_FLUSH,
      rankName: HAND_RANK_NAMES[HandRank.STRAIGHT_FLUSH],
      cards: sorted,
      kickers: [],
      score: calculateScore(HandRank.STRAIGHT_FLUSH, sorted, straightHigh),
      description: `Straight Flush, ${RANK_NAMES[straightHigh]} high`,
    };
  }

  // Four of a Kind
  if (counts[0] === 4) {
    const quadRank = findRankWithCount(rankCounts, 4);
    const quads = sorted.filter((c) => c.rank === quadRank);
    const kicker = sorted.find((c) => c.rank !== quadRank);
    if (!kicker) {
      throw new Error("Invalid hand: no kicker found for four of a kind");
    }
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      rankName: HAND_RANK_NAMES[HandRank.FOUR_OF_A_KIND],
      cards: [...quads, kicker],
      kickers: [kicker],
      score: calculateScore(HandRank.FOUR_OF_A_KIND, sorted, quadRank),
      description: `Four of a Kind, ${RANK_NAMES[quadRank]}s`,
    };
  }

  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    const tripRank = findRankWithCount(rankCounts, 3);
    const pairRank = findRankWithCount(rankCounts, 2);
    const trips = sorted.filter((c) => c.rank === tripRank);
    const pair = sorted.filter((c) => c.rank === pairRank);
    return {
      rank: HandRank.FULL_HOUSE,
      rankName: HAND_RANK_NAMES[HandRank.FULL_HOUSE],
      cards: [...trips, ...pair],
      kickers: [],
      score: calculateScore(HandRank.FULL_HOUSE, sorted, tripRank, pairRank),
      description: `Full House, ${RANK_NAMES[tripRank]}s over ${RANK_NAMES[pairRank]}s`,
    };
  }

  // Flush
  if (isFlush) {
    return {
      rank: HandRank.FLUSH,
      rankName: HAND_RANK_NAMES[HandRank.FLUSH],
      cards: sorted,
      kickers: [],
      score: calculateScore(HandRank.FLUSH, sorted),
      description: `Flush, ${RANK_NAMES[sorted[0].rank]} high`,
    };
  }

  // Straight (check straightHigh directly for type narrowing)
  if (straightHigh !== null) {
    return {
      rank: HandRank.STRAIGHT,
      rankName: HAND_RANK_NAMES[HandRank.STRAIGHT],
      cards: sorted,
      kickers: [],
      score: calculateScore(HandRank.STRAIGHT, sorted, straightHigh),
      description: `Straight, ${RANK_NAMES[straightHigh]} high`,
    };
  }

  // Three of a Kind
  if (counts[0] === 3) {
    const tripRank = findRankWithCount(rankCounts, 3);
    const trips = sorted.filter((c) => c.rank === tripRank);
    const kickers = sorted.filter((c) => c.rank !== tripRank);
    return {
      rank: HandRank.THREE_OF_A_KIND,
      rankName: HAND_RANK_NAMES[HandRank.THREE_OF_A_KIND],
      cards: [...trips, ...kickers],
      kickers,
      score: calculateScore(HandRank.THREE_OF_A_KIND, sorted, tripRank),
      description: `Three of a Kind, ${RANK_NAMES[tripRank]}s`,
    };
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    const pairRanks = findRanksWithCount(rankCounts, 2).sort(
      (a, b) => RANK_VALUES[b] - RANK_VALUES[a],
    );
    const highPair = sorted.filter((c) => c.rank === pairRanks[0]);
    const lowPair = sorted.filter((c) => c.rank === pairRanks[1]);
    const kicker = sorted.find(
      (c) => c.rank !== pairRanks[0] && c.rank !== pairRanks[1],
    );
    if (!kicker) {
      throw new Error("Invalid hand: no kicker found for two pair");
    }
    return {
      rank: HandRank.TWO_PAIR,
      rankName: HAND_RANK_NAMES[HandRank.TWO_PAIR],
      cards: [...highPair, ...lowPair, kicker],
      kickers: [kicker],
      score: calculateScore(
        HandRank.TWO_PAIR,
        sorted,
        pairRanks[0],
        pairRanks[1],
      ),
      description: `Two Pair, ${RANK_NAMES[pairRanks[0]]}s and ${RANK_NAMES[pairRanks[1]]}s`,
    };
  }

  // Pair
  if (counts[0] === 2) {
    const pairRank = findRankWithCount(rankCounts, 2);
    const pair = sorted.filter((c) => c.rank === pairRank);
    const kickers = sorted.filter((c) => c.rank !== pairRank);
    return {
      rank: HandRank.PAIR,
      rankName: HAND_RANK_NAMES[HandRank.PAIR],
      cards: [...pair, ...kickers],
      kickers,
      score: calculateScore(HandRank.PAIR, sorted, pairRank),
      description: `Pair of ${RANK_NAMES[pairRank]}s`,
    };
  }

  // High Card
  return {
    rank: HandRank.HIGH_CARD,
    rankName: HAND_RANK_NAMES[HandRank.HIGH_CARD],
    cards: sorted,
    kickers: sorted.slice(1),
    score: calculateScore(HandRank.HIGH_CARD, sorted),
    description: `${RANK_NAMES[sorted[0].rank]} high`,
  };
}

/**
 * Find rank with specific count
 */
function findRankWithCount(counts: Map<Rank, number>, count: number): Rank {
  for (const [rank, c] of counts) {
    if (c === count) return rank;
  }
  throw new Error(`No rank with count ${count}`);
}

/**
 * Find all ranks with specific count
 */
function findRanksWithCount(counts: Map<Rank, number>, count: number): Rank[] {
  const ranks: Rank[] = [];
  for (const [rank, c] of counts) {
    if (c === count) ranks.push(rank);
  }
  return ranks;
}

/**
 * Calculate numeric score for hand comparison
 * Higher score = better hand
 *
 * Score breakdown (32-bit integer):
 * - Bits 28-31: Hand rank (1-10)
 * - Bits 20-27: Primary rank value
 * - Bits 12-19: Secondary rank value (for full house, two pair)
 * - Bits 0-11: Kicker values (3 kickers * 4 bits each)
 */
function calculateScore(
  handRank: HandRank,
  cards: Card[],
  primaryRank?: Rank,
  secondaryRank?: Rank,
): number {
  let score = handRank * 100000000;

  // Add primary rank value
  if (primaryRank) {
    score += RANK_VALUES[primaryRank] * 1000000;
  } else if (
    handRank === HandRank.FLUSH ||
    handRank === HandRank.HIGH_CARD ||
    handRank === HandRank.ROYAL_FLUSH
  ) {
    // For flush/high card, use highest card
    const sorted = sortCardsByRank(cards);
    score += RANK_VALUES[sorted[0].rank] * 1000000;
  }

  // Add secondary rank value
  if (secondaryRank) {
    score += RANK_VALUES[secondaryRank] * 10000;
  }

  // Add kicker values
  const sorted = sortCardsByRank(cards);
  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    score += RANK_VALUES[sorted[i].rank] * Math.pow(15, 4 - i);
  }

  return score;
}

/**
 * Evaluate best 5-card hand from 7 cards (2 hole + 5 community)
 */
export function evaluateHand(
  holeCards: Card[],
  communityCards: Card[],
): EvaluatedHand {
  if (holeCards.length !== 2) {
    throw new Error("Must provide exactly 2 hole cards");
  }
  if (communityCards.length < 3 || communityCards.length > 5) {
    throw new Error("Must provide 3-5 community cards");
  }

  const allCards = [...holeCards, ...communityCards];
  let bestHand: EvaluatedHand | null = null;

  // Try all 5-card combinations
  for (const combo of combinations(allCards, 5)) {
    const hand = evaluate5Cards(combo);
    if (!bestHand || hand.score > bestHand.score) {
      bestHand = hand;
    }
  }

  if (!bestHand) {
    throw new Error(
      "Failed to evaluate hand: no valid 5-card combination found",
    );
  }
  return bestHand;
}

/**
 * Compare two evaluated hands
 * Returns: negative if hand1 < hand2, positive if hand1 > hand2, 0 if equal
 */
export function compareHands(
  hand1: EvaluatedHand,
  hand2: EvaluatedHand,
): number {
  return hand1.score - hand2.score;
}

/**
 * Determine winners from showdown
 * Returns array of player IDs (can be multiple for split pot)
 */
export function determineWinners(
  playerHands: Array<{ playerId: string; hand: EvaluatedHand }>,
): string[] {
  if (playerHands.length === 0) return [];
  if (playerHands.length === 1) return [playerHands[0].playerId];

  // Sort by hand score (highest first)
  const sorted = [...playerHands].sort((a, b) => b.hand.score - a.hand.score);

  // Find all players with the highest score (handles ties)
  const highestScore = sorted[0].hand.score;
  const winners = sorted
    .filter((p) => p.hand.score === highestScore)
    .map((p) => p.playerId);

  return winners;
}

/**
 * Evaluate hand strength as a percentage (0-100)
 * Useful for AI decision making
 */
export function evaluateHandStrength(
  holeCards: Card[],
  communityCards: Card[],
): number {
  const hand = evaluateHand(holeCards, communityCards);

  // Base strength from hand rank (0-90 points)
  const rankStrength = (hand.rank / 10) * 90;

  // Additional strength from high cards (0-10 points)
  const highCardValue = RANK_VALUES[hand.cards[0].rank];
  const highCardStrength = (highCardValue / 14) * 10;

  return Math.min(100, rankStrength + highCardStrength);
}

/**
 * Get a readable description of hand odds
 */
export function describeHandOdds(
  holeCards: Card[],
  communityCards: Card[],
): string {
  const strength = evaluateHandStrength(holeCards, communityCards);

  if (strength >= 90) return "Monster hand";
  if (strength >= 70) return "Very strong";
  if (strength >= 50) return "Strong";
  if (strength >= 30) return "Moderate";
  if (strength >= 15) return "Weak";
  return "Very weak";
}

/**
 * Calculate pre-flop hand strength (hole cards only)
 * Based on common poker hand rankings
 */
export function preflopStrength(holeCards: Card[]): number {
  if (holeCards.length !== 2) return 0;

  const [c1, c2] = sortCardsByRank(holeCards);
  const v1 = RANK_VALUES[c1.rank];
  const v2 = RANK_VALUES[c2.rank];
  const suited = c1.suit === c2.suit;
  const paired = c1.rank === c2.rank;

  // Pocket pairs
  if (paired) {
    return 50 + v1 * 3; // AA = 92, 22 = 56
  }

  // High card combinations
  const highSum = v1 + v2;
  const gap = v1 - v2;

  let strength = highSum * 2; // Base on card values

  // Suited bonus
  if (suited) strength += 10;

  // Connectors bonus
  if (gap === 1) strength += 5;
  if (gap === 2) strength += 3;

  // Broadway cards bonus (10 or higher)
  if (v1 >= 10 && v2 >= 10) strength += 10;

  // Ace bonus
  if (v1 === 14) strength += 8;

  return Math.min(85, strength);
}
