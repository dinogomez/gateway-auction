# PRD: AI Poker Evaluation Game — Persistent Games & Real-Time Leaderboard

## Overview

A Texas Hold'em poker game where AI models compete against each other to evaluate strategic reasoning, risk assessment, and decision-making under uncertainty. Ranked games are **AI-only** to ensure unbiased evaluation data. Games run autonomously on the server and persist across browser sessions. A separate practice mode (already implemented) allows humans to play against AI locally.

---

## Current Stack (Practice Mode)

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

## New Stack Additions (Ranked Mode)

| Layer | Technology | Purpose |
|-------|------------|---------|
| Database | Convex | Real-time persistent game state |
| Scheduling | Convex Scheduler | Autonomous game loop, timeouts |
| Real-time | Convex Subscriptions | Live leaderboard, game spectating |

---

## Goals

1. **Fair Evaluation** — All models play under identical conditions with enforced time limits
2. **Persistent Games** — Games continue server-side regardless of client connection
3. **Real-Time Visibility** — Live leaderboard and game spectating
4. **Comprehensive Analytics** — Track performance metrics beyond just win/loss

---

## Existing Architecture Patterns

### Two-Tier State System (from Practice Mode)

The game uses two complementary state types that should be preserved in Ranked Mode:

| State Type | Purpose | Values |
|------------|---------|--------|
| `GameStatus` | Broad game state | waiting, dealing, betting, showdown, hand_complete, game_over |
| `GameFlowPhase` | Granular UI control | idle, loading, dealing, awaiting_action, processing_action, action_complete, advancing_phase, awarding_pot, hand_countdown, game_over |

```typescript
// src/types/poker.ts
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

### Existing Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── actions/                  # Server actions (cached data fetching)
│   ├── api/game/                 # API routes
│   │   ├── poker-think/route.ts  # AI decision streaming endpoint
│   │   ├── summarize-thinking/   # Thinking text summarization
│   │   └── status/route.ts       # Health check
│   └── game/poker/
│       ├── page.tsx              # Main game page
│       └── error.tsx             # Error boundary
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── poker/                    # Game components
│   └── settings/                 # Settings UI
├── stores/
│   ├── pokerStore.ts             # Main game state (Practice Mode)
│   └── settingsStore.ts          # Display/audio settings (persisted)
├── hooks/
│   ├── usePokerThinking.ts       # AI streaming handler
│   ├── useSounds.ts              # Audio management
│   └── useSettings.ts            # Settings accessors
├── lib/
│   ├── poker-odds.ts             # Odds calculation + Web Worker manager
│   ├── poker-odds-worker.ts      # Web Worker for Monte Carlo
│   ├── hand-evaluator.ts         # Poker hand evaluation
│   ├── pot-manager.ts            # Side pot calculation (REUSE FOR RANKED)
│   ├── poker-prompts.ts          # AI prompt generation
│   ├── poker-characters.ts       # Character pool & assignment
│   ├── cards.ts                  # Deck operations
│   ├── sounds.ts                 # Howler.js wrapper
│   ├── ratelimit.ts              # Rate limiting logic
│   └── constants.ts              # Timing constants
├── types/
│   └── poker.ts                  # Core game types
└── convex/                       # NEW: Convex backend for Ranked Mode
    ├── schema.ts
    ├── games.ts
    ├── models.ts
    └── leaderboard.ts
```

### Existing Timer Constants (src/lib/constants.ts)

```typescript
export const TURN_TIMER_SECONDS = 30;
export const TURN_WARNING_THRESHOLD = 15;
export const ACTION_DELAY_MS = 1500;
export const CHIP_CHANGE_ANIMATION_MS = 2500;
export const NEXT_HAND_DELAY_MS = 2000;
```

### Character System (Existing)

42 unique characters with weighted selection — models get random personas each game:

| Category | Examples | Weight |
|----------|----------|--------|
| Fantasy/Fiction | Sherlock, Yoda, Gandalf, Jack Sparrow | 1.0 |
| Scientists | Einstein, Tesla, Ada Lovelace | 1.0 |
| Entertainers | Beyoncé, Gordon Ramsay, Bob Ross | 1.0 |
| Anime | Goku, Naruto, Saitama, Pikachu | 1.0 |
| Tech/Business (Rare) | Elon Musk, Jeff Bezos | 0.15 |

Model names revealed only at game end.

---

## Poker Rules Implementation Checklist

### Blinds & Dealer Button

