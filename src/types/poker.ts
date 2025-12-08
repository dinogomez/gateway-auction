// =============================================================================
// POKER TYPES - Gateway Poker AI Model Evaluation Game
// =============================================================================

// Reuse Model type from auction (same concept)
export interface Model {
  id: string;
  name: string;
  color: string;
  tier: "budget" | "mid" | "premium";
}

// =============================================================================
// CARD TYPES
// =============================================================================

export type Suit = "h" | "d" | "c" | "s"; // hearts, diamonds, clubs, spades
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

// Suit display names
export const SUIT_NAMES: Record<Suit, string> = {
  h: "Hearts",
  d: "Diamonds",
  c: "Clubs",
  s: "Spades",
};

// Suit symbols
export const SUIT_SYMBOLS: Record<Suit, string> = {
  h: "\u2665", // ♥
  d: "\u2666", // ♦
  c: "\u2663", // ♣
  s: "\u2660", // ♠
};

// Suit colors for display
export const SUIT_COLORS: Record<Suit, string> = {
  h: "#ef4444", // red
  d: "#ef4444", // red
  c: "#1f2937", // dark gray/black
  s: "#1f2937", // dark gray/black
};

// Rank display names
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

// Rank values for comparison (Ace high)
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

// =============================================================================
// HAND EVALUATION TYPES
// =============================================================================

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

export interface EvaluatedHand {
  rank: HandRank;
  rankName: string;
  cards: Card[]; // 5 best cards forming the hand
  kickers: Card[]; // remaining cards for tiebreaking
  score: number; // numeric score for comparison (higher = better)
  description: string; // e.g., "Pair of Kings"
}

// =============================================================================
// ACTION TYPES
// =============================================================================

export type PokerActionType = "fold" | "check" | "call" | "raise" | "all-in";

export interface PokerAction {
  type: PokerActionType;
  amount?: number; // for raise, this is the total bet amount (not raise increment)
}

// Betting phases
export type BettingPhase = "preflop" | "flop" | "turn" | "river" | "showdown";

// =============================================================================
// PLAYER STATE
// =============================================================================

export type PlayerStatus = "active" | "folded" | "all-in" | "sitting-out";

export interface PokerPlayerState {
  playerId: string;
  holeCards: Card[]; // 2 cards
  chipStack: number;
  currentBet: number; // bet in current betting round
  totalBetThisHand: number; // total committed this hand
  status: PlayerStatus;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  hasActed: boolean; // has acted in current betting round
  lastAction: PokerAction | null;
  position: number; // seat position 0-9
  isHuman: boolean; // is this the human player?
}

// =============================================================================
// POT TYPES
// =============================================================================

export interface Pot {
  amount: number;
  eligiblePlayers: string[]; // player IDs who can win this pot
  isMainPot: boolean;
}

// =============================================================================
// GAME STATE
// =============================================================================

export type GameStatus =
  | "waiting" // waiting to start
  | "dealing" // dealing cards
  | "betting" // betting round in progress
  | "showdown" // revealing hands
  | "hand_complete" // hand finished, ready for next
  | "game_over"; // all hands complete

// Game flow phase - granular UI state for managing transitions and preventing timer chaos
// Works alongside GameStatus for finer-grained control
export type GameFlowPhase =
  | "idle" // No active game
  | "loading" // Loading screen visible
  | "dealing" // Cards being dealt animation
  | "awaiting_action" // Waiting for current player to act
  | "processing_action" // AI thinking or processing action
  | "action_complete" // Action processed, brief pause before next
  | "advancing_phase" // Moving to flop/turn/river/showdown
  | "awarding_pot" // Distributing pot to winner(s)
  | "hand_countdown" // Countdown to next hand
  | "game_over"; // Game finished

export interface PokerGameState {
  id: string;
  status: GameStatus;
  flowPhase: GameFlowPhase; // Granular UI flow state

  // Players
  players: Model[];
  playerStates: Record<string, PokerPlayerState>;
  humanPlayerId: string | null; // null if spectating

  // Table positions
  dealerPosition: number; // seat index of dealer button
  smallBlindPosition: number;
  bigBlindPosition: number;
  currentPlayerIndex: number; // whose turn it is

  // Cards
  deck: Card[];
  communityCards: Card[]; // 0-5 cards
  burnedCards: Card[];

  // Betting state
  currentPhase: BettingPhase;
  currentBet: number; // current bet to match
  minRaise: number; // minimum raise amount
  pots: Pot[];
  lastRaiserIndex: number | null; // for tracking when betting round ends

  // Blinds
  smallBlindAmount: number;
  bigBlindAmount: number;

