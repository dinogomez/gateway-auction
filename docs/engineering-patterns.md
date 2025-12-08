# Gateway Poker - Engineering Patterns

Comprehensive reference for the Gateway Poker codebase architecture, patterns, and implementation details.

---

## Table of Contents

1. [Stack Overview](#stack-overview)
2. [Project Structure](#project-structure)
3. [State Management](#state-management)
4. [Game Flow & State Machine](#game-flow--state-machine)
5. [AI Turn Processing](#ai-turn-processing)
6. [Timer Management](#timer-management)
7. [Animation System](#animation-system)
8. [Web Worker Pattern](#web-worker-pattern)
9. [Pot Management & Side Pots](#pot-management--side-pots)
10. [Hand Evaluation](#hand-evaluation)
11. [Character System](#character-system)
12. [Audio System](#audio-system)
13. [Settings Persistence](#settings-persistence)
14. [API Patterns](#api-patterns)
15. [Rate Limiting](#rate-limiting)
16. [Error Handling](#error-handling)
17. [Adding New Features](#adding-new-features-checklist)
18. [Key Files Reference](#key-files-reference)

---

## Stack Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 16 (App Router) | File-based routing, server components |
| Language | TypeScript (strict mode) | Type safety |
| UI | React 19 + shadcn/ui (53 components) | Component library |
| Styling | Tailwind CSS v4 + CSS variables | Utility-first styling |
| State | Zustand v5 (with persist middleware) | Client-side state management |
| AI | Vercel AI SDK + @ai-sdk/gateway | AI model integration |
| Audio | Howler.js | Sound effects and music |
| Rate Limiting | Upstash Redis + Ratelimit | API protection |
| Odds Calculation | @agonyz/poker-odds-calculator + Web Worker | Non-blocking Monte Carlo |

---

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── actions/                  # Server actions (cached data fetching)
│   │   └── credits.ts            # API credits with unstable_cache
│   ├── api/game/                 # API routes
│   │   ├── poker-think/route.ts  # AI decision streaming endpoint
│   │   ├── summarize-thinking/   # Thinking text summarization
│   │   └── status/route.ts       # Health check
│   └── game/poker/
│       ├── page.tsx              # Main game page (~1400 lines)
│       └── error.tsx             # Error boundary
├── components/
│   ├── ui/                       # shadcn/ui components (don't modify)
│   ├── poker/                    # Game components
│   │   ├── BettingControls.tsx   # Human player controls
│   │   ├── Card.tsx              # Playing card with sprites
│   │   └── DealingAnimation.tsx  # Card deal effects
│   ├── settings/                 # Settings UI
│   │   ├── SettingsModal.tsx     # Main settings panel
│   │   └── MusicIndicator.tsx    # Audio status display
│   └── crt/                      # CRT visual effects
├── stores/
│   ├── pokerStore.ts             # Main game state (~1400 lines)
│   └── settingsStore.ts          # Display/audio settings (persisted)
├── hooks/
│   ├── usePokerThinking.ts       # AI streaming handler
│   ├── useSounds.ts              # Audio management
│   └── useSettings.ts            # Settings accessors
├── lib/
│   ├── poker-odds.ts             # Odds calculation + Web Worker manager
│   ├── poker-odds-worker.ts      # Web Worker for Monte Carlo
│   ├── hand-evaluator.ts         # Poker hand evaluation
│   ├── pot-manager.ts            # Side pot calculation
│   ├── poker-prompts.ts          # AI prompt generation
│   ├── poker-characters.ts       # Character pool & assignment
│   ├── cards.ts                  # Deck operations
│   ├── sounds.ts                 # Howler.js wrapper
│   ├── ratelimit.ts              # Rate limiting logic
│   └── constants.ts              # Timing constants
└── types/
    ├── poker.ts                  # Core game types (~440 lines)
    └── settings.ts               # Settings types
```

---

## State Management

### Pattern: Single Zustand Store Per Domain

No prop drilling. Components subscribe directly to store slices.

```typescript
// src/stores/pokerStore.ts - Store definition
export const usePokerStore = create<PokerStore>((set, get) => ({
  // State
  gameState: null,
  models: [],
  isProcessing: false,

  // Actions (mutate with set())
  processAction: (playerId, action) => {
    const { gameState } = get();
    set({
      gameState: { ...gameState, /* updates */ }
    });
  },

  // Selectors (compute from state)
  isGameOver: () => {
    const { gameState } = get();
    return gameState?.status === "game_over";
  }
}));
```

### Component Usage with useShallow

```typescript
// Prevent unnecessary re-renders with useShallow
import { useShallow } from "zustand/react/shallow";

const { gameState, models, isProcessing } = usePokerStore(
  useShallow((state) => ({
    gameState: state.gameState,
    models: state.models,
    isProcessing: state.isProcessing,
  }))
);

// Actions don't need useShallow (stable references)
const { processAction, advancePhase } = usePokerStore();
```

### Batched State Updates

Always batch related updates to prevent multiple re-renders:

```typescript
// BAD: Two re-renders
setIsProcessing(true);
setLastProcessedTurn(turnKey);

// GOOD: One re-render (use batched action)
setProcessingState: (isProcessing, turnKey) => {
  set({ isProcessing, lastProcessedTurn: turnKey });
}
```

---

## Game Flow & State Machine

### Two-Tier State System

The game uses two complementary state types:

| State Type | Purpose | Values |
|------------|---------|--------|
| `GameStatus` | Broad game state | waiting, dealing, betting, showdown, hand_complete, game_over |
| `GameFlowPhase` | Granular UI control | idle, loading, dealing, awaiting_action, processing_action, action_complete, advancing_phase, awarding_pot, hand_countdown, game_over |

```typescript
// src/types/poker.ts:195-205
export type GameFlowPhase =
  | "idle"                 // No active game
  | "loading"              // Loading screen visible
  | "dealing"              // Cards being dealt animation
  | "awaiting_action"      // Waiting for current player to act
  | "processing_action"    // AI thinking or processing action
  | "action_complete"      // Action processed, brief pause
  | "advancing_phase"      // Moving to flop/turn/river/showdown
  | "awarding_pot"         // Distributing pot to winner(s)
  | "hand_countdown"       // Countdown to next hand
  | "game_over";           // Game finished
```

### Game Progression Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         GAME LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [loading] ──► [dealing] ──► [awaiting_action]                  │
│                                    │                            │
│                    ┌───────────────┼───────────────┐            │
│                    ▼               ▼               ▼            │
│           [processing_action] (human)    (AI thinking)          │
│                    │                                            │
│                    ▼                                            │
│            [action_complete]                                    │
│                    │                                            │
│        ┌──────────┴──────────┐                                  │
│        ▼                     ▼                                  │
│  (more to act)        (round done)                              │
│        │                     │                                  │
│        ▼                     ▼                                  │
│  [awaiting_action]   [advancing_phase]                          │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│         (flop)          (turn/river)    (showdown)              │
│              │               │               │                  │
│              └───────────────┴───────┬───────┘                  │
│                                      ▼                          │
│                              [awarding_pot]                     │
│                                      │                          │
│                                      ▼                          │
│                             [hand_countdown]                    │
│                                      │                          │
│                  ┌───────────────────┼───────────────────┐      │
│                  ▼                                       ▼      │
│            (more hands)                            [game_over]  │
│                  │                                              │
│                  └──────────► [dealing]                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase Transitions (src/stores/pokerStore.ts:895-913)

```typescript
transitionTo: (phase) => {
  const { gameState } = get();
  if (!gameState) return;

  set({
    gameState: { ...gameState, flowPhase: phase }
  });
}
```

---

## AI Turn Processing

### Architecture Overview

```
┌──────────────────┐     ┌───────────────────┐     ┌──────────────┐
│   page.tsx       │────►│ usePokerThinking  │────►│ API Route    │
│   (effect)       │     │   (hook)          │     │ poker-think  │
└──────────────────┘     └───────────────────┘     └──────────────┘
        │                         │                       │
        │                         ▼                       ▼
        │                ┌───────────────────┐    ┌──────────────┐
        │                │  pokerStore.ts    │    │ AI Gateway   │
        │                │  (state updates)  │    │ (streaming)  │
        │                └───────────────────┘    └──────────────┘
        │                         │
        └─────────────────────────┘
```

### Hook: usePokerThinking (src/hooks/usePokerThinking.ts)

**Design**: Thin hook with no local state - delegates everything to Zustand.

```typescript
const processAITurn = async (model, context) => {
  // 1. Cancel previous request
  abortControllerRef.current?.abort();
  abortControllerRef.current = new AbortController();

  // 2. Add THINKING entry to action log
  startThinking(model.id);

  // 3. Stream API call
  const response = await fetch("/api/game/poker-think", {
    method: "POST",
    body: JSON.stringify({ modelId: model.id, context }),
    signal: abortControllerRef.current.signal,
  });

  // 4. Collect streamed response
  const reader = response.body.getReader();
  let fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += new TextDecoder().decode(value);
  }

  // 5. Parse action from response
  const action = parsePokerAction(fullText, constraints);

  // 6. Process action in game state
  processAction(model.id, action ?? { type: "fold" });

  // 7. Complete thinking (transforms THINKING → ACTION entry)
  completeThinking(model.id, action, fullText);

  return action;
};
```

### Action Parsing (src/lib/poker-prompts.ts:125-192)

Regex-based parser extracts actions from unstructured AI text:

```typescript
// Regex pattern for all action types
const actionRegex = /ACTION:\s*(FOLD|CHECK|CALL|RAISE\s*\$?([\d,]+)|ALL[- ]?IN)/i;

// Validation logic:
// - Prevents invalid actions (check when bet exists → converts to call)
// - Enforces minimum raise amounts
// - Caps raises at player's chip stack (all-in)
```

### Summary Fetching with Race Condition Prevention

```typescript
// src/stores/pokerStore.ts - Module-level sequence counter
let summarySequence = 0;
const SUMMARY_TIMEOUT_MS = 5000;

async function fetchSummaryAndAddAction(...) {
  const mySequence = ++summarySequence;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

  const response = await fetch("/api/game/summarize-thinking", {
    signal: controller.signal,
    // ...
  });

  clearTimeout(timeoutId);

  // Only update if this is still the latest request
  if (mySequence !== summarySequence) return;

  // Update action log entry...
}
```

---

## Timer Management

### Deadline-Based Approach

**Problem**: Traditional `setInterval` updates state every second, causing unnecessary re-renders.

**Solution**: Store deadline timestamp, calculate remaining time on demand.

```typescript
// src/app/game/poker/page.tsx:282-395

// Store deadline (epoch ms), not countdown value
const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
const [turnTimer, setTurnTimer] = useState<number>(TURN_TIMER_SECONDS);

// When player's turn starts:
setTurnDeadline(Date.now() + TURN_TIMER_SECONDS * 1000);

// Display interval calculates from deadline
turnDisplayIntervalRef.current = setInterval(() => {
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  setTurnTimer(remaining);
}, 1000);

// Auto-action timeout (single setTimeout, not interval)
turnTimerRef.current = setTimeout(() => {
  // Validate still same turn before auto-folding
  if (currentGameState.currentPlayerIndex !== expectedPlayerIndex) return;
  if (currentGameState.handNumber !== expectedHandNumber) return;

  // Auto-fold
  processAction(humanPlayerId, { type: "fold" });
}, TURN_TIMER_SECONDS * 1000);
```

### Timer Constants (src/lib/constants.ts)

```typescript
// Turn timer
export const TURN_TIMER_SECONDS = 30;
export const TURN_WARNING_THRESHOLD = 15;  // Warning sound at 15s

// Action delays (ms)
export const ACTION_DELAY_MS = 1500;
export const CHIP_CHANGE_ANIMATION_MS = 2500;
export const NEXT_HAND_DELAY_MS = 2000;
export const CARD_REVEAL_BASE_DELAY_MS = 2000;

// Loading screen phases (ms)
export const LOADING_GAME_INIT_MS = 1200;
export const LOADING_PHASE_PREPARING_MS = 3500;
export const LOADING_PHASE_DONE_MS = 5200;
export const LOADING_EXIT_MS = 6000;
```

---

## Animation System

### Card Dealing Animation (src/app/game/poker/page.tsx:206-280)

**Strategy**: Sequential reveals with timer tracking to prevent race conditions.

```typescript
// State
const [isDealing, setIsDealing] = useState(false);
const [revealedPlayers, setRevealedPlayers] = useState<Set<string>>(new Set());
const lastHandNumberRef = useRef<number>(0);
const dealingTimersRef = useRef<NodeJS.Timeout[]>([]);
const isDealingRef = useRef(false);  // Sync ref for immediate checks

// Effect triggers on hand number change
useEffect(() => {
  if (!gameState || showLoading) return;
  if (gameState.handNumber === lastHandNumberRef.current) return;
  if (isDealingRef.current) return;  // Prevent double-trigger

  lastHandNumberRef.current = gameState.handNumber;
  isDealingRef.current = true;
  setIsDealing(true);
  setRevealedPlayers(new Set());

  // Clear existing timers
  dealingTimersRef.current.forEach(clearTimeout);
  dealingTimersRef.current = [];

  const cardDelay = 200;  // ms between cards
  let cardIndex = 0;

  playerOrder.forEach((playerId) => {
    const revealDelay = cardIndex * cardDelay;

    // First card
    const timer1 = setTimeout(() => {
      playDealSound();
      setRevealedPlayers(prev => new Set([...prev, playerId]));
    }, revealDelay);
    dealingTimersRef.current.push(timer1);

    // Second card sound
    const timer2 = setTimeout(() => playDealSound(), (cardIndex + 1) * cardDelay);
    dealingTimersRef.current.push(timer2);

    cardIndex += 2;
  });

  // Mark complete
  const totalCards = playerOrder.length * 2;
  const completeTimer = setTimeout(() => {
    setIsDealing(false);
    isDealingRef.current = false;
  }, totalCards * cardDelay + 300);
  dealingTimersRef.current.push(completeTimer);
}, [gameState?.handNumber, showLoading, displayOrder]);

// Cleanup on unmount
useEffect(() => {
  return () => dealingTimersRef.current.forEach(clearTimeout);
}, []);
```

### Chip Change Animation (src/app/game/poker/page.tsx:297-369)

```typescript
const [chipChanges, setChipChanges] = useState<
  Record<string, { amount: number; percent: number; key: number }>
>({});
const prevChipStacksRef = useRef<Record<string, number>>({});
const changeKeyRef = useRef(0);

useEffect(() => {
  if (!gameState) return;

  const newChanges: typeof chipChanges = {};

  for (const [playerId, state] of Object.entries(gameState.playerStates)) {
    const prevStack = prevChipStacksRef.current[playerId];
    const currentStack = state.chipStack;

    if (prevStack !== undefined && prevStack !== currentStack) {
      const change = currentStack - prevStack;
      const percent = (change / prevStack) * 100;

      newChanges[playerId] = {
        amount: change,
        percent,
        key: ++changeKeyRef.current  // Unique key triggers animation
      };
    }

    prevChipStacksRef.current[playerId] = currentStack;
  }

  if (Object.keys(newChanges).length > 0) {
    setChipChanges(prev => ({ ...prev, ...newChanges }));

    // Clear after animation duration
    setTimeout(() => {
      setChipChanges(prev => {
        const filtered = { ...prev };
        for (const playerId of Object.keys(newChanges)) {
          if (filtered[playerId]?.key === newChanges[playerId].key) {
            delete filtered[playerId];
          }
        }
        return filtered;
      });
    }, CHIP_CHANGE_ANIMATION_MS);
  }
}, [gameState?.playerStates]);
```

### Loading Screen Phases

```typescript
// Phase transitions during loading
const [loadingPhase, setLoadingPhase] = useState<"shuffling" | "preparing" | "done">("shuffling");

// Timed transitions
setTimeout(() => setLoadingPhase("preparing"), LOADING_PHASE_PREPARING_MS);  // 3500ms
setTimeout(() => setLoadingPhase("done"), LOADING_PHASE_DONE_MS);            // 5200ms
setTimeout(() => setShowLoading(false), LOADING_EXIT_MS);                     // 6000ms
setTimeout(() => initializeGame(), LOADING_EXIT_MS + 400);                    // 6400ms
```

---

## Web Worker Pattern

### Problem

Monte Carlo odds calculation blocks the main thread for 50-200ms+, causing UI freezes.

### Solution

Offload calculation to a Web Worker running in a separate thread.

```
Main Thread                         Worker Thread
     │                                    │
     ├─► calculateOddsAsync()             │
     │       └─► postMessage(cards) ─────►│
     │                                    ├─► OddsCalculator.calculate()
     │   (UI keeps rendering smoothly)    │   (50-200ms, doesn't block main)
     │                                    │
     │   ◄── postMessage(results) ────────┤
     └─► set({ playerOdds })              │
```

### Implementation

**Worker Manager (src/lib/poker-odds.ts:8-129)**

```typescript
// Singleton worker
let oddsWorker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve, reject }>();

function getOddsWorker(): Worker | null {
  if (typeof window === "undefined") return null;  // SSR guard

  if (!oddsWorker) {
    oddsWorker = new Worker(
      new URL("./poker-odds-worker.ts", import.meta.url),
      { type: "module" }
    );

    oddsWorker.onmessage = (event) => {
      const { requestId: respId, results } = event.data;
      const pending = pendingRequests.get(respId);
      if (pending) {
        pendingRequests.delete(respId);
        pending.resolve(results);
      }
    };

    oddsWorker.onerror = () => {
      // Reject all pending, reset worker
      pendingRequests.forEach(p => p.reject(new Error("Worker error")));
      pendingRequests.clear();
      oddsWorker?.terminate();
      oddsWorker = null;
    };
  }

  return oddsWorker;
}

export async function calculateOddsAsync(players, communityCards): Promise<PlayerOdds[]> {
  const worker = getOddsWorker();

  // Fallback to sync for SSR or worker failure
  if (!worker) return calculateOdds(players, communityCards);

  const currentRequestId = ++requestId;

  return new Promise((resolve) => {
    // 5s timeout with fallback
    const timeout = setTimeout(() => {
      pendingRequests.delete(currentRequestId);
      resolve(players.map(p => ({
        playerId: p.playerId,
        winPercentage: 100 / players.length,
        tiePercentage: 0,
      })));
    }, 5000);

    pendingRequests.set(currentRequestId, {
      resolve: (results) => { clearTimeout(timeout); resolve(results); },
      reject: () => { clearTimeout(timeout); /* fallback handled by timeout */ }
    });

    worker.postMessage({ type: "calculate", players, communityCards, requestId: currentRequestId });
  });
}
```

**Worker File (src/lib/poker-odds-worker.ts)**

```typescript
import { CardGroup, OddsCalculator } from "@agonyz/poker-odds-calculator";

self.onmessage = (event) => {
  const { type, players, communityCards, requestId } = event.data;

  if (type !== "calculate") return;

  try {
    const playerHands = players.map(p => CardGroup.fromString(cardsToString(p.holeCards)));
    const board = communityCards.length > 0
      ? CardGroup.fromString(cardsToString(communityCards))
      : null;

    // This is the expensive operation (~50-200ms)
    const result = OddsCalculator.calculate(playerHands, board || undefined);

    const results = players.map((player, index) => ({
      playerId: player.playerId,
      winPercentage: result.equities[index]?.getEquity() ?? 0,
      tiePercentage: result.equities[index]?.getTiePercentage() ?? 0,
    }));

    self.postMessage({ type: "result", requestId, results });
  } catch (error) {
    // Return equal odds on error
    self.postMessage({
      type: "error",
      requestId,
      results: players.map(p => ({
        playerId: p.playerId,
        winPercentage: 100 / players.length,
        tiePercentage: 0,
      })),
    });
  }
};
```

**Store Integration (src/stores/pokerStore.ts:1121-1182)**

```typescript
updateOddsAndHands: async () => {
  const { gameState } = get();
  if (!gameState) return;

  const activePlayers = gameState.players.filter(p =>
    gameState.playerStates[p.id].status !== "folded"
  );

  // Non-blocking: runs in Web Worker thread
  const odds = await calculateOddsAsync(
    activePlayers.map(p => ({
      playerId: p.id,
      holeCards: gameState.playerStates[p.id].holeCards,
    })),
    gameState.communityCards,
  );

  set({ playerOdds: odds.reduce((acc, o) => ({ ...acc, [o.playerId]: o }), {}) });
}
```

---

## Pot Management & Side Pots

### Why Side Pots?

When players go all-in for different amounts, they can only win proportional pots.

**Example**: 3 players all-in at $100, $200, $300
- Main Pot: $100 × 3 = $300 (all 3 eligible)
- Side Pot 1: $100 × 2 = $200 (only $200 and $300 players eligible)
- Side Pot 2: $100 × 1 = $100 (only $300 player eligible)

### Calculation (src/lib/pot-manager.ts:9-62)

```typescript
export function calculatePots(playerStates: Record<string, PokerPlayerState>): Pot[] {
  const players = Object.values(playerStates);
  const pots: Pot[] = [];

  // Get unique bet amounts (sorted ascending)
  const betAmounts = [...new Set(players.map(p => p.totalBetThisHand))]
    .filter(b => b > 0)
    .sort((a, b) => a - b);

  let previousLevel = 0;

  for (const level of betAmounts) {
    const contribution = level - previousLevel;

    // Players who contributed at least this level
    const contributors = players.filter(p => p.totalBetThisHand >= level);
    const potAmount = contribution * contributors.length;

    // Only non-folded players eligible to win
    const eligiblePlayers = contributors
      .filter(p => p.status !== "folded")
      .map(p => p.playerId);

    if (potAmount > 0 && eligiblePlayers.length > 0) {
      pots.push({
        amount: potAmount,
        eligiblePlayers,
        isMainPot: pots.length === 0,
      });
    }

    previousLevel = level;
  }

  return pots;
}
```

### Distribution (src/lib/pot-manager.ts:78-117)

```typescript
export function distributePots(
  pots: Pot[],
  playerHands: Map<string, EvaluatedHand>,
): Map<string, number> {
  const winnings = new Map<string, number>();

  for (const pot of pots) {
    // Find best hand among eligible players
    let bestScore = -1;
    let potWinners: string[] = [];

    for (const playerId of pot.eligiblePlayers) {
      const hand = playerHands.get(playerId);
      if (!hand) continue;

      if (hand.score > bestScore) {
        bestScore = hand.score;
        potWinners = [playerId];
      } else if (hand.score === bestScore) {
        potWinners.push(playerId);  // Tie
      }
    }

    // Split pot among winners
    const share = Math.floor(pot.amount / potWinners.length);
    const remainder = pot.amount % potWinners.length;

    potWinners.forEach((winnerId, i) => {
      const extra = i < remainder ? 1 : 0;  // First players get remainder chips
      winnings.set(winnerId, (winnings.get(winnerId) || 0) + share + extra);
    });
  }

  return winnings;
}
```

---

## Hand Evaluation

### Algorithm (src/lib/hand-evaluator.ts)

**Strategy**: Generate all 21 possible 5-card combinations from 7 cards (2 hole + 5 community), evaluate each, return best.

```typescript
export function evaluateHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  const allCards = [...holeCards, ...communityCards];

  let bestHand: EvaluatedHand | null = null;

  // Generate all C(7,5) = 21 combinations
  for (const combo of combinations(allCards, 5)) {
    const evaluated = evaluate5Cards(combo);

    if (!bestHand || evaluated.score > bestHand.score) {
      bestHand = evaluated;
    }
  }

  return bestHand!;
}
```

### Hand Rankings

| Rank | Value | Score Range |
|------|-------|-------------|
| Royal Flush | 10 | 10,000,000+ |
| Straight Flush | 9 | 9,000,000+ |
| Four of a Kind | 8 | 8,000,000+ |
| Full House | 7 | 7,000,000+ |
| Flush | 6 | 6,000,000+ |
| Straight | 5 | 5,000,000+ |
| Three of a Kind | 4 | 4,000,000+ |
| Two Pair | 3 | 3,000,000+ |
| Pair | 2 | 2,000,000+ |
| High Card | 1 | 1,000,000+ |

Score formula: `rank * 1,000,000 + kicker_values` for tiebreaking.

---

## Character System

### Character Pool (src/lib/poker-characters.ts)

**42 unique characters** organized by category with weighted selection:

| Category | Examples | Weight |
|----------|----------|--------|
| Fantasy/Fiction | Sherlock, Yoda, Gandalf, Jack Sparrow | 1.0 |
| Scientists | Einstein, Tesla, Ada Lovelace, Marie Curie | 1.0 |
| Entertainers | Beyoncé, Gordon Ramsay, Bob Ross | 1.0 |
| Anime | Goku, Naruto, Saitama, All Might, Pikachu | 1.0 |
| Tech/Business (Rare) | Elon Musk, Jeff Bezos, Evan You | 0.15 |
| Sports (Rare) | Max Verstappen | 0.15 |

### Weighted Selection (src/lib/poker-characters.ts:335-361)

```typescript
function weightedRandomSelect(
  characters: PokerCharacter[],
  excludeIds: Set<string>,
): PokerCharacter | null {
  const available = characters.filter(c => !excludeIds.has(c.id));

  // Calculate total weight
  const totalWeight = available.reduce(
    (sum, char) => sum + (char.weight ?? 1.0),
    0
  );

  // Pick random point in weight space
  let random = Math.random() * totalWeight;

  for (const char of available) {
    random -= (char.weight ?? 1.0);
    if (random <= 0) return char;
  }

  return available[0];
}
```

### Assignment (src/stores/pokerStore.ts:172-202)

```typescript
setModels: (models, humanPlayerId) => {
  // Assign unique characters to each model
  const characterMap = assignCharactersToModels(models.map(m => m.id));

  // Randomize display order (so position doesn't reveal model identity)
  const displayOrder = randomizePlayerOrder(models.map(m => m.id));

  set({ models, humanPlayerId, characterMap, displayOrder });
}
```

### Display Resolution

```typescript
getDisplayName: (playerId) => {
  const { isRevealed, characterMap, models } = get();

  if (isRevealed) {
    // Game over: show real model names
    return models.find(m => m.id === playerId)?.name || "Unknown";
  }

  // During game: show character names
  return characterMap[playerId]?.name || "Unknown";
}
```

---

## Audio System

### Architecture (src/lib/sounds.ts)

**Lazy Loading**: Sounds are created on first use, not at startup.

```typescript
// Module-level state
const soundCache: Partial<Record<SoundName, Howl>> = {};
let bgMusic: Howl | null = null;
let soundsInitialized = false;

const volumeSettings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.7,
};

// Lazy creation
function getOrCreateSound(name: SoundName): Howl {
  if (!soundCache[name]) {
    const categoryVolume = soundCategories[name] === "music"
      ? volumeSettings.music
      : volumeSettings.sfx;

    soundCache[name] = new Howl({
      src: [soundPaths[name]],
      volume: baseVolumes[name] * categoryVolume * volumeSettings.master,
    });
  }
  return soundCache[name]!;
}
```

### Sound Categories

| Category | Sounds | Base Volume |
|----------|--------|-------------|
| SFX | call, raise, fold, check, allIn, victory, load, deal1, deal2 | 0.3-0.6 |
| Music | bg-music, main-menu | 0.3 |

### Hook Integration (src/hooks/useSounds.ts)

```typescript
export function useSounds() {
  const audioSettings = useSettingsStore(state => state.audio);

  // Initialize once
  useEffect(() => {
    if (!isSoundsInitialized()) {
      initSounds();
    }
  }, []);

  // Sync volume changes from settings
  useEffect(() => {
    if (isSoundsInitialized()) {
      setVolumeSettings({
        master: audioSettings.masterVolume,
        music: audioSettings.musicVolume,
        sfx: audioSettings.sfxVolume,
      });
    }
  }, [audioSettings]);

  return {
    play: (name: SoundName) => playSound(name),
    playDeal: () => playDealSound(),
    startMusic: () => startBackgroundMusic(),
    stopMusic: () => stopBackgroundMusic(),
    stopAll: () => stopAllSounds(),
  };
}
```

### Hydration Protection

Music must wait for localStorage mute state to load:

```typescript
// src/hooks/useSounds.ts:97-129
export function useHydratedMusicStart(startFn, stopFn) {
  useEffect(() => {
    const unsubscribe = onHydrated(() => {
      const currentMuted = useSettingsStore.getState().audio.isMuted;
      if (!currentMuted) {
        startFn();
      }
    });
    return () => {
      unsubscribe();
      stopFn();
    };
  }, []);
}
```

---

## Settings Persistence

### Store with Persist Middleware (src/stores/settingsStore.ts)

```typescript
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      display: DEFAULT_DISPLAY_SETTINGS,
      audio: DEFAULT_AUDIO_SETTINGS,

      setDisplaySetting: (key, value) =>
        set({ display: { ...get().display, [key]: value } }),

      setAudioSetting: (key, value) => {
        set({ audio: { ...get().audio, [key]: value } });
        // Sync to Howler immediately
        if (key === "isMuted") setHowlerMuted(value);
      },
    }),
    {
      name: "gateway-poker-settings",  // localStorage key
      partialize: (state) => ({        // Only persist these fields
        display: state.display,
        audio: state.audio,
      }),
      onRehydrateStorage: () => (state) => {
        isHydrated = true;
        if (state?.audio?.isMuted) {
          setHowlerMuted(true);
        }
        // Notify waiting callbacks
        hydrationCallbacks.forEach(cb => cb());
        hydrationCallbacks.clear();
      },
    }
  )
);
```

### Hydration Callbacks

```typescript
// Module-level tracking
let isHydrated = false;
const hydrationCallbacks = new Set<() => void>();

export function onHydrated(callback: () => void): () => void {
  if (isHydrated) {
    callback();  // Already loaded
    return () => {};
  }
  hydrationCallbacks.add(callback);
  return () => hydrationCallbacks.delete(callback);
}
```

### Default Settings (src/types/settings.ts)

```typescript
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  crtEnabled: false,
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  isMuted: false,
};
```

---

## API Patterns

### Structure (src/app/api/game/poker-think/route.ts)

```typescript
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

// 1. Define Zod schemas
const RequestBodySchema = z.object({
  modelId: z.string().min(1),
  context: PokerAgentContextSchema,
});

export async function POST(req: Request) {
  // 2. Get IP for rate limiting
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";

  // 3. Validate request
  const body = await req.json();
  const parseResult = RequestBodySchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parseResult.error.flatten() }),
      { status: 400 }
    );
  }

  // 4. Check rate limits
  const rateLimitResult = await checkAllRateLimits(ip, modelId);
  if (!rateLimitResult.success) {
    return new Response(
      JSON.stringify({ error: rateLimitResult.error }),
      { status: 429 }
    );
  }

  // 5. Stream AI response
  const result = streamText({
    model: gateway(modelId),
    system: POKER_SYSTEM_PROMPT,
    prompt: generatePokerPrompt(context),
    maxOutputTokens: 80,
    temperature: 0.3,
  });

  return result.toTextStreamResponse();
}
```

### Server Actions with Caching

```typescript
// src/app/actions/credits.ts
"use server";

import { unstable_cache } from "next/cache";

const fetchCreditsFromAPI = async () => {
  const response = await fetch("https://api.example.com/credits", {
    headers: { Authorization: `Bearer ${process.env.API_KEY}` },
  });
  return response.json();
};

// Cache for 4 hours
const getCachedCredits = unstable_cache(
  fetchCreditsFromAPI,
  ["credits-cache-key"],
  { revalidate: 14400 }
);

export async function getCredits() {
  return getCachedCredits();
}
```

---

## Rate Limiting

### Three-Layer System (src/lib/ratelimit.ts)

| Layer | Limit | Purpose |
|-------|-------|---------|
| Per-IP | 60/minute | Prevent individual abuse |
| Per-Game | 50/10 minutes | Prevent runaway games |
| Global | 500/hour | Budget protection ($20 limit) |

```typescript
export const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "auction:ip",
});

export const gameRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, "10 m"),
  prefix: "auction:game",
});

export const globalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(500, "1 h"),
  prefix: "auction:global",
});
```

### Composite Check

```typescript
export async function checkAllRateLimits(ip: string, gameId: string) {
  const [ipResult, gameResult, globalResult] = await Promise.all([
    ipRatelimit.limit(ip),
    gameRatelimit.limit(gameId),
    globalRatelimit.limit("global"),
  ]);

  // Global is most critical
  if (!globalResult.success) {
    return {
      success: false,
      error: `Global rate limit reached. Try again in ${Math.ceil(resetIn / 60)} minutes!`,
    };
  }

  // Then per-game, then per-IP
  // Returns remaining counts for monitoring
  return { success: true, remaining: { ip, game, global } };
}
```

---

## Error Handling

### Layers

1. **API**: Zod validation + try-catch + HTTP status codes
2. **Components**: React Error Boundaries (src/app/game/poker/error.tsx)
3. **Async**: Try-catch with fallback behavior

### Error Boundary

```typescript
// src/app/game/poker/error.tsx
"use client";

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### Graceful Fallbacks