| Rule | Description |
|------|-------------|
| [ ] Dealer button rotation | Button moves clockwise each hand |
| [ ] Small blind position | First player left of dealer |
| [ ] Big blind position | Second player left of dealer |
| [ ] Heads-up blinds | Dealer posts SB, other player posts BB; dealer acts first preflop, last post-flop |
| [ ] Dead button | When player busts, button still moves (don't skip positions) |
| [ ] Posting blinds | Blinds are forced bets, posted before cards dealt |

### Betting Rules

| Rule | Description |
|------|-------------|
| [ ] Check | Only valid when no bet to call |
| [ ] Call | Match the current bet exactly |
| [ ] Minimum raise | Must be at least the size of the previous raise/bet |
| [ ] Raise sizing | Raise amount = call amount + raise increment (at least 1 BB or previous raise size) |
| [ ] All-in | Can bet any amount up to total stack |
| [ ] All-in for less | If you can't match a bet, you can still go all-in for less |
| [ ] Reopening betting | An all-in that's less than a full raise does NOT reopen betting for players who already acted |
| [ ] Big blind option | If everyone just calls preflop, BB can still raise |
| [ ] Bet closes action | Round ends when all players have acted AND all bets are equal |
| [ ] Can't raise yourself | If you bet and no one raises, you can't raise again that round |

### All-In & Side Pots

| Rule | Description |
|------|-------------|
| [ ] Main pot | All-in player can only win up to their contribution × number of callers |
| [ ] Side pot creation | When player is all-in, additional bets go to side pot |
| [ ] Multiple side pots | Each all-in player at different stack creates new side pot |
| [ ] Side pot eligibility | Player can only win pots they contributed to |
| [ ] Distribution order | Side pots awarded first (highest to lowest), then main pot |

### Hand Evaluation

| Rule | Description |
|------|-------------|
| [ ] Best 5 of 7 | Use best 5-card hand from 2 hole cards + 5 community |
| [ ] Can use 0-2 hole cards | Board can play (use all 5 community cards) |
| [ ] Ace high/low | Ace is high (TJQKA) or low (A2345) for straights only |
| [ ] Wheel straight | A2345 is lowest straight, NOT a "round the corner" wrap |
| [ ] Flush suit doesn't matter | All flushes of same rank are equal (no suit ranking) |
| [ ] Full house ranking | Trips rank first, then pair (KKK22 beats QQQ AA) |
| [ ] Kickers | Unused cards break ties (AK beats AQ on A7532 board) |
| [ ] Split pots | Identical 5-card hands split pot |
| [ ] Odd chips | In split pots, odd chip goes to first player left of dealer |

### Hand Rankings (highest to lowest)

| Rank | Hand | Example |
|------|------|---------|
| 1 | Royal Flush | AKQJT suited |
| 2 | Straight Flush | 98765 suited |
| 3 | Four of a Kind | 7777x |
| 4 | Full House | KKK88 |
| 5 | Flush | Any 5 same suit |
| 6 | Straight | 5 consecutive ranks |
| 7 | Three of a Kind | 999xy |
| 8 | Two Pair | KK77x |
| 9 | One Pair | AA xyz |
| 10 | High Card | Highest unpaired card |

### Showdown

| Rule | Description |
|------|-------------|
| [ ] Showdown trigger | 2+ players remain after final betting round |
| [ ] Show order | Last aggressor shows first; if no bets on river, first to act shows first |
| [ ] Muck option | Losing player can muck (hide) cards instead of showing |
| [ ] Auto-show all-in | If all players are all-in, all hands revealed immediately |
| [ ] Best hand wins | If only one player remains (all others folded), they win without showing |

### Gameplay Flow

| Rule | Description |
|------|-------------|
| [ ] Preflop action | Starts left of BB (UTG), BB acts last |
| [ ] Post-flop action | Starts left of dealer, dealer acts last |
| [ ] Burn cards | Burn one card before dealing flop, turn, and river |
| [ ] Flop | 3 community cards |
| [ ] Turn | 1 community card |
| [ ] River | 1 community card |
| [ ] Action on fold | If all but one player folds, hand ends immediately, last player wins |

### Edge Cases

| Rule | Description |
|------|-------------|
| [ ] Heads-up all-in preflop | Deal all 5 community cards, then showdown |
| [ ] All-in before river | Deal remaining community cards, then showdown |
| [ ] Bust-out mid-game | Player removed from future hands, their seat skipped |
| [ ] Single player remains | Game ends, that player wins (no more hands to play) |
| [ ] Insufficient chips for blind | Player is all-in for whatever they have |

### Side Pot Scenarios (Commonly Missed)

| Scenario | Handling |
|----------|----------|
| [ ] Simple side pot | Player A all-in for 100, B and C continue betting 200 more. Main pot = 300 (A eligible), Side pot = 400 (B/C only) |
| [ ] Multiple all-ins | A all-in 50, B all-in 150, C calls 150. Main pot (A,B,C), Side pot 1 (B,C), any further betting = Side pot 2 (remaining players) |
| [ ] All-in for less than BB | Player posts what they have, can only win proportional amount from each caller |
| [ ] All-in vs all-in | Both players all-in for different amounts — smaller stack can only win up to their amount from larger stack |
| [ ] Three-way all-in | Three different stack sizes — create main pot + 2 side pots, award in reverse order |
| [ ] Side pot showdown order | Showdown side pots first (highest to lowest), then main pot |
| [ ] Winner of side pot loses main | Player can win side pot but lose main pot to different player |

### Blind Edge Cases

| Scenario | Handling |
|----------|----------|
| [ ] BB can't afford full blind | Posts all chips, is all-in before action starts |
| [ ] SB can't afford full blind | Posts all chips, treated as all-in |
| [ ] Walk (everyone folds to BB) | BB wins SB, no cards dealt, hand ends |
| [ ] SB folds preflop | SB forfeits their blind, action continues |
| [ ] Transition to heads-up | When 3rd player busts, button rules change to heads-up format |
| [ ] First hand button assignment | Random or predetermined starting position |

### Betting Edge Cases

| Scenario | Handling |
|----------|----------|
| [ ] Incomplete raise all-in | Player goes all-in but raise is less than min raise — doesn't reopen action for players who already acted |
| [ ] String bet prevention | AI returns single action, but validate raise amount is declared correctly |
| [ ] Over-bet | Can bet any amount up to your stack (no-limit), even if more than pot or opponent's stack |
| [ ] Calling more than opponent has | If you "call 500" but opponent only has 300, you only put in 300 |
| [ ] Check-raise | Valid play — check, then raise after opponent bets |
| [ ] Bet into dry side pot | If main pot is locked and side pot is heads-up, one player can bet into empty side pot |
| [ ] Cap on raises | No cap in no-limit (but some games have 3-4 raise cap) — decide and document |
| [ ] Min bet | Minimum bet = 1 BB (or all-in if less) |

### Showdown Edge Cases

| Scenario | Handling |
|----------|----------|
| [ ] Chopped pot 2-way | Pot splits exactly in half |
| [ ] Chopped pot 3+ way | Divide equally, odd chips go to players closest to left of dealer |
| [ ] Board plays for everyone | All players have same best 5-card hand (e.g., royal flush on board) |
| [ ] Counterfeit | Player's made hand gets devalued by board (e.g., had 77 on 66K, turn K makes board two pair) |
| [ ] Tied kickers | When kickers tie, next kicker plays until 5 cards used or tie confirmed |
| [ ] Same hand different hole cards | e.g., AK vs AQ on AAJJ2 board — both have AAJJ+A, kicker doesn't play, split pot |

### Card Dealing Edge Cases

| Scenario | Handling |
|----------|----------|
| [ ] Deck exhaustion | 52 cards - burn cards - community cards - player hole cards. With 8 players: 3 burns + 5 community + 16 hole = 24 cards max used |
| [ ] Consistent shuffle | Use cryptographically secure RNG, shuffle before each hand |
| [ ] Card representation | Standardize format (e.g., "Ah" = Ace of hearts, "Td" = Ten of diamonds) |

### Game State Edge Cases

| Scenario | Handling |
|----------|----------|
| [ ] All players all-in preflop | Deal all 5 community cards immediately, showdown |
| [ ] All players all-in on flop | Deal turn and river, then showdown |
| [ ] Last two players both bust | Both all-in, loser busts. If split pot, both survive |
| [ ] Negative chip count | Should never happen — validate all bet amounts |
| [ ] Zero chip count | Player busted, removed from game |
| [ ] Player sitting out | Not applicable for AI — all players always active |

---

## Side Pot Algorithm

Side pots are the most error-prone part of poker implementations. **The existing implementation in `src/lib/pot-manager.ts` should be reused for Ranked Mode.**

### Existing Implementation (src/lib/pot-manager.ts)

```typescript
// Already implemented - REUSE THIS
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

### Existing Distribution (src/lib/pot-manager.ts)

```typescript
// Already implemented - REUSE THIS
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

### Convex Integration

For Ranked Mode, the same logic runs server-side in Convex:

### Example: Three-Way All-In

**Setup:**
- Player A: 50 chips, goes all-in
- Player B: 150 chips, goes all-in  
- Player C: 300 chips, calls 150

**Contributions:** A=50, B=150, C=150

**Step-by-step pot building:**

```
Level 0 → 50 (increment = 50)
  Players who contributed ≥ 50: A, B, C (3 players)
  Pot amount: 50 × 3 = 150
  Eligible (not folded, contributed ≥ 50): A, B, C
  → Main Pot: $150 (A, B, C eligible)

Level 50 → 150 (increment = 100)
  Players who contributed ≥ 150: B, C (2 players)
  Pot amount: 100 × 2 = 200
  Eligible (not folded, contributed ≥ 150): B, C
  → Side Pot 1: $200 (B, C eligible)

Total: $350 across 2 pots
```

**Showdown results (example):**
- A has best hand → wins Main Pot ($150)
- B beats C → wins Side Pot 1 ($200)

### Example: All-In With Fold

**Setup:**
- Player A: 100 all-in
- Player B: 100 call
- Player C: folds (had put in 50 from blinds/previous bet)

**Contributions:** A=100, B=100, C=50 (folded)

```
Level 0 → 50 (increment = 50)
  Players who contributed ≥ 50: A, B, C (3 players)
  Pot amount: 50 × 3 = 150
  Eligible (not folded): A, B only
  → Main Pot: $150 (A, B eligible)

Level 50 → 100 (increment = 50)
  Players who contributed ≥ 100: A, B (2 players)
  Pot amount: 50 × 2 = 100
  Eligible: A, B
  → Side Pot 1: $100 (A, B eligible)

Total: $250 across 2 pots (both A/B eligible for both)
```

Note: C's folded $50 goes into the pot but C can't win it.

### Example: Four-Way Chaos

**Setup:**
- Player A: 30 all-in
- Player B: 80 all-in
- Player C: 200 all-in
- Player D: 200 call

**Contributions:** A=30, B=80, C=200, D=200

```
Level 0 → 30: 30 × 4 = $120 (A, B, C, D eligible)
Level 30 → 80: 50 × 3 = $150 (B, C, D eligible)
Level 80 → 200: 120 × 2 = $240 (C, D eligible)

Pots:
  Main Pot:   $120 — A, B, C, D can win
  Side Pot 1: $150 — B, C, D can win
  Side Pot 2: $240 — C, D can win
```

### Algorithm: Awarding Pots

Award pots in **reverse order** (side pots first, main pot last):

```typescript
function awardPots(pots: Pot[], players: PlayerState[]): Award[] {
  const awards: Award[] = [];
  
  // Process pots from last (smallest eligible pool) to first (main pot)
  for (let i = pots.length - 1; i >= 0; i--) {
    const pot = pots[i];
    
    // Find best hand among eligible players
    const eligiblePlayers = players.filter(p => 
      pot.eligiblePlayerIds.includes(p.id) && !p.folded
    );
    
    const winners = findBestHands(eligiblePlayers);  // may be multiple if tie
    const amountEach = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;
    
    winners.forEach((winner, index) => {
      // First winner (closest to dealer's left) gets odd chips
      const oddChip = index === 0 ? remainder : 0;
      awards.push({
        playerId: winner.id,
        amount: amountEach + oddChip,
        potIndex: i,
      });
    });
  }
  
  return awards;
}
```

### Odd Chip Rule

When a pot doesn't split evenly:
1. Divide pot by number of winners (integer division)
2. Remainder chips (1 to n-1) go to winner(s) closest to dealer's **left**
3. In a 3-way split with 2 odd chips, first two players left of dealer each get 1

```typescript
function distributeOddChips(
  potAmount: number, 
  winnerIds: string[], 
  dealerPosition: number,
  playerPositions: Map<string, number>
): Map<string, number> {
  const baseAmount = Math.floor(potAmount / winnerIds.length);
  const oddChips = potAmount % winnerIds.length;
  
  // Sort winners by distance from dealer (clockwise)
  const sortedWinners = [...winnerIds].sort((a, b) => {
    const posA = (playerPositions.get(a)! - dealerPosition + numPlayers) % numPlayers;
    const posB = (playerPositions.get(b)! - dealerPosition + numPlayers) % numPlayers;
    return posA - posB;
  });
  
  const distribution = new Map<string, number>();
  sortedWinners.forEach((id, index) => {
    distribution.set(id, baseAmount + (index < oddChips ? 1 : 0));
  });
  
  return distribution;
}
```

### Validation Checks

Add these assertions to catch bugs:

```typescript
function validatePots(pots: Pot[], players: PlayerState[]) {
  const totalInPots = pots.reduce((sum, p) => sum + p.amount, 0);
  const totalContributed = players.reduce((sum, p) => sum + p.totalBetThisHand, 0);
  
  // Pots should equal total contributions
  assert(totalInPots === totalContributed, 
    `Pot mismatch: ${totalInPots} in pots vs ${totalContributed} contributed`);
  
  // Each pot should have at least one eligible player
  pots.forEach((pot, i) => {
    assert(pot.eligiblePlayerIds.length > 0, `Pot ${i} has no eligible players`);
    assert(pot.amount > 0, `Pot ${i} has zero amount`);
  });
  
  // No player should be eligible for a pot they didn't contribute enough to
  // (this is enforced by the algorithm but good to verify)
}
```

---

## AI Prompt Structure

### Current Implementation (Practice Mode)

The existing implementation uses `streamText` with regex-based action parsing:

```typescript
// src/app/api/game/poker-think/route.ts (CURRENT)
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";

const result = streamText({
  model: gateway(modelId),
  system: POKER_SYSTEM_PROMPT,
  prompt: generatePokerPrompt(context),
  maxOutputTokens: 80,
  temperature: 0.3,
});

return result.toTextStreamResponse();
```

```typescript
// src/lib/poker-prompts.ts (CURRENT - Regex parsing)
const actionRegex = /ACTION:\s*(FOLD|CHECK|CALL|RAISE\s*\$?([\d,]+)|ALL[- ]?IN)/i;
```

### Recommended: Migrate to Structured Output

For Ranked Mode, use `generateObject` with Zod for type-safe, validated responses:

```typescript
import { generateObject } from 'ai';
import { gateway } from "@ai-sdk/gateway";
import { z } from 'zod';

// Define the action schema
const PokerActionSchema = z.object({
  reasoning: z.string().describe('Your thought process for this decision'),
  action: z.enum(['fold', 'check', 'call', 'raise']),
  amount: z.number().optional().describe('Required for raise, must be between minRaise and maxRaise'),
});

type PokerAction = z.infer<typeof PokerActionSchema>;

async function getModelDecision(
  model: AIModel,
  gameState: GameState,
  prompt: string
): Promise<AIDecision> {
  const startTime = Date.now();
  
  try {
    const { object, usage } = await generateObject({
      model: gateway(model.gatewayId), // e.g., "anthropic/claude-sonnet-4-20250514"
      schema: PokerActionSchema,
      schemaName: 'PokerAction',
      schemaDescription: 'A poker action decision with reasoning',
      prompt,
      maxTokens: 500,
    });

    return {
      action: object.action,
      amount: object.amount,
      reasoning: object.reasoning,
      responseTimeMs: Date.now() - startTime,
      tokensUsed: {
        input: usage.promptTokens,
        output: usage.completionTokens,
      },
      valid: true,
    };
  } catch (error) {
    // generateObject throws if schema validation fails
    return {
      action: 'timeout',
      reasoning: `Failed to generate valid action: ${error.message}`,
      responseTimeMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 },
      valid: false,
    };
  }
}
```

### Extended Schema with Validation

```typescript
import { z } from 'zod';

// Schema that includes game context for validation
const createPokerActionSchema = (validActions: ValidActions) => {
  const actionEnum = z.enum(['fold', 'check', 'call', 'raise']).refine(
    (action) => {
      if (action === 'check' && !validActions.canCheck) return false;
      if (action === 'call' && !validActions.canCall) return false;
      if (action === 'raise' && !validActions.canRaise) return false;
      return true;
    },
    { message: 'Invalid action for current game state' }
  );

  return z.object({
    reasoning: z.string().max(500).describe(
      'Brief explanation of your decision (max 500 chars)'
    ),
    action: actionEnum,
    amount: z.number().optional().refine(
      (amount, ctx) => {
        // Only validate amount if action is raise
        if (ctx.parent?.action !== 'raise') return true;
        if (amount === undefined) return false;
        if (amount < validActions.minRaise) return false;
        if (amount > validActions.maxRaise) return false;
        return true;
      },
      { message: `Raise must be between ${validActions.minRaise} and ${validActions.maxRaise}` }
    ),
  });
};

interface ValidActions {
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
}
```

### Information Provided to AI

| Category | Fields | Rationale |
|----------|--------|-----------|
| **Game Progress** | `currentHand`, `maxHands` | Enables end-game strategy adjustments |
| **Position** | `dealerPosition`, `yourPosition`, `positionName` (BTN/SB/BB/UTG/etc) | Position is fundamental to poker strategy |
| **Stack Sizes** | All players' chip counts | Pot odds, implied odds, pressure decisions |
| **Pot & Bets** | `potSize`, `currentBet`, `minRaise`, `yourCurrentBet` | Required for bet sizing decisions |
| **Cards** | `yourHand`, `communityCards`, `phase` | Core decision inputs |
| **Action History** | Actions this hand (who bet/raised/called/folded) | Reading opponents, detecting patterns |
| **Opponent Tendencies** | Aggregated stats per opponent this game | Pattern recognition, exploitative play |
| **Valid Actions** | `canCheck`, `canCall`, `callAmount`, `minRaise`, `maxRaise` | Prevents invalid responses |

### Prompt Template

```markdown
You are playing Texas Hold'em poker. Analyze the situation and decide your action.

## Game Progress
- Hand: {currentHand} of {maxHands}
- Players remaining: {playersRemaining}

## Your Position
- Seat: {seatNumber}
- Position: {positionName} (e.g., "BTN", "SB", "BB", "UTG", "MP", "CO")
- Dealer button: Seat {dealerSeat}

## Stack Sizes
{foreach player}
- {playerName}: {chips} chips {isYou ? "(YOU)" : ""} {isFolded ? "(folded)" : ""} {isAllIn ? "(all-in)" : ""}
{/foreach}

## Opponent Tendencies (This Game)
{foreach opponent}
- {playerName}: Played {handsPlayed}/{totalHands} hands ({vpipPercent}% VPIP), {preflopRaises} preflop raises ({pfrPercent}% PFR), {showdowns} showdowns (won {showdownsWon}), Aggression: {aggressionRating}
{/foreach}

## Current Hand
- Your cards: {card1} {card2}
- Community cards: {communityCards or "None (Preflop)"}
- Phase: {phase} (Preflop/Flop/Turn/River)

## Pot & Betting
- Pot size: {potSize}
- Current bet to call: {currentBet}
- Your current bet: {yourCurrentBet}
- Amount to call: {callAmount}
- Minimum raise to: {minRaiseTotal}
- Your remaining chips: {yourChips}

## Action This Hand
{foreach action in handHistory}
- {playerName} {action} {amount if applicable}
{/foreach}

## Valid Actions
{validActionsList}

Consider pot odds, position, opponent tendencies, and game progress when making your decision.
```

### Example Prompt (Mid-Game, Flop)

```markdown
You are playing Texas Hold'em poker. Analyze the situation and decide your action.

## Game Progress
- Hand: 14 of 25
- Players remaining: 3

## Your Position
- Seat: 2
- Position: BTN (Dealer Button)
- Dealer button: Seat 2

## Stack Sizes
- SHADOW_KNIGHT: 1,450 chips (YOU)
- NEON_VIPER: 890 chips
- IRON_SAGE: 660 chips (folded)

## Opponent Tendencies (This Game)
- NEON_VIPER: Played 10/13 hands (77% VPIP), 6 preflop raises (46% PFR), 3 showdowns (won 2), Aggression: High
- IRON_SAGE: Played 5/13 hands (38% VPIP), 1 preflop raise (8% PFR), 1 showdown (won 0), Aggression: Low

## Current Hand
- Your cards: Ah Kd
- Community cards: Ks 7h 2c
- Phase: Flop

## Pot & Betting
- Pot size: 120
- Current bet to call: 60
- Your current bet: 0
- Amount to call: 60
- Minimum raise to: 120
- Your remaining chips: 1,450

## Action This Hand
- IRON_SAGE posts SB 10
- SHADOW_KNIGHT posts BB 20
- NEON_VIPER raises to 60
- IRON_SAGE folds
- SHADOW_KNIGHT calls 60
- [Flop: Ks 7h 2c]
- SHADOW_KNIGHT checks
- NEON_VIPER bets 60

## Valid Actions
- CALL 60
- RAISE (min: 120, max: 1450 all-in)
- FOLD

Consider pot odds, position, opponent tendencies, and game progress when making your decision.
```

### Example Structured Response

With `generateObject`, the model returns a validated object:

```typescript
// What generateObject returns:
{
  object: {
    reasoning: "I have top pair top kicker (AK on Ks 7h 2c). NEON_VIPER is aggressive (77% VPIP, high aggression) and likely c-betting wide here. Raising for value makes sense - I want to build the pot with my strong made hand. A raise to 180 (3x) prices out draws while keeping worse hands in.",
    action: "raise",
    amount: 180
  },
  usage: {
    promptTokens: 412,
    completionTokens: 89
  }
}
```

### Response Parsing with AI SDK Structured Output

Use Vercel AI SDK's `generateObject` with Zod schemas for type-safe, validated responses:

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

// Define the action schema
const PokerActionSchema = z.object({
  reasoning: z.string().describe('Your thought process for this decision'),
  action: z.enum(['fold', 'check', 'call', 'raise']),
  amount: z.number().optional().describe('Required for raise, must be between minRaise and maxRaise'),
});

type PokerAction = z.infer<typeof PokerActionSchema>;

async function getModelDecision(
  model: AIModel,
  gameState: GameState,
  prompt: string
): Promise<AIDecision> {
  const startTime = Date.now();
  
  try {
    const { object, usage } = await generateObject({
      model: getProviderModel(model), // e.g., anthropic('claude-sonnet-4-20250514')
      schema: PokerActionSchema,
      schemaName: 'PokerAction',
      schemaDescription: 'A poker action decision with reasoning',
      prompt,
      maxTokens: 1000,
    });

    return {
      action: object.action,
      amount: object.amount,
      reasoning: object.reasoning,
      responseTimeMs: Date.now() - startTime,
      tokensUsed: {
        input: usage.promptTokens,
        output: usage.completionTokens,
      },
      valid: true,
    };
  } catch (error) {
    // generateObject throws if schema validation fails
    return {
      action: 'timeout',
      reasoning: `Failed to generate valid action: ${error.message}`,
      responseTimeMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 },
      valid: false,
    };
  }
}
```

### Extended Schema with Validation

```typescript
import { z } from 'zod';

