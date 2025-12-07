import type { PokerPlayerState, Pot, EvaluatedHand } from "@/types/poker";

/**
 * Calculate main pot and side pots from player bets
 *
 * Side pots are created when a player goes all-in with less than others have bet.
 * Each pot tracks which players are eligible to win it.
 */
export function calculatePots(
  playerStates: Record<string, PokerPlayerState>,
): Pot[] {
  const players = Object.values(playerStates).filter(
    (p) => p.status !== "sitting-out",
  );

  // Get all unique bet amounts (sorted ascending)
  const betAmounts = [...new Set(players.map((p) => p.totalBetThisHand))].sort(
    (a, b) => a - b,
  );

  // Players who haven't folded are eligible for pots
  const eligiblePlayers = players.filter((p) => p.status !== "folded");

  if (eligiblePlayers.length === 0) {
    return [];
  }

  const pots: Pot[] = [];
  let previousLevel = 0;

  for (const level of betAmounts) {
    if (level === 0) continue;

    // How much each player contributes to this pot level
    const contribution = level - previousLevel;

    // Players who contributed at this level
    const contributors = players.filter((p) => p.totalBetThisHand >= level);

    // Calculate pot amount at this level
    const potAmount = contribution * contributors.length;

    if (potAmount > 0) {
      // Eligible players are those who:
      // 1. Contributed at this level
      // 2. Haven't folded
      const eligibleForThisPot = contributors
        .filter((p) => p.status !== "folded")
        .map((p) => p.playerId);

      pots.push({
        amount: potAmount,
        eligiblePlayers: eligibleForThisPot,
        isMainPot: pots.length === 0,
      });
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
 *
 * @param pots - Array of pots to distribute
 * @param playerHands - Map of playerId to their evaluated hand
 * @returns Map of playerId to chips won
 */
export function distributePots(
  pots: Pot[],
  playerHands: Map<string, EvaluatedHand>,
): Map<string, number> {
  const winnings = new Map<string, number>();

  for (const pot of pots) {
    // Find the best hand among eligible players
    let bestScore = -1;
    const potWinners: string[] = [];

    for (const playerId of pot.eligiblePlayers) {
      const hand = playerHands.get(playerId);
      if (!hand) continue;

      if (hand.score > bestScore) {
        bestScore = hand.score;
        potWinners.length = 0;
        potWinners.push(playerId);
      } else if (hand.score === bestScore) {
        potWinners.push(playerId);
      }
    }

    // Split pot among winners
    if (potWinners.length > 0) {
      const share = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount % potWinners.length;

      for (let i = 0; i < potWinners.length; i++) {
        const playerId = potWinners[i];
        const amount = share + (i < remainder ? 1 : 0); // First players get remainder chips
        const current = winnings.get(playerId) || 0;
        winnings.set(playerId, current + amount);
      }
    }
  }

  return winnings;
}

/**
 * Calculate pot odds (ratio of pot size to amount needed to call)
 */
export function calculatePotOdds(
  potSize: number,
  amountToCall: number,
): number {
  if (amountToCall === 0) return Infinity;
  return potSize / amountToCall;
}

/**
 * Calculate effective stack (smallest stack among active players)
 */
export function getEffectiveStack(
  playerStates: Record<string, PokerPlayerState>,
): number {
  const activeStacks = Object.values(playerStates)
    .filter((p) => p.status === "active" || p.status === "all-in")
    .map((p) => p.chipStack + p.currentBet);

  if (activeStacks.length === 0) return 0;
  return Math.min(...activeStacks);
}

/**
 * Calculate the amount needed to call
 */
export function getAmountToCall(currentBet: number, playerBet: number): number {
  return Math.max(0, currentBet - playerBet);
}

/**
 * Calculate minimum raise amount
 * In No Limit, minimum raise must be at least the size of the previous raise
 */
export function getMinRaise(
  currentBet: number,
  lastRaiseAmount: number,
  bigBlind: number,
): number {
  // Minimum raise is the greater of:
  // 1. The size of the last raise
  // 2. The big blind
  const minRaiseIncrement = Math.max(lastRaiseAmount, bigBlind);
  return currentBet + minRaiseIncrement;
}

/**
 * Check if a player can check (no bet to match)
 */
export function canCheck(
  playerState: PokerPlayerState,
  currentBet: number,
): boolean {
  return playerState.currentBet >= currentBet;
}

/**
 * Check if a player can call
 */
export function canCall(
  playerState: PokerPlayerState,
  currentBet: number,
): boolean {
  const amountToCall = currentBet - playerState.currentBet;
  return amountToCall > 0 && amountToCall <= playerState.chipStack;
}

/**
 * Check if a player can raise
 */
export function canRaise(
  playerState: PokerPlayerState,
  currentBet: number,
  minRaise: number,
): boolean {
  // Player needs chips beyond what's needed to call
  const amountToCall = currentBet - playerState.currentBet;
  const chipsAfterCall = playerState.chipStack - amountToCall;
  return chipsAfterCall > 0;
}

/**
 * Get valid actions for a player
 */
export function getValidActions(
  playerState: PokerPlayerState,
  currentBet: number,
  minRaise: number,
): Array<{ action: string; minAmount?: number; maxAmount?: number }> {
  const actions: Array<{
    action: string;
    minAmount?: number;
    maxAmount?: number;
  }> = [];

  // Fold is always available
  actions.push({ action: "fold" });

  const amountToCall = currentBet - playerState.currentBet;

  if (amountToCall === 0) {
    // No bet to match - can check
    actions.push({ action: "check" });
  } else if (amountToCall > 0 && amountToCall < playerState.chipStack) {
    // Can call
    actions.push({ action: "call", minAmount: amountToCall });
  }

  // Raise if player has chips after calling
  const chipsAfterCall = playerState.chipStack - amountToCall;
  if (chipsAfterCall > 0) {
    const raiseMin = Math.min(
      minRaise,
      playerState.chipStack + playerState.currentBet,
    );
    const raiseMax = playerState.chipStack + playerState.currentBet;
    if (raiseMin <= raiseMax) {
      actions.push({
        action: "raise",
        minAmount: raiseMin,
        maxAmount: raiseMax,
      });
    }
  }

  // All-in is always available if player has chips
  if (playerState.chipStack > 0) {
    actions.push({
      action: "all-in",
      minAmount: playerState.chipStack + playerState.currentBet,
    });
  }

  return actions;
}

/**
 * Format pot description for display
 */
export function formatPotDescription(pots: Pot[]): string {
  if (pots.length === 0) return "Empty pot";
  if (pots.length === 1) {
    return `Main pot: $${pots[0].amount.toLocaleString()}`;
  }

  const parts: string[] = [];
  for (let i = 0; i < pots.length; i++) {
    const label = i === 0 ? "Main pot" : `Side pot ${i}`;
    parts.push(`${label}: $${pots[i].amount.toLocaleString()}`);
  }
  return parts.join(" | ");
}
