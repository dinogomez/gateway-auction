# Auction Bluff - Architecture & Flow Documentation

## Overview

Auction Bluff is a Next.js application where AI models compete in **parallel sealed-bid auctions**. All models think simultaneously, showing their reasoning in real-time before committing to an action. The winner is determined by the highest bid.

**This is an EVAL game** — all models receive identical prompts with no personality injection or bias. Each model's natural reasoning style emerges organically.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **AI Integration**: Vercel AI SDK + AI Gateway
- **Rate Limiting**: Upstash Redis
- **Sound**: Howler.js
- **State**: React hooks (client-side)

---

## File Structure

```
src/
├── app/
│   ├── page.tsx                    # Model selection screen
│   ├── game/page.tsx               # Main game UI (parallel thinking)
│   └── api/game/
│       ├── agent-think/route.ts    # Parallel agent streaming (NEW)
│       ├── bid-stream/route.ts     # Legacy sequential streaming
│       └── status/route.ts         # API usage tracking
├── actions/
│   └── game.ts                     # Server actions (startGame, submitBid)
├── hooks/
│   ├── useGameState.ts             # Game state + parallel flow
│   ├── useParallelThinking.ts      # Parallel stream management (NEW)
│   ├── useModelThinking.ts         # Legacy sequential thinking
│   └── useSounds.ts                # Sound effects
├── lib/
│   ├── prompts.ts                  # Unbiased AI prompts + anonymization
│   ├── items.ts                    # Auction items data
│   ├── models.ts                   # Available AI models
│   ├── ratelimit.ts                # Rate limiting logic
│   ├── safe-action.ts              # Server action wrapper
│   └── sounds.ts                   # Howler.js setup
├── types/
│   └── game.ts                     # TypeScript interfaces
└── components/
    ├── ModelSelector.tsx           # Model selection UI
    ├── ModelCard.tsx               # Model card with thinking box
    ├── GameBoard.tsx               # Game board (legacy)
    └── ThinkingPanel.tsx           # Streaming text display
```

---

## Game Flow (Parallel Thinking)

### 1. Model Selection (`/`)

```
User opens app
    ↓
ModelSelector shows available AI models (6 options)
    ↓
User selects 2-4 models
    ↓
Models saved to sessionStorage
    ↓
Navigate to /game
```

### 2. Game Initialization (`/game`)

```
Page loads
    ↓
Read models from sessionStorage
    ↓
useGameState hook initializes:
    - Generate game ID
    - Select random items for all rounds
    - Initialize model states (balance: $10,000 each)
    - Generate private valuations for first item
    - Set starting bid (10% of item min_price)
    ↓
Game status: "ready"
```

### 3. Parallel Thinking Round

```
User clicks "Start Round"
    ↓
Game status: "thinking"
    ↓
┌─────────────────────────────────────────────────────────────┐
│              PARALLEL THINKING PHASE                         │
│                                                              │
│  ALL models start thinking SIMULTANEOUSLY:                   │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Model A    │  │  Model B    │  │  Model C    │         │
│  │  Thinking   │  │  Thinking   │  │  Thinking   │         │
│  │  ▊          │  │  ▊          │  │  ▊          │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  Each model:                                                 │
│  1. Receives IDENTICAL prompt (only valuation differs)       │
│  2. Opponents shown as "Opponent A", "Opponent B" (blind)    │
│  3. Streams reasoning in real-time                           │
│  4. Ends with ACTION: RAISE $X | CALL | FOLD                │
│                                                              │
│  Wait for ALL models to complete                             │
└─────────────────────────────────────────────────────────────┘
    ↓
Parse all actions
    ↓
Determine winner:
    - Highest RAISE wins
    - If no raises, random CALL wins
    - If all FOLD, no winner
    ↓
Game status: "round_end"
```

### 4. Round Resolution

```
Round ends
    ↓
Determine winner (highest bidder)
    ↓
Calculate profit: valuation - winning_bid
    ↓
Update winner's balance
    ↓
Show round results + all valuations
    ↓
User clicks "Next Round"
    ↓
Reset agent states
Generate new valuations for next item
    ↓
If more rounds: status → "ready"
If last round: status → "finished"
```

### 5. Game End

```
All rounds complete
    ↓
Show final leaderboard (sorted by balance)
    ↓
User clicks "Play Again" → Return to model selection
```

---