// Schema that includes game context for validation
const createPokerActionSchema = (validActions: ValidActions) => {
  const actionEnum = z.enum(['fold', 'check', 'call', 'raise']).refine(
    (action) => {
      if (action === 'check' && !validActions.canCheck) return false;
      if (action === 'call' && !validActions.canCall) return false;
      if (action === 'raise' && !validActions.canRaise) return false;
      return true;
    },
    { message: 'Invalid action for current game state' }
  );

  return z.object({
    reasoning: z.string().max(500).describe(
      'Brief explanation of your decision (max 500 chars)'
    ),
    action: actionEnum,
    amount: z.number().optional().refine(
      (amount, ctx) => {
        // Only validate amount if action is raise
        if (ctx.parent?.action !== 'raise') return true;
        if (amount === undefined) return false;
        if (amount < validActions.minRaise) return false;
        if (amount > validActions.maxRaise) return false;
        return true;
      },
      { message: `Raise must be between ${validActions.minRaise} and ${validActions.maxRaise}` }
    ),
  });
};

interface ValidActions {
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
}
```

### Simplified Prompt (No Parsing Instructions Needed)

Since `generateObject` handles the structure, the prompt can focus on strategy:

```markdown
You are playing Texas Hold'em poker. Analyze the situation and decide your action.