```typescript
// AI action parsing - default to fold
const action = parsePokerAction(fullText, constraints);
if (!action) {
  console.warn(`Could not parse action, defaulting to fold`);
  return { type: "fold" };
}

// Odds calculation - equal odds on error
try {
  return await calculateOddsAsync(players, cards);
} catch {
  return players.map(p => ({
    playerId: p.playerId,
    winPercentage: 100 / players.length,
    tiePercentage: 0,
  }));
}
```

---

## Adding New Features Checklist

1. **Types**: Define interfaces in `src/types/`
2. **State**: Add to appropriate Zustand store
   - Game state → `pokerStore.ts`
   - User preferences → `settingsStore.ts` (with persist)
3. **Data Fetching**:
   - Cached external data → Server Action in `src/app/actions/`
   - Streaming/rate-limited → API Route in `src/app/api/`
4. **Components**: Build in `src/components/` using shadcn/ui primitives
5. **Hooks**: Extract reusable logic to `src/hooks/`
6. **Sounds**: Add MP3 to `public/assets/sounds/`, update `SOUND_CONFIG`
7. **Settings**: Add to `settingsStore` if user-configurable
8. **Heavy Computation**: Consider Web Worker (see poker-odds pattern)

---

## Key Files Reference

| Concern | File | Key Lines |
|---------|------|-----------|
| Game State | `src/stores/pokerStore.ts` | Full store (~1400 lines) |
| Settings State | `src/stores/settingsStore.ts` | Persist middleware |
| Game Types | `src/types/poker.ts` | GameFlowPhase (195-205) |
| AI Thinking | `src/hooks/usePokerThinking.ts` | processAITurn (23-118) |
| AI Prompts | `src/lib/poker-prompts.ts` | parsePokerAction (125-192) |
| Odds Calculation | `src/lib/poker-odds.ts` | Web Worker manager |
| Odds Worker | `src/lib/poker-odds-worker.ts` | Monte Carlo thread |
| Hand Evaluation | `src/lib/hand-evaluator.ts` | evaluate5Cards, determineWinners |
| Pot Management | `src/lib/pot-manager.ts` | calculatePots (9-62), distributePots (78-117) |
| Characters | `src/lib/poker-characters.ts` | weightedRandomSelect (335-361) |
| Sound System | `src/lib/sounds.ts` | Lazy loading, volume sync |
| Rate Limiting | `src/lib/ratelimit.ts` | checkAllRateLimits (47-115) |
| Constants | `src/lib/constants.ts` | All timing values |
| Main Game Page | `src/app/game/poker/page.tsx` | Timer (282-395), Animations (206-280) |
| AI API Route | `src/app/api/game/poker-think/route.ts` | Streaming endpoint |
| Credits Cache | `src/app/actions/credits.ts` | unstable_cache usage |