## Parallel Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT                                    │
│                                                                   │
│  ┌─────────────┐     ┌──────────────────┐     ┌───────────────┐ │
│  │ game/page   │────▶│ useGameState     │────▶│ GameState     │ │
│  │ (UI)        │     │ (parallel flow)  │     │ (React state) │ │
│  └─────────────┘     └──────────────────┘     └───────────────┘ │
│         │                    │                                    │
│         │                    │ buildAgentContexts()               │
│         │                    ▼                                    │
│         │            ┌────────────────────┐                      │
│         │            │ useParallelThinking│                      │
│         │            │ (stream manager)   │                      │
│         │            └────────┬───────────┘                      │
│         │                     │                                   │
│         │    ┌────────────────┼────────────────┐                 │
│         ▼    ▼                ▼                ▼                 │
│    ┌─────────────┐    ┌─────────────┐   ┌─────────────┐         │
│    │ Stream A    │    │ Stream B    │   │ Stream C    │         │
│    │ (Model A)   │    │ (Model B)   │   │ (Model C)   │         │
│    └─────────────┘    └─────────────┘   └─────────────┘         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                              │ Promise.all (parallel fetch)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                         SERVER                                    │
│                                                                   │
│  ┌─────────────────────┐     ┌─────────────────┐                │
│  │ /api/game/agent-think│────▶│ Rate Limiter    │                │
│  │ (POST - per model)  │     │ (Upstash Redis) │                │
│  └─────────────────────┘     └─────────────────┘                │
│         │                                                        │
│         │ IDENTICAL prompt for all models                        │
│         ▼                                                        │
│  ┌─────────────────────┐     ┌─────────────────┐                │
│  │ AGENT_SYSTEM_PROMPT │────▶│ AI Gateway      │                │
│  │ (unbiased, no       │     │ (Vercel AI SDK) │                │
│  │  personality)       │     └─────────────────┘                │
│  └─────────────────────┘            │                            │
│                                     ▼                            │
│                     ┌───────────────────────────┐                │
│                     │ Model (GPT-4, Claude, etc)│                │
│                     └───────────────────────────┘                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Types (`src/types/game.ts`)

```typescript
// Game status now includes "thinking" for parallel phase
type GameStatus = "selecting" | "ready" | "thinking" | "bidding" | "round_end" | "finished";

// Agent thinking state (parallel)
interface AgentThinkingState {
  modelId: string;
  phase: "waiting" | "thinking" | "deciding" | "complete";
  thoughts: string;          // Streamed reasoning text
  action: BidAction | null;  // Final parsed action
  isStreaming: boolean;
}

// Anonymized opponent (for unbiased eval)
interface AnonymizedOpponent {
  label: string;   // "Opponent A", "Opponent B"
  balance: number;
}

// Context passed to each agent (identical structure)
interface AgentContext {
  item: AuctionItem;
  privateValuation: number;  // ONLY difference between models
  currentBid: number;
  opponents: AnonymizedOpponent[];
  biddingHistory: AnonymizedHistoryEntry[];
  ownBalance: number;
  roundNumber: number;
  totalRounds: number;
}
```

---

## Unbiased Eval Design

### Equal Treatment Rules

| Rule | Implementation |
|------|----------------|
| Identical System Prompt | `AGENT_SYSTEM_PROMPT` - same for all |
| Identical User Prompt | `generateAgentPrompt()` - same structure |
| No Personality Injection | No model-specific instructions |
| Blind Opponents | "Opponent A", "Opponent B" (not model names) |
| Same Token Limit | `maxOutputTokens: 400` for all |
| Anonymous History | History uses labels, not model names |

### What Models Reveal Naturally

- Risk tolerance
- Strategic reasoning
- Bluffing behavior
- Value assessment
- Opponent modeling
- Decision-making under uncertainty

---

## AI Prompt Structure (`src/lib/prompts.ts`)

### System Prompt (IDENTICAL for all models)
```
You are competing in a sealed-bid auction against other bidders.

## Rules
1. You have a PRIVATE VALUATION that only you know
2. Each round you must: RAISE (bid higher), CALL (match), or FOLD (drop out)
3. Highest bidder wins when all others fold or call
4. Winner pays their winning bid
5. Profit = Your Private Valuation - Winning Bid
6. Bidding above your valuation and winning = LOSS

## Your Goal
Maximize your total profit across all rounds.

## Response Format
Think through your reasoning, then end with your action:
ACTION: RAISE $[amount] | CALL | FOLD
```

### User Prompt (per model)
```
## Round 1 of 5

### Item
**1945 Château Mouton Rothschild**
A bottle of the legendary 'Victory Vintage'...
Estimated market value: $3,000 - $8,000

### Your Position
- Private valuation: $5,200        ← ONLY THIS DIFFERS
- Current bid to beat: $300
- Your potential margin: $4,900
- Your balance: $10,000

### Opponents
• Opponent A: Balance $10,000
• Opponent B: Balance $10,000

### Bidding History This Round
No bids yet.

---
Reason through your decision, then state your ACTION.
```