## Game Progress
- Hand: {currentHand} of {maxHands}
- Players remaining: {playersRemaining}

## Your Position
- Position: {positionName}
- Dealer button: Seat {dealerSeat}

## Stack Sizes
{foreach player}
- {playerName}: {chips} chips {isYou ? "(YOU)" : ""} {status}
{/foreach}

## Opponent Tendencies (This Game)
{foreach opponent}
- {playerName}: {vpipPercent}% VPIP, {pfrPercent}% PFR, Aggression: {aggressionRating}
{/foreach}

## Current Hand
- Your cards: {card1} {card2}
- Community cards: {communityCards or "None (Preflop)"}
- Phase: {phase}

## Pot & Betting
- Pot: {potSize}
- To call: {callAmount}
- Min raise: {minRaise}
- Your chips: {yourChips}

## Action This Hand
{actionHistory}

## Valid Actions
{validActionsList}

Decide your action. Consider pot odds, position, opponent tendencies, and stack sizes.
```

### Using AI Gateway (Existing Pattern)

The existing implementation uses `@ai-sdk/gateway` which handles provider routing:

```typescript
// src/app/api/game/poker-think/route.ts (EXISTING)
import { gateway } from "@ai-sdk/gateway";

// Gateway handles routing based on model ID format
// e.g., "anthropic/claude-sonnet-4-20250514" routes to Anthropic
const result = streamText({
  model: gateway(modelId),
  // ...
});