  // Hand/Game tracking
  handNumber: number;
  totalHands: number;
  handHistory: HandResult[];

  // Action history for current hand
  actionHistory: PokerBettingEntry[];

  // Agent thinking states (for AI turn processing)
  agentThinking: Record<string, AgentThinkingState>;
}

// =============================================================================
// BETTING HISTORY
// =============================================================================

export interface PokerBettingEntry {
  playerId: string;
  playerName: string;
  action: PokerActionType;
  amount?: number;
  phase: BettingPhase;
  timestamp: number;
}

// =============================================================================
// HAND RESULT
// =============================================================================

export interface HandResult {
  handNumber: number;
  winners: HandWinner[];
  potAmount: number;
  communityCards: Card[];
  showdownPlayers: ShowdownPlayer[];
}

export interface HandWinner {
  playerId: string;
  amount: number; // chips won
  hand: EvaluatedHand;
}

export interface ShowdownPlayer {
  playerId: string;
  holeCards: Card[];
  hand: EvaluatedHand;
  profit: number; // chips won minus chips bet
}

// =============================================================================
// AGENT CONTEXT (for AI decision making)
// =============================================================================

export interface PokerAgentContext {
  // My cards
  holeCards: Card[];

  // Board state
  communityCards: Card[];
  currentPhase: BettingPhase;
  potSize: number;
  currentBet: number;
  minRaise: number;

  // My state
  ownChipStack: number;
  ownCurrentBet: number;
  amountToCall: number;

  // Position info
  position: "early" | "middle" | "late" | "blinds";
  isDealer: boolean;
  playersToActAfterMe: number;

  // Opponent info (anonymized)
  opponents: AnonymizedPokerOpponent[];
  bettingHistory: AnonymizedPokerHistoryEntry[];

  // Game progress
  handNumber: number;
  totalHands: number;
}

export interface AnonymizedPokerOpponent {
  label: string; // "Opponent A", etc.
  chipStack: number;
  currentBet: number;
  status: PlayerStatus;
  position: string;
  hasActed: boolean;
}

export interface AnonymizedPokerHistoryEntry {
  label: string;
  action: PokerActionType;
  amount?: number;
  phase: BettingPhase;
}

// =============================================================================
// AGENT THINKING STATE
// =============================================================================

export interface AgentThinkingState {
  modelId: string;
  phase: "waiting" | "thinking" | "deciding" | "complete";
  thoughts: string;
  action: PokerAction | null;
  isStreaming: boolean;
}

// =============================================================================
// LEADERBOARD & STATS (for Convex persistence)
// =============================================================================

export interface PlayerStats {
  playerId: string;
  modelId: string;
  modelName: string;

  // Game stats
  gamesPlayed: number;
  handsPlayed: number;
  handsWon: number;

  // Financial stats
  totalProfit: number;
  currentBalance: number;
  biggestWin: number;
  biggestLoss: number;

  // Behavioral stats
  foldRate: number; // 0-1
  raiseRate: number; // 0-1
  allInCount: number;
  showdownWinRate: number; // 0-1

  // Timestamps
  lastPlayed: number;
  createdAt: number;
}

export interface LeaderboardEntry {
  playerId: string;
  modelId: string;
  modelName: string;
  totalProfit: number;
  currentBalance: number;
  handsWon: number;
  handsPlayed: number;
  winRate: number;
  rank: number;
}

// =============================================================================
// GAME CONFIGURATION
// =============================================================================

export interface PokerGameConfig {
  totalHands: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  blindIncreaseInterval: number; // hands between blind increases (0 = no increase)
  thinkingTimeMs: number;
}

export const DEFAULT_POKER_CONFIG: PokerGameConfig = {
  totalHands: 10,
  startingChips: 1000,
  smallBlind: 25,
  bigBlind: 50,
  blindIncreaseInterval: 0,
  thinkingTimeMs: 30000,
};

// =============================================================================
// COMMENTARY TYPES (reuse pattern from auction)
// =============================================================================

export type PokerCommentaryTrigger =
  | "big_bluff" // large bet with weak hand
  | "cooler" // two strong hands clash
  | "bad_beat" // lost with strong hand
  | "hero_call" // called with weak hand, was right
  | "all_in_showdown" // all-in and call
  | "comeback" // recovering from big loss
  | "dominance" // winning streak
  | "slow_play" // checking/calling with monster
  | "river_suckout" // won on the river
  | "chip_leader_change"; // new chip leader

export interface PokerCommentaryEvent {
  id: string;
  trigger: PokerCommentaryTrigger;
  message: string;
  targetPlayerId: string;
  timestamp: number;
}
