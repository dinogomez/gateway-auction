/**
 * Poker logic for Convex - ported from src/lib/
 * Contains card operations, hand evaluation, and pot management
 */

// =============================================================================
// TYPES
// =============================================================================

export type Suit = "h" | "d" | "c" | "s";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "j"
  | "q"
  | "k"
  | "a";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface PlayerState {
  modelId: string;
  codename: string;
  characterId: string;
  chips: number;
  hand: Card[];
  currentBet: number;
  totalBetThisHand: number;
  folded: boolean;
  isAllIn: boolean;
  hasActed: boolean;
  position: number;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
  isMainPot: boolean;
}

export interface EvaluatedHand {
  rank: HandRank;
  rankName: string;
  cards: Card[];
  score: number;
  description: string;
}

export enum HandRank {
  HIGH_CARD = 1,
  PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
  ROYAL_FLUSH = 10,
}

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  [HandRank.HIGH_CARD]: "High Card",
  [HandRank.PAIR]: "Pair",
  [HandRank.TWO_PAIR]: "Two Pair",
  [HandRank.THREE_OF_A_KIND]: "Three of a Kind",
  [HandRank.STRAIGHT]: "Straight",
  [HandRank.FLUSH]: "Flush",
  [HandRank.FULL_HOUSE]: "Full House",
  [HandRank.FOUR_OF_A_KIND]: "Four of a Kind",
  [HandRank.STRAIGHT_FLUSH]: "Straight Flush",
  [HandRank.ROYAL_FLUSH]: "Royal Flush",
};

export const RANK_VALUES: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  j: 11,
  q: 12,
  k: 13,
  a: 14,
};

export const RANK_NAMES: Record<Rank, string> = {
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  j: "Jack",
  q: "Queen",
  k: "King",
  a: "Ace",
};

// =============================================================================
// CARD OPERATIONS
// =============================================================================

const SUITS: Suit[] = ["h", "d", "c", "s"];
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
 * Deal cards from deck (mutates and returns)
 */
export function dealCards(
  deck: Card[],
  count: number,
): { dealt: Card[]; remaining: Card[] } {
  return {
    dealt: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

/**
 * Convert card to string (e.g., "Ah", "10s")
 */
export function cardToString(card: Card): string {
  const rankDisplay = card.rank === "10" ? "10" : card.rank.toUpperCase();
  const suitSymbols = { h: "♥", d: "♦", c: "♣", s: "♠" };
  return `${rankDisplay}${suitSymbols[card.suit]}`;
}

// =============================================================================
// HAND EVALUATION
// =============================================================================

/**
 * Sort cards by rank (descending)
 */
function sortCardsByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
}

/**
 * Count occurrences of each rank
 */
function countRanks(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  }
  return counts;
}

/**
 * Group cards by suit
 */
function groupBySuit(cards: Card[]): Record<Suit, Card[]> {
  const groups: Record<Suit, Card[]> = { h: [], d: [], c: [], s: [] };
  for (const card of cards) {
    groups[card.suit].push(card);
  }
  return groups;
}

/**
 * Check for flush (5+ same suit)
 */
function hasFlush(cards: Card[]): Suit | null {
  const bySuit = groupBySuit(cards);
  for (const suit of SUITS) {
    if (bySuit[suit].length >= 5) {
      return suit;
    }
  }
  return null;
}

/**
 * Find straight in cards (returns high card rank or null)
 */
function findStraight(cards: Card[]): Rank | null {
  const uniqueValues = [...new Set(cards.map((c) => RANK_VALUES[c.rank]))].sort(
    (a, b) => b - a,
  );

  // Check for wheel (A-2-3-4-5)
  if (
    uniqueValues.includes(14) &&
    uniqueValues.includes(2) &&
    uniqueValues.includes(3) &&
    uniqueValues.includes(4) &&
    uniqueValues.includes(5)
  ) {
    return "5";
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
      const rankEntry = Object.entries(RANK_VALUES).find(([, v]) => v === high);
      if (rankEntry) {
        return rankEntry[0] as Rank;
      }
    }
  }

  return null;
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
 */
function calculateScore(
  handRank: HandRank,
  cards: Card[],
  primaryRank?: Rank,
  secondaryRank?: Rank,
): number {
  let score = handRank * 100000000;

  if (primaryRank) {
    score += RANK_VALUES[primaryRank] * 1000000;
  } else if (
    handRank === HandRank.FLUSH ||
    handRank === HandRank.HIGH_CARD ||
    handRank === HandRank.ROYAL_FLUSH
  ) {
    const sorted = sortCardsByRank(cards);
    score += RANK_VALUES[sorted[0].rank] * 1000000;
  }

  if (secondaryRank) {
    score += RANK_VALUES[secondaryRank] * 10000;
  }

  const sorted = sortCardsByRank(cards);
  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    score += RANK_VALUES[sorted[i].rank] * Math.pow(15, 4 - i);
  }

  return score;
}