// For Ranked Mode with generateObject:
const { object, usage } = await generateObject({
  model: gateway(model.gatewayId),
  schema: PokerActionSchema,
  // ...
});
```

### Handling Edge Cases

```typescript
async function getValidatedAction(
  model: Model,
  gameState: GameState,
  validActions: ValidActions
): Promise<PlayerAction> {
  const decision = await getModelDecision(model, gameState, buildPrompt(gameState));

  // Even with structured output, validate the action is legal
  if (!decision.valid) {
    return autoAction(validActions); // check if possible, else fold
  }

  // Clamp raise amounts to valid range
  if (decision.action === 'raise' && decision.amount) {
    decision.amount = Math.max(validActions.minRaise, 
                      Math.min(validActions.maxRaise, decision.amount));
  }

  // Convert 'raise' with insufficient context to 'call' or 'fold'
  if (decision.action === 'raise' && !validActions.canRaise) {
    return validActions.canCall 
      ? { action: 'call', amount: validActions.callAmount }
      : { action: 'fold' };
  }

  return decision;
}

function autoAction(validActions: ValidActions): PlayerAction {
  if (validActions.canCheck) return { action: 'check' };
  return { action: 'fold' };
}
```

### In-Game Tendency Tracking

Track these stats per player within a single game (reset each game):

```typescript
interface InGamePlayerStats {
  codename: string;
  
  // Participation
  handsDealt: number;           // Total hands dealt to this player
  handsPlayed: number;          // Hands where player voluntarily put money in (not just blinds)
  
  // Preflop tendencies
  preflopRaises: number;        // Times raised preflop
  preflopCalls: number;         // Times called preflop (not from blinds)
  preflopFolds: number;         // Times folded preflop
  
  // Post-flop tendencies  
  totalBets: number;            // Times bet (first to put money in)
  totalRaises: number;          // Times raised
  totalCalls: number;           // Times called
  totalFolds: number;           // Times folded
  totalChecks: number;          // Times checked
  
  // Showdown
  showdownsReached: number;     // Times made it to showdown
  showdownsWon: number;         // Times won at showdown
  
  // Bluffing indicators
  wentToShowdownAndLost: number; // Called down and lost (possible calling station)
  foldedToRaise: number;        // Times folded when facing a raise
  raisesFaced: number;          // Times faced a raise
}

// Computed stats for prompt
function computeTendencies(stats: InGamePlayerStats): PlayerTendencies {
  return {
    vpip: stats.handsDealt > 0 
      ? Math.round((stats.handsPlayed / stats.handsDealt) * 100) 
      : 0,
    pfr: stats.handsDealt > 0 
      ? Math.round((stats.preflopRaises / stats.handsDealt) * 100) 
      : 0,
    aggression: categorizeAggression(stats),
    showdownWinRate: stats.showdownsReached > 0
      ? Math.round((stats.showdownsWon / stats.showdownsReached) * 100)
      : null,
  };
}

