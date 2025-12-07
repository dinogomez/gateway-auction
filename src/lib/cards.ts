import type { Card, Suit, Rank } from "@/types/poker";
import {
  RANK_VALUES,
  SUIT_SYMBOLS,
  RANK_NAMES,
  SUIT_NAMES,
} from "@/types/poker";

// All suits
const SUITS: Suit[] = ["h", "d", "c", "s"];

// All ranks in order
const RANKS: Rank[] = [
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
];

/**
 * Create a standard 52-card deck
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle algorithm
 * Returns a new shuffled array, does not mutate original
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal cards from the deck
 * Returns dealt cards and mutates the deck array
 */
export function dealCards(deck: Card[], count: number): Card[] {
  if (count > deck.length) {
    throw new Error(
      `Cannot deal ${count} cards, only ${deck.length} remaining`,
    );
  }
  return deck.splice(0, count);
}

/**
 * Deal cards without mutating (returns new arrays)
 */
export function dealCardsImmutable(
  deck: Card[],
  count: number,
): { dealt: Card[]; remaining: Card[] } {
  if (count > deck.length) {
    throw new Error(
      `Cannot deal ${count} cards, only ${deck.length} remaining`,
    );
  }
  return {
    dealt: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

/**
 * Get card image path
 * Format: /assets/cards/card_[suit]_[rank].svg
 */
export function getCardImage(card: Card): string {
  return `/assets/cards/card_${card.suit}_${card.rank}.svg`;
}

/**
 * Get face-down card image
 */
export function getFacedownImage(): string {
  return "/assets/cards/card_facedown.svg";
}

/**
 * Get display string for a card (e.g., "A♠", "10♥")
 */
export function cardToString(card: Card): string {
  const rankDisplay = card.rank === "10" ? "10" : card.rank.toUpperCase();
  return `${rankDisplay}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Get full name for a card (e.g., "Ace of Spades")
 */
export function cardToFullName(card: Card): string {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}

/**
 * Compare two cards by rank (for sorting)
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareCardsByRank(a: Card, b: Card): number {
  return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
}

/**
 * Sort cards by rank (descending - highest first)
 */
export function sortCardsByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => compareCardsByRank(b, a));
}

/**
 * Sort cards by suit, then rank
 */
export function sortCardsBySuitAndRank(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { s: 0, h: 1, d: 2, c: 3 };
  return [...cards].sort((a, b) => {
    const suitDiff = suitOrder[a.suit] - suitOrder[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return compareCardsByRank(b, a);
  });
}

/**
 * Check if two cards are the same
 */
export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Group cards by suit
 */
export function groupBySuit(cards: Card[]): Record<Suit, Card[]> {
  const groups: Record<Suit, Card[]> = { h: [], d: [], c: [], s: [] };
  for (const card of cards) {
    groups[card.suit].push(card);
  }
  return groups;
}

/**
 * Group cards by rank
 */
export function groupByRank(cards: Card[]): Record<Rank, Card[]> {
  const groups: Partial<Record<Rank, Card[]>> = {};
  for (const card of cards) {
    if (!groups[card.rank]) {
      groups[card.rank] = [];
    }
    groups[card.rank]!.push(card);
  }
  return groups as Record<Rank, Card[]>;
}

/**
 * Count occurrences of each rank
 */
export function countRanks(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  }
  return counts;
}

/**
 * Get unique ranks in the cards
 */
export function getUniqueRanks(cards: Card[]): Rank[] {
  return [...new Set(cards.map((c) => c.rank))];
}

/**
 * Check if cards form a flush (5+ same suit)
 */
export function hasFlush(cards: Card[]): Suit | null {
  const bySuit = groupBySuit(cards);
  for (const suit of SUITS) {
    if (bySuit[suit].length >= 5) {
      return suit;
    }
  }
  return null;
}

/**
 * Check if cards contain a straight (5 consecutive ranks)
 * Returns the high card rank of the straight, or null
 * Handles A-2-3-4-5 (wheel) as a special case
 */
export function findStraight(cards: Card[]): Rank | null {
  const uniqueValues = [...new Set(cards.map((c) => RANK_VALUES[c.rank]))].sort(
    (a, b) => b - a,
  );

  // Check for wheel (A-2-3-4-5)
  if (
    uniqueValues.includes(14) && // Ace
    uniqueValues.includes(2) &&
    uniqueValues.includes(3) &&
    uniqueValues.includes(4) &&
    uniqueValues.includes(5)
  ) {
    return "5"; // 5-high straight
  }

  // Check for regular straights
  for (let i = 0; i <= uniqueValues.length - 5; i++) {
    const high = uniqueValues[i];
    const isSequential =
      uniqueValues[i + 1] === high - 1 &&
      uniqueValues[i + 2] === high - 2 &&
      uniqueValues[i + 3] === high - 3 &&
      uniqueValues[i + 4] === high - 4;

    if (isSequential) {
      // Find the rank with this value
      const rankEntry = Object.entries(RANK_VALUES).find(([, v]) => v === high);
      if (rankEntry) {
        return rankEntry[0] as Rank;
      }
    }
  }

  return null;
}

/**
 * Parse a card from string format (e.g., "Ah", "10s", "Kd")
 */
export function parseCard(str: string): Card | null {
  const normalized = str.toLowerCase().trim();

  // Handle 10 specially
  if (normalized.length === 3 && normalized.startsWith("10")) {
    const suit = normalized[2] as Suit;
    if (SUITS.includes(suit)) {
      return { rank: "10", suit };
    }
    return null;
  }

  if (normalized.length !== 2) return null;

  const rankChar = normalized[0];
  const suitChar = normalized[1] as Suit;

  if (!SUITS.includes(suitChar)) return null;

  // Map rank character to Rank type
  const rankMap: Record<string, Rank> = {
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
    t: "10",
    j: "j",
    q: "q",
    k: "k",
    a: "a",
  };

  const rank = rankMap[rankChar];
  if (!rank) return null;

  return { rank, suit: suitChar };
}

/**
 * Format multiple cards for display
 */
export function cardsToString(cards: Card[]): string {
  return cards.map(cardToString).join(" ");
}