/**
 * Generate all 5-card combinations from cards
 */
function* combinations(cards: Card[], size: number): Generator<Card[]> {
  if (size === 0) {
    yield [];
    return;
  }
  if (cards.length < size) return;

  const [first, ...rest] = cards;
  for (const combo of combinations(rest, size - 1)) {
    yield [first, ...combo];
  }
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

  const isFlush = flushSuit !== null;
  const isStraight = straightHigh !== null;
  const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);

  // Royal Flush
  if (isFlush && isStraight && straightHigh === "a") {
    return {
      rank: HandRank.ROYAL_FLUSH,
      rankName: HAND_RANK_NAMES[HandRank.ROYAL_FLUSH],
      cards: sorted,
      score: calculateScore(HandRank.ROYAL_FLUSH, sorted),
      description: "Royal Flush",
    };
  }

  // Straight Flush
  if (isFlush && straightHigh !== null) {
    return {
      rank: HandRank.STRAIGHT_FLUSH,
      rankName: HAND_RANK_NAMES[HandRank.STRAIGHT_FLUSH],
      cards: sorted,
      score: calculateScore(HandRank.STRAIGHT_FLUSH, sorted, straightHigh),
      description: `Straight Flush, ${RANK_NAMES[straightHigh]} high`,
    };
  }

  // Four of a Kind
  if (counts[0] === 4) {
    const quadRank = findRankWithCount(rankCounts, 4);
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      rankName: HAND_RANK_NAMES[HandRank.FOUR_OF_A_KIND],
      cards: sorted,
      score: calculateScore(HandRank.FOUR_OF_A_KIND, sorted, quadRank),
      description: `Four of a Kind, ${RANK_NAMES[quadRank]}s`,
    };
  }

  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    const tripRank = findRankWithCount(rankCounts, 3);
    const pairRank = findRankWithCount(rankCounts, 2);
    return {
      rank: HandRank.FULL_HOUSE,
      rankName: HAND_RANK_NAMES[HandRank.FULL_HOUSE],
      cards: sorted,
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
      score: calculateScore(HandRank.FLUSH, sorted),
      description: `Flush, ${RANK_NAMES[sorted[0].rank]} high`,
    };
  }

  // Straight
  if (straightHigh !== null) {
    return {
      rank: HandRank.STRAIGHT,
      rankName: HAND_RANK_NAMES[HandRank.STRAIGHT],
      cards: sorted,
      score: calculateScore(HandRank.STRAIGHT, sorted, straightHigh),
      description: `Straight, ${RANK_NAMES[straightHigh]} high`,
    };
  }

  // Three of a Kind
  if (counts[0] === 3) {
    const tripRank = findRankWithCount(rankCounts, 3);
    return {
      rank: HandRank.THREE_OF_A_KIND,
      rankName: HAND_RANK_NAMES[HandRank.THREE_OF_A_KIND],
      cards: sorted,
      score: calculateScore(HandRank.THREE_OF_A_KIND, sorted, tripRank),
      description: `Three of a Kind, ${RANK_NAMES[tripRank]}s`,
    };
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    const pairRanks = findRanksWithCount(rankCounts, 2).sort(
      (a, b) => RANK_VALUES[b] - RANK_VALUES[a],
    );
    return {
      rank: HandRank.TWO_PAIR,
      rankName: HAND_RANK_NAMES[HandRank.TWO_PAIR],
      cards: sorted,
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
    return {
      rank: HandRank.PAIR,
      rankName: HAND_RANK_NAMES[HandRank.PAIR],
      cards: sorted,
      score: calculateScore(HandRank.PAIR, sorted, pairRank),
      description: `Pair of ${RANK_NAMES[pairRank]}s`,
    };
  }

  // High Card
  return {
    rank: HandRank.HIGH_CARD,
    rankName: HAND_RANK_NAMES[HandRank.HIGH_CARD],
    cards: sorted,
    score: calculateScore(HandRank.HIGH_CARD, sorted),
    description: `${RANK_NAMES[sorted[0].rank]} high`,
  };
}

/**
 * Evaluate best 5-card hand from 7 cards (2 hole + 5 community)
 */