function categorizeAggression(stats: InGamePlayerStats): string {
  const totalActions = stats.totalBets + stats.totalRaises + stats.totalCalls + stats.totalFolds;
  if (totalActions < 5) return 'Unknown';
  
  const aggressiveActions = stats.totalBets + stats.totalRaises;
  const passiveActions = stats.totalCalls + stats.totalChecks;
  
  if (passiveActions === 0) return 'Very High';
  const ratio = aggressiveActions / passiveActions;
  
  if (ratio > 2) return 'Very High';
  if (ratio > 1.2) return 'High';
  if (ratio > 0.8) return 'Medium';
  if (ratio > 0.4) return 'Low';
  return 'Very Low';
}
```

### Updating Tendencies

Call after each action:

```typescript
function updatePlayerTendencies(
  stats: InGamePlayerStats,
  action: PlayerAction,
  context: ActionContext
): void {
  // Track preflop vs post-flop
  if (context.phase === 'preflop') {
    if (action.type === 'raise') stats.preflopRaises++;
    else if (action.type === 'call' && !context.isFromBlind) stats.preflopCalls++;
    else if (action.type === 'fold') stats.preflopFolds++;
    
    // VPIP: any voluntary money preflop (not forced blind)
    if ((action.type === 'call' || action.type === 'raise') && !context.isFromBlind) {
      stats.handsPlayed++;
    }
  } else {
    if (action.type === 'bet') stats.totalBets++;
    else if (action.type === 'raise') stats.totalRaises++;
    else if (action.type === 'call') stats.totalCalls++;
    else if (action.type === 'fold') stats.totalFolds++;
    else if (action.type === 'check') stats.totalChecks++;
  }
  
  // Fold to raise tracking
  if (context.facingRaise) {
    stats.raisesFaced++;
    if (action.type === 'fold') stats.foldedToRaise++;
  }
}

function updateShowdownStats(
  stats: InGamePlayerStats, 
  reachedShowdown: boolean, 
  won: boolean
): void {
  if (reachedShowdown) {
    stats.showdownsReached++;
    if (won) stats.showdownsWon++;
  }
}
```

### Invalid Response Handling

With `generateObject`, most parsing issues are handled automatically. Remaining edge cases:

| Issue | Handling |
|-------|----------|
| Schema validation fails | `generateObject` throws → treat as timeout → auto check/fold |
| Model times out (30s) | Convex scheduled timeout fires → auto check/fold |
| Model API error | Caught in try/catch → auto check/fold |
| Raise below minimum | Clamp to minimum raise |
| Raise above stack | Cap at all-in |
| Invalid action for state (e.g., CHECK when facing bet) | Zod refinement rejects it → retry or auto check/fold |

### Information NOT Provided

| Hidden Info | Reason |
|-------------|--------|
| Opponent hole cards | Obviously hidden until showdown |
| Deck composition | No card counting |
| Opponent's actual model (GPT-4, Claude, etc.) | Only codenames shown — no meta-gaming based on known model behaviors |
| Opponent's previous game history | Each game is independent |
| Other ongoing games | Irrelevant |
| Global leaderboard standings | Avoid metagaming across games |

### Dependencies

```json
{
  "ai": "^4.0.0",
  "@ai-sdk/gateway": "latest",
  "zod": "^3.23.0"
}
```

### Existing Rate Limiting (src/lib/ratelimit.ts)

Three-layer rate limiting already implemented:

| Layer | Limit | Purpose |
|-------|-------|---------|
| Per-IP | 60/minute | Prevent individual abuse |
| Per-Game | 50/10 minutes | Prevent runaway games |
| Global | 500/hour | Budget protection |

```typescript
export const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "auction:ip",
});

export const globalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(500, "1 h"),
  prefix: "auction:global",
});
```

**Note**: For Ranked Mode, Convex handles its own rate limiting through scheduled actions.

### Reasoning Capture

The `reasoning` field in the schema captures the model's thought process automatically:

```typescript
interface AIDecision {
  action: 'fold' | 'check' | 'call' | 'raise';
  amount?: number;
  reasoning: string;           // From schema - always present
  responseTimeMs: number;
  tokensUsed: { input: number; output: number };
  valid: boolean;
}
```

This lets you analyze not just what models decide, but how they think:

| Analysis Type | What to Look For |
|---------------|------------------|
| Correct reasoning, wrong action | Model understands but miscalculates |
| Wrong reasoning, lucky action | Got lucky, not sustainable |
| Rule misunderstanding | "I'll check" when facing a bet |
| Bluff awareness | Does it consider opponent could be bluffing? |
| Pot odds calculation | Does it mention odds/equity? |
| Position awareness | Does it factor in acting last? |

---

## Default Game Configuration

```typescript
const DEFAULT_CONFIG = {
  buyIn: 1000,
  blinds: { small: 10, big: 20 },  // 50 BBs deep
  maxHands: 25,
  turnTimeoutMs: 30000,
};

const STARTING_BALANCE = 5000; // per model — allows 5 full buy-ins
```

---

## Game Modes

### Ranked Mode — AI Evaluation (Persistent)
- **AI vs AI only** — no human players
- Games recorded to Convex
- Affects global balances and leaderboard
- Full statistics tracking
- Games run autonomously server-side
- Persists across browser close/refresh
- Purpose: unbiased model evaluation benchmark

### Practice Mode — Human vs AI (Local Only)
- **Already implemented** via Zustand
- Human player vs AI opponents
- Runs entirely client-side
- **Nothing recorded to database**
- No effect on leaderboard or model stats
- Game state lost on browser close/refresh
- Purpose: casual play, testing, learning

This separation keeps the leaderboard as a pure AI-vs-AI benchmark, eliminating any human skill variance from the evaluation data.

---

## Core Features

### 1. Autonomous Game Engine (Ranked Mode)

Games execute server-side via Convex scheduled actions. No browser required after game creation. **AI models only — no human players in ranked games.**

**Game Configuration:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `buyIn` | Entry cost deducted from global balance | 1000 |
| `blinds` | Small/big blind structure | 20/40 |
| `maxHands` | Hand limit before forced settlement | 50 |
| `turnTimeout` | Time per decision before auto-check/fold | 30s |
| `players` | 2-8 models (or humans) | 4 |

**Game Loop:**
```
Create Game → Deduct Buy-ins → Schedule First Turn
    ↓
[Turn Loop]
    → Schedule 30s Timeout
    → Call model API, get decision
    → Apply action, advance turn
    → Schedule next turn
    ↓
[Hand Complete]
    → Award pot to winner(s)
    → If hands < maxHands AND players > 1: Deal new hand
    → Else: Settle game
    ↓
[Game Complete]
    → Credit final chip counts to global balances
    → Record final statistics
    → Mark game as completed
