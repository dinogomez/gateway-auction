import { CardGroup, OddsCalculator } from "@agonyz/poker-odds-calculator";
import type { Card } from "@/types/poker";

// =============================================================================
// WEB WORKER SINGLETON FOR OFF-THREAD CALCULATION
// =============================================================================

let oddsWorker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<
  number,
  {
    resolve: (results: PlayerOdds[]) => void;
    reject: (error: Error) => void;
  }
>();

/**
 * Get or create the odds calculation Web Worker
 */
function getOddsWorker(): Worker | null {
  if (typeof window === "undefined") return null;

  if (!oddsWorker) {
    try {
      // Create worker from the worker file
      oddsWorker = new Worker(
        new URL("./poker-odds-worker.ts", import.meta.url),
        { type: "module" },
      );

      oddsWorker.onmessage = (event) => {
        const { type, requestId: respId, results, error } = event.data;
        const pending = pendingRequests.get(respId);
        if (pending) {
          pendingRequests.delete(respId);
          if (type === "error" && error) {
            console.warn("Odds calculation error (using fallback):", error);
          }
          if (results) {
            pending.resolve(results);
          } else {
            pending.reject(new Error(error || "No results"));
          }
        }
      };

      oddsWorker.onerror = (error) => {
        console.error("Odds worker error:", error);
        // Reject all pending requests
        pendingRequests.forEach((pending) => {
          pending.reject(new Error("Worker error"));
        });
        pendingRequests.clear();
        // Terminate and reset worker
        oddsWorker?.terminate();
        oddsWorker = null;
      };
    } catch (e) {
      console.warn("Failed to create odds worker:", e);
      return null;
    }
  }

  return oddsWorker;
}

/**
 * Calculate odds asynchronously using Web Worker (non-blocking)
 * Falls back to synchronous calculation if worker unavailable
 */
export async function calculateOddsAsync(
  players: Array<{ playerId: string; holeCards: Card[] }>,
  communityCards: Card[],
): Promise<PlayerOdds[]> {
  const worker = getOddsWorker();

  // Fallback to sync if worker unavailable (SSR or worker creation failed)
  if (!worker) {
    return calculateOdds(players, communityCards);
  }

  const currentRequestId = ++requestId;

  return new Promise((resolve, reject) => {
    // Timeout after 5 seconds
    const timeout = setTimeout(() => {
      pendingRequests.delete(currentRequestId);
      // Fallback to equal odds on timeout
      const equalOdds = 100 / players.length;
      resolve(
        players.map((p) => ({
          playerId: p.playerId,
          winPercentage: equalOdds,
          tiePercentage: 0,
        })),
      );
    }, 5000);

    pendingRequests.set(currentRequestId, {
      resolve: (results) => {
        clearTimeout(timeout);
        resolve(results);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    worker.postMessage({
      type: "calculate",
      players,
      communityCards,
      requestId: currentRequestId,
    });
  });
}

/**
 * Terminate the odds worker (for cleanup)
 */
export function terminateOddsWorker(): void {
  if (oddsWorker) {
    oddsWorker.terminate();
    oddsWorker = null;
    pendingRequests.clear();
  }
}

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