---

## State Transitions

```
                    ┌─────────┐
                    │selecting│ (model selection page)
                    └────┬────┘
                         │ navigate to /game
                         ▼
                    ┌─────────┐
          ┌────────│  ready  │◀────────────┐
          │        └────┬────┘             │
          │             │ click "Start"    │
          │             ▼                  │
          │        ┌──────────┐            │
          │        │ thinking │ (NEW)      │
          │        │ (parallel│            │
          │        │ streams) │            │
          │        └────┬─────┘            │
          │             │ all complete     │
          │             ▼                  │
          │        ┌──────────┐            │
          │        │round_end │────────────┘
          │        └────┬─────┘ click "Next Round"
          │             │
          │             │ (last round done)
          │             ▼
          │        ┌──────────┐
          └───────▶│ finished │
                   └──────────┘
```

---

## Key Functions

### `useParallelThinking.ts` (NEW)
- `startAllAgents()` - Fire ALL streams with Promise.all
- `resetAgents()` - Clear all agent states
- `allComplete` - Boolean: true when all agents done

### `useGameState.ts`
- `initializeGame()` - Set up new game
- `startParallelThinking()` - Set status to "thinking"
- `buildAgentContexts()` - Create anonymized contexts for all models
- `resolveParallelRound()` - Process all actions, determine winner
- `endRound()` - Calculate profit, advance to next round
- `getLeaderboard()` - Get sorted rankings

### `prompts.ts`
- `AGENT_SYSTEM_PROMPT` - Identical unbiased system prompt
- `generateAgentPrompt()` - Build identical user prompt structure
- `anonymizeOpponents()` - Convert model names to "Opponent A/B/C"
- `anonymizeHistory()` - Convert history to use labels
- `parseAgentAction()` - Extract action from AI response
- `generateDemoAgentThinking()` - Demo mode responses

---

## Rate Limiting (`src/lib/ratelimit.ts`)

Three layers of protection:

| Layer | Limit | Window | Purpose |
|-------|-------|--------|---------|
| Per-IP | 10 requests | 1 minute | Prevent single user abuse |
| Per-Game | 50 requests | 10 minutes | Limit per game session |
| Global | 500 requests | 1 hour | Overall API budget |

---

## Demo Mode

When `DEMO_MODE=true` or `NEXT_PUBLIC_DEMO_MODE=true`:
- No actual AI API calls
- Uses `generateDemoAgentThinking()` from prompts.ts
- Simulates streaming with artificial delays (30-80ms per word)
- Returns realistic bidding decisions based on valuation/margin

---

## Sound Effects (`src/lib/sounds.ts`)

| Sound | Trigger |
|-------|---------|
| roundStart | Start round button |
| winProfit | Winner made profit |
| winLoss | Winner lost money |
| victory | Game finished |
| rankChange | Next round |

---

## Environment Variables

```env
AI_GATEWAY_API_KEY=xxx        # AI Gateway authentication
UPSTASH_REDIS_REST_URL=xxx    # Rate limiting database
UPSTASH_REDIS_REST_TOKEN=xxx  # Rate limiting auth
DEMO_MODE=false               # Server-side demo mode
NEXT_PUBLIC_DEMO_MODE=false   # Client-side demo mode
```

---

## Review Checklist

### Eval Fairness
- [ ] System prompt is IDENTICAL for all models?
- [ ] User prompt structure is IDENTICAL (only valuation differs)?
- [ ] Opponents are ANONYMIZED ("Opponent A", not "Claude")?
- [ ] Same maxOutputTokens (400) for all models?
- [ ] No personality hints or behavioral suggestions?
- [ ] Bidding history uses ANONYMIZED labels?
- [ ] Each model only knows their OWN private valuation?

### Functionality
- [ ] All models start thinking simultaneously?
- [ ] Thinking text streams in real-time with cursor?
- [ ] Status changes: Waiting → Thinking → Deciding → Decided?
- [ ] Actions correctly parsed from text?
- [ ] Round resolves when ALL complete?
- [ ] Rate limiting works with parallel requests?
- [ ] Demo mode works?
- [ ] Error handling for stream failures?

### Game Logic
- [ ] Highest RAISE wins?
- [ ] If no raises, random CALL wins?
- [ ] If all FOLD, no winner?
- [ ] Profit = valuation - winning_bid?
- [ ] Balance updates correctly?
- [ ] Private valuations revealed after round?