```

### 2. Global Balance System

Each model has a persistent bank balance that carries across all games.

- **Starting Balance:** $500 (configurable)
- **Negative Balances Allowed:** Yes — enables true skill tracking over time
- **Buy-in Deduction:** Immediate on game start
- **Settlement:** Final chips credited on game completion

### 3. Real-Time Leaderboard

Live-updating rankings based on global balance and performance metrics.

**Primary View:**
```
Rank | Model         | Balance   | Profit/Loss | Win Rate | Hands Played
-----+---------------+-----------+-------------+----------+-------------
1    | Claude 4.5    | $12,450   | +$11,950    | 58.2%    | 1,247
2    | GPT-4o        | $8,320    | +$7,820     | 52.1%    | 1,189
3    | Gemini 2.5    | $2,105    | +$1,605     | 49.8%    | 1,302
4    | Llama 3.3     | -$1,240   | -$1,740     | 41.2%    | 1,156
```

---

## Statistics Tracking

### Per-Model Lifetime Stats

**Financial:**
| Metric | Description |
|--------|-------------|
| `balance` | Current global balance |
| `totalProfit` | Sum of all game P&L (balance - starting balance) |
| `biggestWin` | Largest single-game profit |
| `biggestLoss` | Largest single-game loss |
| `totalBuyIns` | Sum of all buy-ins paid |
| `totalCashouts` | Sum of all game settlements |

**Performance:**
| Metric | Description |
|--------|-------------|
| `gamesPlayed` | Total games participated in |
| `gamesWon` | Games finished with profit |
| `handsPlayed` | Total hands dealt into |
| `handsWon` | Hands where model won the pot |
| `winRate` | `handsWon / handsPlayed` |
| `showdownWinRate` | Wins at showdown / showdowns reached |

**Poker Strategy Metrics:**
| Metric | Description |
|--------|-------------|
| `vpip` | Voluntarily Put $ In Pot — % of hands where model put money in preflop (not from blinds) |
| `pfr` | Pre-Flop Raise — % of hands where model raised preflop |
| `aggressionFactor` | (Bets + Raises) / Calls — higher = more aggressive |
| `foldToRaise` | % of times model folded when facing a raise |
| `continuationBet` | % of times model bet flop after raising preflop |
| `avgPotWon` | Average pot size when winning |

**AI-Specific Metrics:**
| Metric | Description |
|--------|-------------|
| `totalInputTokens` | Cumulative prompt tokens sent to model |
| `totalOutputTokens` | Cumulative completion tokens received |
| `totalCost` | Estimated API cost (based on token pricing) |
| `avgResponseTime` | Mean time from prompt to action |
| `timeoutRate` | % of turns where model timed out |
| `invalidActionRate` | % of responses that couldn't be parsed |

### Per-Game Stats

Stored on each game record for history/replay:

```typescript
{
  gameId: "...",
  startedAt: timestamp,
  completedAt: timestamp,
  handsPlayed: 47,
  players: [
    {
      modelId: "...",
      buyIn: 1000,
      finalChips: 2340,
      profit: 1340,
      handsWon: 12,
      tokensUsed: { input: 45000, output: 3200 },
      avgResponseTime: 2.4,
      timeouts: 0,
    },
    // ...
  ],
  handHistory: [ /* optional: full action log for replay */ ],
}
```

### Per-Hand Stats (Optional Detail)

For deep analysis or replay functionality:

```typescript
{
  handNumber: 23,
  pot: 840,
  communityCards: ["Ah", "Kd", "7c", "2s", "Jh"],
  winner: "model_xyz",
  winCondition: "showdown" | "all_folded",
  actions: [
    { player: "...", action: "raise", amount: 80, phase: "preflop" },
    { player: "...", action: "call", amount: 80, phase: "preflop" },
    // ...
  ],
}
```

---

## Data Schema (Convex)

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  models: defineTable({
    // Identity
    name: v.string(),                    // "Claude Sonnet 4"
    codename: v.string(),                // "SHADOW_KNIGHT"
    provider: v.string(),                // "anthropic"
    modelId: v.string(),                 // "claude-sonnet-4-20250514"
    
    // Financial
    balance: v.number(),                 // Current global balance
    totalBuyIns: v.number(),
    totalCashouts: v.number(),
    biggestWin: v.number(),
    biggestLoss: v.number(),
    
    // Performance
    gamesPlayed: v.number(),
    gamesWon: v.number(),
    handsPlayed: v.number(),
    handsWon: v.number(),
    showdownsWon: v.number(),
    showdownsPlayed: v.number(),
    
    // Strategy
    vpipHands: v.number(),               // Hands where VPIP'd
    pfrHands: v.number(),                // Hands where PFR'd
    totalBets: v.number(),
    totalRaises: v.number(),
    totalCalls: v.number(),
    totalFolds: v.number(),
    foldsToRaise: v.number(),
    raisesFaced: v.number(),
    continuationBets: v.number(),
    continuationBetOpportunities: v.number(),
    totalPotWon: v.number(),
    
    // AI Metrics
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalResponseTimeMs: v.number(),
    timeouts: v.number(),
    invalidActions: v.number(),
    
    createdAt: v.number(),
  }).index("by_balance", ["balance"]),

  games: defineTable({
    status: v.union(
      v.literal("waiting"),      // Waiting for players
      v.literal("active"),       // In progress
      v.literal("completed"),    // Finished normally
      v.literal("cancelled"),    // Manually cancelled
    ),
    
    // Config
    buyIn: v.number(),
    blinds: v.object({ small: v.number(), big: v.number() }),
    maxHands: v.number(),
    turnTimeoutMs: v.number(),
    
    // Progress
    currentHand: v.number(),
    turnNumber: v.number(),              // Global turn counter for race-safety
    
    // Players (AI only for ranked)
    players: v.array(v.object({
      modelId: v.id("models"),
      buyIn: v.number(),
      finalChips: v.optional(v.number()),
      profit: v.optional(v.number()),
    })),
    
    // Live game state
    state: v.object({
      phase: v.string(),
      pot: v.number(),
      communityCards: v.array(v.string()),
      currentPlayerIndex: v.number(),
      dealerIndex: v.number(),
      deck: v.array(v.string()),
      currentBet: v.number(),
      minRaise: v.number(),
      playerStates: v.array(v.object({
        modelId: v.id("models"),
        codename: v.string(),
        chips: v.number(),
        hand: v.array(v.string()),
        currentBet: v.number(),
        totalBetThisHand: v.number(),
        folded: v.boolean(),
        isAllIn: v.boolean(),
        hasActed: v.boolean(),
      })),
    }),
    
    // History (optional, for replay)
    handHistory: v.optional(v.array(v.object({
      handNumber: v.number(),
      pot: v.number(),
      communityCards: v.array(v.string()),
      winnerId: v.optional(v.id("models")),
      winCondition: v.string(),
      actions: v.array(v.object({
        playerId: v.string(),
        action: v.string(),
        amount: v.optional(v.number()),
        phase: v.string(),
        timestamp: v.number(),
      })),
    }))),
    
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  transactions: defineTable({
    modelId: v.id("models"),
    gameId: v.optional(v.id("games")),
    type: v.union(
      v.literal("buy_in"),
      v.literal("cash_out"),
      v.literal("adjustment"),   // Manual admin adjustment
    ),
    amount: v.number(),          // Negative for buy-in, positive for cash-out
    balanceAfter: v.number(),
    createdAt: v.number(),
  })
    .index("by_model", ["modelId"])
    .index("by_game", ["gameId"]),
});
```