export function evaluateHand(
  holeCards: Card[],
  communityCards: Card[],
): EvaluatedHand {
  // Validate input
  if (holeCards.length !== 2) {
    throw new Error(`Expected 2 hole cards, got ${holeCards.length}`);
  }
  if (communityCards.length < 3 || communityCards.length > 5) {
    throw new Error(
      `Expected 3-5 community cards, got ${communityCards.length}`,
    );
  }

  const allCards = [...holeCards, ...communityCards];

  // Check for duplicate cards
  const seen = new Set<string>();
  for (const card of allCards) {
    const key = `${card.rank}-${card.suit}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate card detected: ${card.rank} of ${card.suit}`);
    }
    seen.add(key);
  }

  let bestHand: EvaluatedHand | null = null;

  for (const combo of combinations(allCards, 5)) {
    const hand = evaluate5Cards(combo);
    if (!bestHand || hand.score > bestHand.score) {
      bestHand = hand;
    }
  }

  if (!bestHand) {
    throw new Error("Failed to evaluate hand");
  }
  return bestHand;
}

/**
 * Determine winners from player hands
 */
export function determineWinners(
  playerHands: Array<{ modelId: string; hand: EvaluatedHand }>,
): string[] {
  if (playerHands.length === 0) return [];
  if (playerHands.length === 1) return [playerHands[0].modelId];

  const sorted = [...playerHands].sort((a, b) => b.hand.score - a.hand.score);
  const highestScore = sorted[0].hand.score;

  return sorted
    .filter((p) => p.hand.score === highestScore)
    .map((p) => p.modelId);
}

// =============================================================================
// POT MANAGEMENT
// =============================================================================

/**
 * Calculate main pot and side pots from player states
 */
export function calculatePots(playerStates: PlayerState[]): Pot[] {
  const players = playerStates.filter(
    (p) => !p.folded || p.totalBetThisHand > 0,
  );

  const betAmounts = [...new Set(players.map((p) => p.totalBetThisHand))]
    .filter((b) => b > 0)
    .sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previousLevel = 0;

  for (const level of betAmounts) {
    const contribution = level - previousLevel;
    const contributors = players.filter((p) => p.totalBetThisHand >= level);
    const potAmount = contribution * contributors.length;

    if (potAmount > 0) {
      const eligiblePlayerIds = contributors
        .filter((p) => !p.folded)
        .map((p) => p.modelId);

      if (eligiblePlayerIds.length > 0) {
        pots.push({
          amount: potAmount,
          eligiblePlayerIds,
          isMainPot: pots.length === 0,
        });
      }
    }

    previousLevel = level;
  }

  return pots;
}

/**
 * Get total pot size
 */
export function getTotalPotSize(pots: Pot[]): number {
  return pots.reduce((sum, pot) => sum + pot.amount, 0);
}

/**
 * Distribute pots to winners
 * When there's a remainder in split pots, chips go to players in earliest position
 * (closest to dealer button, moving clockwise).
 *
 * @param pots - The pots to distribute
 * @param playerHands - Map of player modelId to their evaluated hand
 * @param playerOrder - Optional array of modelIds in seat order (index 0 = seat 0)
 * @param dealerIndex - Optional dealer position for remainder distribution
 */
export function distributePots(
  pots: Pot[],
  playerHands: Map<string, EvaluatedHand>,
  playerOrder?: string[],
  dealerIndex?: number,
): Map<string, number> {
  const winnings = new Map<string, number>();

  for (const pot of pots) {
    let bestScore = -1;
    const potWinners: string[] = [];

    for (const modelId of pot.eligiblePlayerIds) {
      const hand = playerHands.get(modelId);
      if (!hand) continue;

      if (hand.score > bestScore) {
        bestScore = hand.score;
        potWinners.length = 0;
        potWinners.push(modelId);
      } else if (hand.score === bestScore) {
        potWinners.push(modelId);
      }
    }

    if (potWinners.length > 0) {
      const share = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount % potWinners.length;

      // Sort winners by position from dealer (earliest position gets remainder)
      let sortedWinners = potWinners;
      if (playerOrder && dealerIndex !== undefined && potWinners.length > 1 && remainder > 0) {
        const numPlayers = playerOrder.length;
        sortedWinners = [...potWinners].sort((a, b) => {
          const posA = playerOrder.indexOf(a);
          const posB = playerOrder.indexOf(b);
          // Calculate distance from dealer (clockwise)
          const distA = (posA - dealerIndex + numPlayers) % numPlayers;
          const distB = (posB - dealerIndex + numPlayers) % numPlayers;
          return distA - distB; // Smaller distance = earlier position
        });
      }

      for (let i = 0; i < sortedWinners.length; i++) {
        const modelId = sortedWinners[i];
        const amount = share + (i < remainder ? 1 : 0);
        const current = winnings.get(modelId) || 0;
        winnings.set(modelId, current + amount);
      }
    }
  }

  return winnings;
}