---

## API Endpoints

### Queries (Real-Time Subscribed)

| Query | Description |
|-------|-------------|
| `leaderboard.get` | All models ranked by balance with computed stats |
| `leaderboard.getModel(modelId)` | Single model's full stats |
| `games.get(gameId)` | Full game state for spectating |
| `games.listActive` | All in-progress games |
| `games.listRecent(limit)` | Recently completed games |
| `games.getHistory(gameId)` | Full hand history for replay |

### Mutations

| Mutation | Description |
|----------|-------------|
| `games.create(config)` | Start new AI game, deduct buy-ins, begin loop |
| `games.cancel(gameId)` | Admin: cancel game, refund buy-ins |
| `models.create(config)` | Register new model |
| `models.adjustBalance(modelId, amount)` | Admin: manual balance adjustment |

### Internal (Scheduled)

| Function | Description |
|----------|-------------|
| `games.playNextTurn(gameId)` | Execute AI turn |
| `games.timeoutAction(gameId, expectedTurn)` | Auto-fold on timeout |
| `games.settleGame(gameId)` | Finalize balances and stats |

---

## UI Views

### 1. Leaderboard (`/leaderboard`)

Real-time updating table with:
- Rank, model name/codename, balance, P&L
- Expandable rows for detailed stats
- Filters: time period, min games played
- Sort by any column

### 2. Active Games (`/games`)

Grid of in-progress games showing:
- Players and their chip counts
- Current hand #, pot size
- "Spectate" button

### 3. Game View (`/game/poker/[gameId]`)

Live game spectating (AI games are view-only):
- Table with player positions, chips, cards
- Community cards, pot
- Action log sidebar
- Current turn indicator with countdown timer
- Real-time updates via Convex subscription

### 4. Practice Mode (`/play`)

Local-only game against AI:
- Model selector (choose 1-7 opponents)
- Buy-in and blind configuration
- **"Practice Mode" badge clearly visible**
- Same table UI as ranked, but no persistence
- "Start New Game" button (no confirmation needed since nothing saved)
- Warning on page exit: "Game progress will be lost"

### 5. Model Profile (`/models/[modelId]`)

Full statistics dashboard:
- Balance history chart
- Performance metrics
- Strategy breakdown (VPIP, PFR, etc.)
- Recent games list
- Token usage and cost tracking

### 6. Game History (`/game/poker/[gameId]/history`)

Hand-by-hand replay:
- Step through actions
- See hole cards revealed
- Analyze decision points

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Model API fails | Caught in try/catch, timeout auto-folds |
| Model returns invalid action | Log as `invalidAction`, auto-check/fold |
| Model returns illegal action (raise less than min) | Clamp to legal action or fold |
| All players fold to big blind | BB wins, new hand |
| Player busts mid-game | Removed from future hands, settled at 0 |
| All but one player bust | Game ends, survivor wins remaining pot |
| Game reaches maxHands | Settle based on chip counts |
| Duplicate action (race with timeout) | `expectedTurn` check prevents double-apply |

---

## Future Enhancements

1. **Tournament Mode** — Multi-table tournaments with increasing blinds
2. **Head-to-Head Challenges** — Direct matchups between specific models
3. **Blind Evaluation** — Hide model names, reveal after N games
4. **Betting Markets** — Let users predict which model wins
5. **Custom Prompts** — Test how different system prompts affect play
6. **Hand Analysis** — AI-powered review of interesting hands
7. **ELO Rating** — Skill-based ranking alongside raw balance

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Games completed without intervention | >99% |
| Average game completion time (50 hands) | <15 min |
| UI latency (turn updates) | <500ms |
| Concurrent games supported | 20+ |
| Model timeout rate | <5% |

---

## Implementation Phases

### Already Implemented (Practice Mode) ✓

- [x] Zustand game state management
- [x] Basic poker logic (deal, bet, fold, showdown)
- [x] Hand evaluation (`src/lib/hand-evaluator.ts`)
- [x] Pot management & side pots (`src/lib/pot-manager.ts`)
- [x] AI streaming endpoint (`/api/game/poker-think`)
- [x] Action parsing (regex-based)
- [x] Character system with 42 personas
- [x] Timer management (30s deadline-based)
- [x] Animation system (dealing, chip changes)
- [x] Audio system (Howler.js)
- [x] Settings persistence
- [x] Rate limiting (Upstash Redis)
- [x] Web Worker for odds calculation
- [x] CRT visual effects
- [x] shadcn/ui components

### Phase 1: Convex Setup & Schema

- [ ] Install and configure Convex
- [ ] Define schema (models, games, transactions)
- [ ] Create model registration mutations
- [ ] Set up initial model balances ($5000 each)

### Phase 2: Autonomous Game Engine

- [ ] Port poker logic to Convex (reuse `pot-manager.ts`, `hand-evaluator.ts`)
- [ ] Implement `games.create` mutation (deduct buy-ins, schedule first turn)
- [ ] Implement `games.playNextTurn` action (call AI, apply action, schedule next)
- [ ] Implement `games.timeoutAction` mutation (30s auto check/fold)
- [ ] Implement `games.settleGame` mutation (credit balances, record stats)
- [ ] Migrate to `generateObject` for structured AI responses

### Phase 3: Leaderboard & Stats

- [ ] Implement `leaderboard.get` query
- [ ] Build leaderboard UI (`/leaderboard`)
- [ ] Per-model stats computation (VPIP, PFR, aggression)
- [ ] In-game tendency tracking

### Phase 4: Game Spectator UI

- [ ] Implement `games.get` query for real-time subscription
- [ ] Build spectator view (`/game/poker/[gameId]`)
- [ ] Active games list (`/games`)
- [ ] Reuse existing animation components

### Phase 5: Advanced Features

- [ ] Token usage tracking
- [ ] Model profile pages (`/models/[modelId]`)
- [ ] Hand history storage & replay
- [ ] Charts and visualizations

### Phase 6: Polish

- [ ] Admin controls (cancel games, adjust balances)
- [ ] Mobile responsive refinements
- [ ] Error handling & recovery

### Code Reuse Strategy

| Existing File | Reuse In Ranked Mode |
|---------------|---------------------|
| `src/lib/pot-manager.ts` | Port to Convex as-is |
| `src/lib/hand-evaluator.ts` | Port to Convex as-is |
| `src/lib/poker-characters.ts` | Import directly (runs on server) |
| `src/lib/constants.ts` | Shared between modes |
| `src/components/poker/*` | Reuse for spectator view |
| `src/lib/poker-prompts.ts` | Migrate to use `generateObject` |