// =============================================================================
// BETTING HELPERS
// =============================================================================

/**
 * Get amount needed to call
 */
export function getAmountToCall(currentBet: number, playerBet: number): number {
  return Math.max(0, currentBet - playerBet);
}

/**
 * Get minimum raise amount
 */
export function getMinRaise(
  currentBet: number,
  lastRaiseAmount: number,
  bigBlind: number,
): number {
  const minRaiseIncrement = Math.max(lastRaiseAmount, bigBlind);
  return currentBet + minRaiseIncrement;
}

/**
 * Check if player can check
 */
export function canCheck(playerBet: number, currentBet: number): boolean {
  return playerBet === currentBet;
}

/**
 * Check if player can call (includes partial call/all-in for less)
 * A player can always call if there's a bet to match and they have chips.
 * If they don't have enough chips for full call, they call all-in for less.
 */
export function canCall(
  playerChips: number,
  playerBet: number,
  currentBet: number,
): boolean {
  const amountToCall = currentBet - playerBet;
  // Player can call if there's something to call and they have any chips
  // Partial calls (all-in for less) are always allowed
  return amountToCall > 0 && playerChips > 0;
}

/**
 * Check if player can raise
 */
export function canRaise(
  playerChips: number,
  playerBet: number,
  currentBet: number,
): boolean {
  const amountToCall = currentBet - playerBet;
  const chipsAfterCall = playerChips - amountToCall;
  return chipsAfterCall > 0;
}

/**
 * Get valid actions for a player
 */
export function getValidActions(
  player: PlayerState,
  currentBet: number,
  minRaise: number,
): {
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  minRaiseTotal: number;
  maxRaiseTotal: number;
} {
  const amountToCall = getAmountToCall(currentBet, player.currentBet);
  const chipsAfterCall = player.chips - amountToCall;

  return {
    // Can only check if player's bet exactly matches current bet (not >=)
    // This prevents checking after a raise when bets should match exactly
    canCheck: player.currentBet === currentBet,
    canCall: amountToCall > 0 && amountToCall <= player.chips,
    canRaise: chipsAfterCall > 0,
    callAmount: Math.min(amountToCall, player.chips),
    minRaiseTotal: Math.min(minRaise, player.chips + player.currentBet),
    maxRaiseTotal: player.chips + player.currentBet,
  };
}

// =============================================================================
// POSITION HELPERS
// =============================================================================

/**
 * Get position name based on seat and dealer
 */
export function getPositionName(
  seatIndex: number,
  dealerIndex: number,
  totalPlayers: number,
): string {
  const positions = ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "CO"];
  const relativePosition =
    (seatIndex - dealerIndex + totalPlayers) % totalPlayers;

  if (totalPlayers === 2) {
    return relativePosition === 0 ? "BTN/SB" : "BB";
  }

  if (relativePosition < positions.length) {
    return positions[relativePosition];
  }
  return `Seat ${seatIndex + 1}`;
}

/**
 * Get next active player index
 */
export function getNextActivePlayer(
  currentIndex: number,
  players: PlayerState[],
): number {
  const numPlayers = players.length;
  let next = (currentIndex + 1) % numPlayers;

  while (next !== currentIndex) {
    const player = players[next];
    if (!player.folded && !player.isAllIn) {
      return next;
    }
    next = (next + 1) % numPlayers;
  }

  return -1; // No active players
}

/**
 * Count active players (not folded and not all-in)
 */
export function countActivePlayers(players: PlayerState[]): number {
  return players.filter((p) => !p.folded && !p.isAllIn).length;
}

/**
 * Count players still in hand (not folded)
 */
export function countPlayersInHand(players: PlayerState[]): number {
  return players.filter((p) => !p.folded).length;
}

/**
 * Check if betting round is complete
 */
export function isBettingRoundComplete(
  players: PlayerState[],
  currentBet: number,
): boolean {
  const activePlayers = players.filter((p) => !p.folded && !p.isAllIn);

  // All players have acted
  if (!activePlayers.every((p) => p.hasActed)) {
    return false;
  }

  // All active players have matched the current bet
  return activePlayers.every((p) => p.currentBet === currentBet);
}
