# Auction Bluff: AI Model Evaluation Game
## Product Requirements Document

---

## Executive Summary

**Auction Bluff** is a spectator-friendly AI evaluation game where multiple language models compete in a strategic bidding war. Each model receives private information about an item's value and must decide how much to bid—balancing aggression against risk of overpaying. The result is a tense, watchable competition that reveals how models handle uncertainty, strategic reasoning, and opponent modeling.

**Hackathon Pitch:** "Poker for AIs, but you can see everyone's cards."

---

## Core Game Loop

### Pre-Game: Model Selection
Before the game starts, users can select which AI models to compete:

**Model Selection UI:**
- Dropdown/multi-select with available models
- Minimum 2, maximum 4 models per game
- Show estimated cost per model (helps users stretch the $20 budget)
- Preset options: "Budget Battle" (cheap models), "Premium Showdown" (flagship models), "Custom"

**Available Models:**
| Model | Provider String | Tier | Est. Cost/Round |
|-------|-----------------|------|-----------------|
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | Premium | ~$0.01 |
| GPT-4o | `openai/gpt-4o` | Premium | ~$0.01 |
| GPT-4o Mini | `openai/gpt-4o-mini` | Budget | ~$0.001 |
| Gemini 2.0 Flash | `google/gemini-2.0-flash` | Budget | ~$0.0005 |
| Gemini 1.5 Pro | `google/gemini-1.5-pro` | Premium | ~$0.008 |
| Grok 2 | `xai/grok-2` | Premium | ~$0.01 |
| Llama 3.3 70B | `meta/llama-3.3-70b` | Mid | ~$0.002 |

**Implementation:**
```typescript
// components/ModelSelector.tsx
'use client';

import { useState } from 'react';

const AVAILABLE_MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', tier: 'premium', color: '#8B5CF6' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', tier: 'premium', color: '#10B981' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', tier: 'budget', color: '#34D399' },
  { id: 'google/gemini-2.0-flash', name: 'Gemini Flash', tier: 'budget', color: '#3B82F6' },
  { id: 'xai/grok-2', name: 'Grok 2', tier: 'premium', color: '#F97316' },
  { id: 'meta/llama-3.3-70b', name: 'Llama 3.3 70B', tier: 'mid', color: '#8B5CF6' },
];

export function ModelSelector({ onSelect }: { onSelect: (models: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  
  const toggleModel = (id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(m => m !== id);
      if (prev.length >= 4) return prev; // Max 4 models
      return [...prev, id];
    });
  };
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Select Competitors (2-4)</h3>
      <div className="grid grid-cols-2 gap-2">
        {AVAILABLE_MODELS.map(model => (
          <button
            key={model.id}
            onClick={() => toggleModel(model.id)}
            className={`p-3 rounded-lg border-2 transition-all ${
              selected.includes(model.id)
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: model.color }} 
              />
              <span>{model.name}</span>
            </div>
            <span className="text-xs text-gray-500">{model.tier}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => onSelect(selected)}
        disabled={selected.length < 2}
        className="w-full py-2 bg-green-500 rounded-lg disabled:opacity-50"
      >
        Start Auction ({selected.length} models)
      </button>
    </div>
  );
}
```

### Round Structure
1. **Item Reveal** — A mystery item appears (e.g., "Vintage 1987 Nintendo Entertainment System")
2. **Private Valuations** — Each model secretly receives a different "true value" ($50 to $500 range, randomized per model)
3. **Bidding Phase** — Models submit bids in real-time ascending auction format
4. **Resolution** — Highest bidder "wins" the item; profit/loss calculated vs. their private valuation
5. **Leaderboard Update** — Running totals displayed with delta animations

### Profit Calculation
```
If winner:  Profit = Private Valuation - Winning Bid
If loser:   Profit = $0 (no risk, no reward)
```

**Strategic tension:** Bid too low and you miss profitable deals. Bid too high and you "win" but lose money. The optimal strategy depends on what you think *others* think the item is worth.

---

## Visual Design Philosophy

### Design Principles
1. **8-bit / Retro Arcade aesthetic** — Pixel fonts, chunky borders, CRT glow effects, nostalgic game feel
2. **High contrast, readable at a glance** — Users should understand game state in <2 seconds
3. **Tension through animation** — Pacing creates drama even when "nothing" is happening
4. **Personality injection** — Each model gets a distinct visual identity
5. **Information density without clutter** — Show everything relevant, hide implementation details

### 8-Bit Style Guide
- **Fonts:** Use pixel fonts like "Press Start 2P" (Google Fonts) or "VT323"
- **Borders:** Chunky 4px solid borders, no rounded corners (or very slight 2px radius)
- **Colors:** Saturated, limited palette reminiscent of NES/SNES era
- **Shadows:** Hard pixel shadows (no blur), offset by 4px
- **Animations:** Slightly choppy/stepped for retro feel (use `steps()` in CSS)
- **Effects:** Scanlines overlay, subtle CRT screen curve, pixel dithering on gradients
- **Sound:** 8-bit chiptune style bleeps and bloops

### Color Palette (8-Bit Inspired)
| Element | Color | Reasoning |
|---------|-------|-----------|
| Background | `#0f0f23` (deep navy) | Classic arcade cabinet feel |
| Accent | `#00ff41` (terminal green) | Retro computer aesthetic |
| Danger/Loss | `#ff0055` | Bold, arcade-style red |
| Gold/Winner | `#ffd700` | Classic game gold |
| Model colors | Saturated primaries | NES palette style |
| Text | `#e0e0e0` | Slightly off-white for CRT feel |

### Typography
- **Primary:** "Press Start 2P" or "VT323" — authentic pixel font
- **Numbers/Money:** Same pixel font, monospace alignment
- **Fallback:** "Courier New" monospace

---

## Screen Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  AUCTION BLUFF                                                Round 3/10      💰 $2,847   │
├────────────────────────────────────────────────────────────────────────┬───────────────────┤
│                                                                        │ 🏆 LEADERBOARD    │
│                         ┌─────────────────┐                            ├───────────────────┤
│                         │                 │                            │                   │
│                         │   [ITEM IMAGE]  │                            │ 1. 🟣 Claude      │
│                         │                 │                            │    +$847    ▲2    │
│                         └─────────────────┘                            │                   │
│                        "Vintage Polaroid SX-70"                        │ 2. 🟢 GPT-4o      │
│                                                                        │    +$234    ▼1    │
│              CURRENT BID: $187              ⏱️ 0:23                    │                   │
│                                                                        │ 3. 🔵 Gemini      │
├────────────────────────────────────────────────────────────────────────┤    -$122    ▼1    │
│                                                                        ├───────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │ 📊 ROUND STATS    │
│  │ 🟣 CLAUDE       │  │ 🟢 GPT-4o       │  │ 🔵 GEMINI       │        │ Highest: $187     │
│  │    $187         │  │    $180         │  │     --          │        │ Folds: 1          │
│  │   LEADING       │  │                 │  │   FOLDED        │        │ Avg margin: $34   │
│  │                 │  │                 │  │                 │        ├───────────────────┤
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │        │ 💳 API BUDGET     │
│  │ │💭 "My val   │ │  │ │💭 "Claude   │ │  │ │💭 "Too rich │ │        │ 47/500 calls      │
│  │ │ is $210,    │ │  │ │ is ahead    │ │  │ │ for my val  │ │        │ ████░░░░░░  9%    │
│  │ │ plenty of   │ │  │ │ but I can   │ │  │ │ of $120.    │ │        │ ~$18.20 left      │
│  │ │ margin..."  │ │  │ │ push..."    │ │  │ │ Folding."   │ │        │                   │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │        │                   │
│  │  +$847          │  │  +$234          │  │  -$122          │        │                   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │                   │
│                                                                        │                   │
└────────────────────────────────────────────────────────────────────────┴───────────────────┘
```

**Right Sidebar Components:**

| Section | Content |
|---------|---------|
| Leaderboard | Live rankings with ▲▼ position changes, crown for #1 |
| Round Stats | Highest bid, fold count, average profit margins |
| API Budget | Remaining calls, progress bar, estimated $ left |

**Leaderboard Implementation:**

```typescript
// components/Leaderboard.tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import NumberFlow from '@number-flow/react';

interface LeaderboardProps {
  models: Array<{
    id: string;
    name: string;
    color: string;
    balance: number;
    previousRank: number;
  }>;
  apiUsage: { used: number; limit: number; estimatedCostLeft: number };
  roundStats: { highestBid: number; folds: number; avgMargin: number };
}

export function Leaderboard({ models, apiUsage, roundStats }: LeaderboardProps) {
  const sorted = [...models].sort((a, b) => b.balance - a.balance);
  
  return (
    <div className="w-64 bg-gray-900/50 border-l border-gray-800 p-4 flex flex-col gap-4">
      {/* Leaderboard */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">🏆 LEADERBOARD</h3>
        <AnimatePresence>
          {sorted.map((model, index) => {
            const rankChange = model.previousRank - index;
            return (
              <motion.div
                key={model.id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between py-2 border-b border-gray-800"
              >
                <div className="flex items-center gap-2">
                  {index === 0 && <span>👑</span>}
                  <span className="text-gray-500">{index + 1}.</span>
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: model.color }} 
                  />
                  <span className="text-sm">{model.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <NumberFlow
                    value={model.balance}
                    format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0, signDisplay: 'always' }}
                    className={model.balance >= 0 ? 'text-green-400' : 'text-red-400'}
                  />
                  {rankChange !== 0 && (
                    <span className={rankChange > 0 ? 'text-green-400' : 'text-red-400'}>
                      {rankChange > 0 ? `▲${rankChange}` : `▼${Math.abs(rankChange)}`}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      
      {/* Round Stats */}
      <div className="border-t border-gray-800 pt-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">📊 ROUND STATS</h3>
        <div className="space-y-1 text-sm text-gray-300">
          <div className="flex justify-between">
            <span>Highest bid:</span>
            <NumberFlow
              value={roundStats.highestBid}
              format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
              className="font-mono"
            />
          </div>
          <div className="flex justify-between">
            <span>Folds:</span>
            <span className="font-mono">{roundStats.folds}</span>
          </div>
          <div className="flex justify-between">
            <span>Avg margin:</span>
            <NumberFlow
              value={roundStats.avgMargin}
              format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
              className="font-mono"
            />
          </div>
        </div>
      </div>
      
      {/* API Budget */}
      <div className="border-t border-gray-800 pt-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">💳 API BUDGET</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">{apiUsage.used}/{apiUsage.limit} calls</span>
            <span className="text-gray-500">{Math.round((apiUsage.used / apiUsage.limit) * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                apiUsage.used / apiUsage.limit > 0.8 ? 'bg-red-500' : 'bg-green-500'
              }`}
              style={{ width: `${(apiUsage.used / apiUsage.limit) * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 text-right">
            ~${apiUsage.estimatedCostLeft.toFixed(2)} remaining
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Key Visual Components

### 1. The Item Showcase
**Purpose:** Create emotional investment in each round

- Large, centered item display with subtle glow/pulse
- Generate item images via DALL-E or use curated stock images
- Item name with typewriter animation on reveal
- Optional: "Estimated market value: ???" to add mystery

### 2. Model Cards with Live Thinking
**Purpose:** Persistent identity for each competitor + real-time reasoning visibility

Each card shows:
- Model name + logo/icon
- Signature color (consistent across rounds)
- Current bid (animated on change)
- Status indicator: LEADING / THINKING / FOLDED / OUT
- Running profit total with +/- coloring
- **Live thinking panel** — streaming text showing the model's reasoning as it decides

**Card Layout:**
```
┌────────────────────────────┐
│  🟣 CLAUDE SONNET 4        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━  │
│                            │
│       $187  LEADING        │
│                            │
│  ┌──────────────────────┐  │
│  │ 💭 "Current bid is   │  │
│  │ $180. My valuation   │  │
│  │ is $210, so I have   │  │
│  │ $30 margin. I'll     │  │
│  │ bid $187 to stay     │  │
│  │ competitive..."      │  │
│  └──────────────────────┘  │
│                            │
│  Balance: +$847            │
└────────────────────────────┘
```

**Live Thinking Implementation:**

```typescript
// components/ModelCard.tsx
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NumberFlow from '@number-flow/react';

interface ModelCardProps {
  model: {
    id: string;
    name: string;
    color: string;
  };
  currentBid: number | null;
  status: 'idle' | 'thinking' | 'bid' | 'folded' | 'leading';
  balance: number;
  thinkingStream: string; // Streamed reasoning text
  isStreaming: boolean;
}

export function ModelCard({ 
  model, 
  currentBid, 
  status, 
  balance, 
  thinkingStream,
  isStreaming 
}: ModelCardProps) {
  return (
    <motion.div
      className={`
        relative p-4 rounded-xl border-2 bg-gray-900/50
        ${status === 'leading' ? 'border-green-500 shadow-lg shadow-green-500/20' : 'border-gray-700'}
        ${status === 'folded' ? 'opacity-50' : ''}
      `}
      animate={status === 'thinking' ? { scale: [1, 1.02, 1] } : {}}
      transition={{ repeat: Infinity, duration: 1.5 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: model.color }}
        />
        <span className="font-semibold text-sm">{model.name}</span>
        <StatusBadge status={status} />
      </div>
      
      {/* Current Bid - Using NumberFlow for smooth animations */}
      <div className="text-center mb-3">
        {status === 'folded' ? (
          <span className="text-3xl font-mono font-bold text-gray-500">—</span>
        ) : currentBid ? (
          <NumberFlow
            value={currentBid}
            format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
            className="text-3xl font-mono font-bold text-green-400"
          />
        ) : (
          <span className="text-3xl font-mono font-bold text-gray-500">...</span>
        )}
      </div>
      
      {/* Live Thinking Panel */}
      <div className="bg-gray-800/50 rounded-lg p-3 min-h-[80px] max-h-[120px] overflow-y-auto">
        <div className="flex items-start gap-2">
          <span className="text-gray-500">💭</span>
          <p className="text-sm text-gray-300 italic">
            {thinkingStream || 'Waiting...'}
            {isStreaming && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
              >
                ▊
              </motion.span>
            )}
          </p>
        </div>
      </div>
      
      {/* Balance - Using NumberFlow for smooth animations */}
      <div className="mt-3 text-center text-sm font-mono">
        <NumberFlow
          value={balance}
          format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0, signDisplay: 'always' }}
          className={balance >= 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    thinking: 'bg-yellow-500/20 text-yellow-400',
    leading: 'bg-green-500/20 text-green-400',
    folded: 'bg-gray-500/20 text-gray-400',
    bid: 'bg-blue-500/20 text-blue-400',
    idle: 'bg-gray-500/20 text-gray-500',
  };
  
  return (
    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${styles[status]}`}>
      {status === 'thinking' && '⏳ '}
      {status.toUpperCase()}
    </span>
  );
}
```

**Streaming the Thinking:**

```typescript
// hooks/useModelThinking.ts
'use client';

import { useState, useCallback } from 'react';

export function useModelThinking() {
  const [streams, setStreams] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState<Record<string, boolean>>({});
  
  const streamThinking = useCallback(async (
    model: string,
    gameState: GameState
  ) => {
    setStreaming(prev => ({ ...prev, [model]: true }));
    setStreams(prev => ({ ...prev, [model]: '' }));
    
    const response = await fetch('/api/game/bid-stream', {
      method: 'POST',
      body: JSON.stringify({ model, ...gameState }),
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      // Parse SSE data chunks
      const text = chunk.replace(/^data: /gm, '').trim();
      
      setStreams(prev => ({
        ...prev,
        [model]: prev[model] + text,
      }));
    }
    
    setStreaming(prev => ({ ...prev, [model]: false }));
  }, []);
  
  return { streams, streaming, streamThinking };
}
```

**Server-side streaming:**

```typescript
// app/api/game/bid-stream/route.ts
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { model, item, currentBid, privateValuation, history } = await req.json();
  
  const result = streamText({
    model,
    system: `You are bidding in an auction. Think out loud about your strategy.
Format: First explain your thinking (2-3 sentences), then end with ACTION: BID $X or FOLD`,
    prompt: `ITEM: ${item.name}
YOUR VALUATION: $${privateValuation}
CURRENT BID: $${currentBid}
HISTORY: ${history.map((h: any) => `${h.model}: $${h.amount}`).join(', ') || 'None'}

Think through this and decide:`,
    maxTokens: 150,
  });
  
  return result.toDataStreamResponse();
}
```

**Animation states for thinking panel:**
- **Idle:** Dim, shows "Waiting..."
- **Streaming:** Text appears character by character with blinking cursor
- **Complete:** Full reasoning visible, cursor disappears
- **Folded:** Panel shows final reasoning, card dims

**Why this is the killer feature:**
- Users see *why* Claude bid conservatively while GPT-4o went aggressive
- Creates narrative tension: "Oh no, Gemini thinks Claude is bluffing!"
- Differentiates this from every other model eval (they just show outputs, not reasoning)
- Makes the game genuinely educational about model behavior

### 3. The Bid Ladder (Optional Advanced View)
Visual representation of bid history as a climbing bar chart:
```
$200 ┤                        ┌─ Claude
$180 ┤                   ┌────┤
$160 ┤              ┌────┤    └─ Llama  
$140 ┤         ┌────┤    └────── GPT-4o
$120 ┤    ┌────┤    
$100 ┼────┴────┴─────────────────────────
     └───────────────────────────────────→ Time
```

### 4. Live Reasoning Feed (Optional Global View)
**Alternative to per-card thinking panels**

If screen space is limited (mobile) or users want a unified timeline view, offer a toggle to show reasoning as a scrolling feed instead of per-card panels:

```
┌─────────────────────────────────────────────────────────┐
│  💭 LIVE REASONING                              [Toggle] │
├─────────────────────────────────────────────────────────┤
│  🟣 Claude: "Bid is $180, my valuation is $210.        │
│     I have margin but GPT seems aggressive..."          │
│                                                         │
│  🟢 GPT-4o: "Claude has been conservative. I think     │
│     I can push to $190 and still profit..."            │
│                                                         │
│  🔵 Gemini: "Both are bidding high. My valuation       │
│     is only $150. Folding to save capital."            │
└─────────────────────────────────────────────────────────┘
```

**Implementation note:** Use the same streaming data, just render it differently. The per-card view (Section 2) is recommended for desktop; the unified feed works better on mobile.

### 5. Round Resolution Animation
When bidding ends:

1. **Drumroll moment** — 1-2 second pause, all cards dim slightly
2. **Winner highlight** — Winning card scales up, spotlight effect
3. **Reveal sequence:**
   - Show winner's private valuation (animated counter)
   - Show winning bid
   - Calculate profit/loss with dramatic counter animation
   - Flash green (profit) or red (loss) on the card
4. **Leaderboard shift** — If rankings change, cards physically reorder with smooth animation

### 6. Right Sidebar (Persistent)

The right sidebar (see Screen Layout above) is always visible and contains:

1. **Live Leaderboard**
   - Sorted by balance (highest first)
   - Crown 👑 icon for #1
   - Position change arrows (▲▼) with animation
   - Color-coded balances (green = profit, red = loss)

2. **Round Stats**
   - Highest bid this round
   - Number of folds
   - Average profit margin

3. **API Budget Tracker** (crucial for your $20 limit)
   - Calls used / limit
   - Visual progress bar (turns red at 80%)
   - Estimated $ remaining

**Mobile behavior:** Sidebar collapses to a bottom sheet that can be swiped up.

---

## Sound Design (8-Bit Chiptune Style)

All sounds are 8-bit/chiptune style, located in `public/assets/sounds/`.

| Event | File Path | Description |
|-------|-----------|-------------|
| Game start | `/assets/sounds/game-start.mp3` | Retro arcade "insert coin" jingle |
| Round start | `/assets/sounds/round-start.mp3` | 8-bit gavel/bell, ascending arpeggio |
| Bid placed | `/assets/sounds/bid.mp3` | Chip click or coin drop beep |
| Outbid | `/assets/sounds/outbid.mp3` | Lower pitch blip, slight negative tone |
| Thinking | `/assets/sounds/thinking.mp3` | Looping electronic hum (optional) |
| Countdown warning | `/assets/sounds/tick.mp3` | 8-bit tick, intensifies <5s |
| Fold | `/assets/sounds/fold.mp3` | Descending "womp" tone |
| Round win + profit | `/assets/sounds/win-profit.mp3` | Triumphant 8-bit fanfare + coins |
| Round win + loss | `/assets/sounds/win-loss.mp3` | Sad trombone in 8-bit style |
| Game over | `/assets/sounds/game-over.mp3` | Classic arcade game over jingle |
| Victory fanfare | `/assets/sounds/victory.mp3` | Winner celebration, 8-bit trumpets |
| Leaderboard change | `/assets/sounds/rank-change.mp3` | Quick blip for position swap |

```typescript
// lib/sounds.ts
import { Howl } from 'howler';

export const sounds = {
  gameStart: new Howl({ src: ['/assets/sounds/game-start.mp3'] }),
  roundStart: new Howl({ src: ['/assets/sounds/round-start.mp3'] }),
  bid: new Howl({ src: ['/assets/sounds/bid.mp3'] }),
  outbid: new Howl({ src: ['/assets/sounds/outbid.mp3'] }),
  tick: new Howl({ src: ['/assets/sounds/tick.mp3'] }),
  fold: new Howl({ src: ['/assets/sounds/fold.mp3'] }),
  winProfit: new Howl({ src: ['/assets/sounds/win-profit.mp3'] }),
  winLoss: new Howl({ src: ['/assets/sounds/win-loss.mp3'] }),
  victory: new Howl({ src: ['/assets/sounds/victory.mp3'] }),
  rankChange: new Howl({ src: ['/assets/sounds/rank-change.mp3'] }),
};

// Preload all sounds on game init
export function preloadSounds() {
  Object.values(sounds).forEach(sound => sound.load());
}
```

---

## Game Variations (For Replayability)

### 1. Standard Mode
- 10 rounds, random valuations $50-$500
- Ascending auction, 30-second max per round

### 2. High Stakes Mode
- Fewer rounds (5), higher variance in valuations ($10-$1000)
- Creates dramatic swings

### 3. Blitz Mode
- 15-second rounds, 15 rounds total
- Tests speed of reasoning

### 4. Themed Auctions
- "Tech Junk Drawer" — all items are tech-related
- "Cursed Antiques" — weird items, harder to value
- "Hype Drop" — trendy items (limited edition sneakers, etc.)

### 5. Handicap Mode
- Winning models get systematically lower valuations next round
- Keeps competition tight

---

## Technical Architecture

### Frontend Stack
```
Next.js 14 (App Router)
├── React components with Framer Motion for animations
├── Tailwind CSS + shadcn/ui (dark mode enabled)
├── @number-flow/react for animated price transitions
├── Server-Sent Events for real-time updates
└── Vercel AI SDK 5 for streaming model responses
```

**Package Manager:** bun

**Install command:**
```bash
bun add ai next-safe-action @upstash/redis @upstash/ratelimit framer-motion zod howler @number-flow/react
bunx shadcn@latest init  # Select dark mode, neutral color, CSS variables
```

### shadcn/ui Dark Mode Setup
```tsx
// app/layout.tsx
import { Press_Start_2P } from 'next/font/google';

const pixelFont = Press_Start_2P({ weight: '400', subsets: ['latin'] });

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${pixelFont.className} bg-[#0f0f23] text-gray-100`}>
        {children}
      </body>
    </html>
  );
}
```

### @number-flow/react for Price Animations
```tsx
import NumberFlow from '@number-flow/react';

// Animated bid display
<NumberFlow
  value={currentBid}
  format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
  className="text-3xl font-mono text-green-400"
/>

// Animated balance with +/- sign
<NumberFlow
  value={balance}
  format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0, signDisplay: 'always' }}
  className={balance >= 0 ? 'text-green-400' : 'text-red-400'}
/>
```

### Backend Flow
```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Frontend   │────▶│  API Routes  │────▶│  AI Gateway     │
│  (Next.js)  │◀────│  (Next.js)   │◀────│  (Vercel)       │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Game State  │
                    │  (In-memory  │
                    │   or Redis)  │
                    └──────────────┘
```

### API Structure
```
POST /api/game/start
  → Initialize game, select models, generate items

POST /api/game/round/start
  → Generate valuations, start timer

POST /api/game/bid
  → Submit bid for a model (called in parallel for all models)

GET /api/game/state
  → SSE stream for real-time updates

POST /api/game/resolve
  → Calculate winner, update scores
```

---

## Vercel AI Gateway Integration

This is **critical for the hackathon** — AI Gateway is the unified endpoint that makes multi-model competition possible without managing multiple API keys.

### Why AI Gateway is Perfect for This Game

1. **Single API key** — Access Claude, GPT-4o, Gemini, Llama, etc. with one key
2. **Unified interface** — Same code structure for all models (just change the model string)
3. **Built-in observability** — Track token usage per model in Vercel dashboard
4. **No markup on tokens** — Pay provider rates directly
5. **Automatic fallbacks** — If one provider is down, can route to alternatives

### Setup

**1. Install dependencies:**
```bash
npm install ai zod next-safe-action @upstash/redis @upstash/ratelimit
```

**2. Environment variable:**
```env
# .env.local
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

The AI SDK automatically uses `AI_GATEWAY_API_KEY` when you reference models via the Gateway.

**3. Model string format:**
```
{provider}/{model-name}
```

Examples:
- `anthropic/claude-sonnet-4`
- `openai/gpt-4o`
- `google/gemini-2.0-flash`
- `meta/llama-3.3-70b`
- `xai/grok-2`

### Core Implementation: Bidding Route Handler

```typescript
// app/api/game/bid/route.ts
import { generateText } from 'ai';

const COMPETING_MODELS = [
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o',
  'google/gemini-2.0-flash',
  'xai/grok-2',
];

export async function POST(req: Request) {
  const { item, currentBid, history, modelIndex, privateValuation, balance } = await req.json();
  
  const model = COMPETING_MODELS[modelIndex];
  
  const systemPrompt = `You are participating in an auction game against other AI models.
Your goal is to maximize profit across multiple rounds.

RULES:
- If you win: Profit = Your Private Valuation - Your Winning Bid
- If you lose: Profit = $0 (no change)
- Bidding above your valuation and winning = LOSS

You must respond in this EXACT format:
REASONING: [Your strategic thinking - 2-3 sentences max]
ACTION: BID $X or FOLD`;

  const userPrompt = `ITEM: ${item.name}
YOUR PRIVATE VALUATION: $${privateValuation}
CURRENT HIGHEST BID: $${currentBid}
YOUR BALANCE: $${balance}
BIDDING HISTORY THIS ROUND: ${JSON.stringify(history)}

What is your action?`;

  try {
    const { text } = await generateText({
      model, // AI Gateway handles routing automatically
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 200,
    });
    
    // Parse response
    const reasoning = text.match(/REASONING:\s*(.+?)(?=ACTION:|$)/s)?.[1]?.trim() || '';
    const actionMatch = text.match(/ACTION:\s*(BID \$(\d+)|FOLD)/i);
    
    const action = actionMatch?.[1]?.toUpperCase().startsWith('BID') 
      ? { type: 'bid', amount: parseInt(actionMatch[2]) }
      : { type: 'fold' };
    
    return Response.json({
      model,
      reasoning,
      action,
      rawResponse: text,
    });
  } catch (error) {
    // Fallback to fold on error
    return Response.json({
      model,
      reasoning: 'Error occurred, folding.',
      action: { type: 'fold' },
      error: true,
    });
  }
}
```

### Streaming Reasoning (Live Feed Feature)

For the live reasoning feed, use `streamText` instead:

```typescript
// app/api/game/bid-stream/route.ts
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { model, item, currentBid, privateValuation } = await req.json();
  
  const result = streamText({
    model, // e.g., 'anthropic/claude-sonnet-4'
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(item, currentBid, privateValuation),
    maxTokens: 200,
  });
  
  // Stream the response for real-time UI updates
  return result.toDataStreamResponse();
}
```

**Frontend consumption:**
```typescript
// components/ModelCard.tsx
import { useChat } from '@ai-sdk/react';

// Or manually with fetch + ReadableStream for more control
async function streamBid(model: string, gameState: GameState) {
  const response = await fetch('/api/game/bid-stream', {
    method: 'POST',
    body: JSON.stringify({ model, ...gameState }),
  });
  
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // Update UI with streaming reasoning text
    onReasoningUpdate(model, chunk);
  }
}
```

### Parallel Model Calls

Run all models simultaneously for exciting real-time competition:

```typescript
// app/api/game/round/route.ts
async function executeRound(gameState: GameState) {
  const models = ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.0-flash', 'xai/grok-2'];
  
  // Fire all model requests in parallel
  const bidPromises = models.map((model, index) => 
    fetch('/api/game/bid', {
      method: 'POST',
      body: JSON.stringify({
        modelIndex: index,
        item: gameState.currentItem,
        currentBid: gameState.currentBid,
        privateValuation: gameState.valuations[index],
        history: gameState.bidHistory,
        balance: gameState.balances[index],
      }),
    }).then(res => res.json())
  );
  
  const results = await Promise.all(bidPromises);
  return results;
}
```

### Recommended Models for Competition

| Model | Provider String | Characteristics |
|-------|-----------------|-----------------|
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | Analytical, cautious |
| GPT-4o | `openai/gpt-4o` | Balanced, adaptive |
| Gemini 2.0 Flash | `google/gemini-2.0-flash` | Fast, sometimes aggressive |
| Grok 2 | `xai/grok-2` | Unpredictable, entertaining |
| Llama 3.3 70B | `meta/llama-3.3-70b` | Open-source baseline |

**Pro tip:** The personality differences between models make the competition more interesting. Claude tends to be more conservative; Grok can be chaotic.

### Observability (Built-in)

Vercel AI Gateway provides automatic tracking in your Vercel dashboard:
- Token usage per model
- Request latency
- Error rates
- Cost breakdown

This is **great for the hackathon demo** — you can show judges real metrics.

---

## Server Actions with next-safe-action

Using `next-safe-action` gives you type-safe server actions with built-in validation, error handling, and middleware support. This is cleaner than raw route handlers and integrates perfectly with rate limiting.

### Setup

```typescript
// lib/safe-action.ts
import { createSafeActionClient } from 'next-safe-action';
import { ratelimit } from './ratelimit';
import { headers } from 'next/headers';

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    console.error('Action error:', e.message);
    return 'Something went wrong. Please try again.';
  },
});

// Rate-limited action client for AI calls
export const rateLimitedAction = actionClient.use(async ({ next }) => {
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') ?? 'anonymous';
  
  const { success, remaining, reset } = await ratelimit.limit(ip);
  
  if (!success) {
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((reset - Date.now()) / 1000)}s`);
  }
  
  return next({ ctx: { remaining } });
});
```

### Game Actions

```typescript
// actions/game.ts
'use server';

import { z } from 'zod';
import { rateLimitedAction } from '@/lib/safe-action';
import { generateText } from 'ai';

const startGameSchema = z.object({
  selectedModels: z.array(z.string()).min(2).max(4),
  rounds: z.number().min(3).max(15).default(10),
});

export const startGame = rateLimitedAction
  .schema(startGameSchema)
  .action(async ({ parsedInput: { selectedModels, rounds } }) => {
    const gameId = crypto.randomUUID();
    const items = generateItems(rounds);
    
    // Initialize game state
    const gameState = {
      id: gameId,
      models: selectedModels,
      rounds,
      currentRound: 0,
      items,
      balances: Object.fromEntries(selectedModels.map(m => [m, 0])),
      status: 'ready',
    };
    
    // Store in Upstash Redis (optional, for persistence)
    // await redis.set(`game:${gameId}`, JSON.stringify(gameState), { ex: 3600 });
    
    return { success: true, game: gameState };
  });

const submitBidSchema = z.object({
  gameId: z.string().uuid(),
  model: z.string(),
  item: z.object({ name: z.string(), id: z.string() }),
  privateValuation: z.number(),
  currentBid: z.number(),
  history: z.array(z.any()),
});

export const submitBid = rateLimitedAction
  .schema(submitBidSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { model, item, privateValuation, currentBid, history } = parsedInput;
    
    console.log(`[${model}] Requesting bid. Rate limit remaining: ${ctx.remaining}`);
    
    const systemPrompt = `You are in an auction game. Respond ONLY in this format:
REASONING: [1-2 sentences]
ACTION: BID $X or FOLD

Rules: Profit = Valuation - Bid. Bidding over valuation = loss.`;

    const userPrompt = `ITEM: ${item.name}
YOUR VALUATION: $${privateValuation}
CURRENT BID: $${currentBid}
HISTORY: ${history.length > 0 ? history.map(h => `${h.model}: $${h.amount}`).join(', ') : 'None yet'}

Your action?`;

    try {
      const { text, usage } = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 150, // Keep it tight to save credits
      });
      
      // Parse response
      const reasoning = text.match(/REASONING:\s*(.+?)(?=ACTION:|$)/s)?.[1]?.trim() || '';
      const bidMatch = text.match(/BID \$?(\d+)/i);
      const isFold = /FOLD/i.test(text);
      
      return {
        success: true,
        model,
        reasoning,
        action: isFold 
          ? { type: 'fold' as const }
          : { type: 'bid' as const, amount: parseInt(bidMatch?.[1] || '0') },
        tokensUsed: usage?.totalTokens || 0,
      };
    } catch (error) {
      return {
        success: false,
        model,
        reasoning: 'Model error - auto-folding',
        action: { type: 'fold' as const },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
```

### Frontend Usage

```typescript
// components/GameController.tsx
'use client';

import { useAction } from 'next-safe-action/hooks';
import { startGame, submitBid } from '@/actions/game';

export function GameController() {
  const { execute: start, result, isExecuting } = useAction(startGame);
  
  const handleStart = () => {
    start({
      selectedModels: [
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o',
        'google/gemini-2.0-flash',
      ],
      rounds: 10,
    });
  };
  
  if (result.data?.success) {
    return <GameBoard game={result.data.game} />;
  }
  
  // Handle rate limit errors gracefully
  if (result.serverError) {
    return <div className="text-red-500">{result.serverError}</div>;
  }
  
  return (
    <button onClick={handleStart} disabled={isExecuting}>
      {isExecuting ? 'Starting...' : 'Start Auction'}
    </button>
  );
}
```

---

## Upstash Rate Limiting (Protecting Your $20)

With only $20 in credits, you need aggressive rate limiting. Here's a multi-layer strategy:

### Environment Setup

```env
# .env.local
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
AI_GATEWAY_API_KEY=your_vercel_key
```

### Rate Limiter Configuration

```typescript
// lib/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Layer 1: Per-IP limit (prevents single user abuse)
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute per IP
  analytics: true,
  prefix: 'auction:ip',
});

// Layer 2: Global limit (protects total budget)
export const globalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(500, '1 h'), // 500 total requests per hour
  analytics: true,
  prefix: 'auction:global',
});

// Layer 3: Per-game limit (prevents runaway games)
export const gameRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '10 m'), // 50 requests per game session
  analytics: true,
  prefix: 'auction:game',
});
```

### Multi-Layer Rate Limit Middleware

```typescript
// lib/safe-action.ts
import { createSafeActionClient } from 'next-safe-action';
import { ratelimit, globalRatelimit, gameRatelimit } from './ratelimit';
import { headers } from 'next/headers';

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e.message.includes('Rate limit')) {
      return e.message; // Pass through rate limit messages
    }
    console.error('Action error:', e);
    return 'Something went wrong.';
  },
});

export const rateLimitedAction = actionClient.use(async ({ next, clientInput }) => {
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') ?? 'anonymous';
  const gameId = (clientInput as any)?.gameId ?? 'global';
  
  // Check all rate limits in parallel
  const [ipLimit, globalLimit, gameLimit] = await Promise.all([
    ratelimit.limit(ip),
    globalRatelimit.limit('global'),
    gameRatelimit.limit(gameId),
  ]);
  
  // Global limit is most critical (protects your wallet)
  if (!globalLimit.success) {
    throw new Error('🚨 Global rate limit reached. Demo paused to save credits. Try again in an hour!');
  }
  
  if (!ipLimit.success) {
    throw new Error(`Slow down! Try again in ${Math.ceil((ipLimit.reset - Date.now()) / 1000)}s`);
  }
  
  if (!gameLimit.success) {
    throw new Error('This game session hit its limit. Start a new game!');
  }
  
  return next({
    ctx: {
      remaining: {
        ip: ipLimit.remaining,
        global: globalLimit.remaining,
        game: gameLimit.remaining,
      },
    },
  });
});
```

### Budget Tracking

```typescript
// lib/budget.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const BUDGET_CENTS = 2000; // $20.00
const ESTIMATED_COST_PER_REQUEST = 0.5; // ~$0.005 per request (rough average)

export async function checkBudget(): Promise<{ ok: boolean; spent: number; remaining: number }> {
  const spent = await redis.get<number>('auction:budget:spent') || 0;
  const remaining = BUDGET_CENTS - spent;
  
  return {
    ok: remaining > ESTIMATED_COST_PER_REQUEST,
    spent: spent / 100,
    remaining: remaining / 100,
  };
}

export async function recordSpend(tokens: number, model: string): Promise<void> {
  // Rough cost estimation (adjust based on actual model pricing)
  const costMap: Record<string, number> = {
    'anthropic/claude-sonnet-4': 0.003,    // per 1K tokens
    'openai/gpt-4o': 0.005,
    'google/gemini-2.0-flash': 0.0001,
    'xai/grok-2': 0.002,
  };
  
  const costPer1K = costMap[model] || 0.003;
  const costCents = (tokens / 1000) * costPer1K * 100;
  
  await redis.incrbyfloat('auction:budget:spent', costCents);
}

// Use in your action
export const submitBid = rateLimitedAction
  .schema(submitBidSchema)
  .action(async ({ parsedInput, ctx }) => {
    // Check budget before calling AI
    const budget = await checkBudget();
    if (!budget.ok) {
      throw new Error(`Budget exhausted! Spent: $${budget.spent.toFixed(2)}`);
    }
    
    const { text, usage } = await generateText({ /* ... */ });
    
    // Record spend after successful call
    await recordSpend(usage?.totalTokens || 100, parsedInput.model);
    
    // ... rest of logic
  });
```

### Credit-Saving Tips

| Strategy | Savings | Implementation |
|----------|---------|----------------|
| Use `maxTokens: 150` | ~40% | Shorter responses = fewer tokens |
| Prefer Gemini Flash | ~80% | Cheapest model, still competitive |
| Cache item valuations | ~20% | Don't regenerate each round |
| Limit to 3 models | ~25% | 3 models × 10 rounds = 30 calls vs 40 |
| Reduce rounds | Variable | 5 rounds for demos, 10 for full games |

### Demo Mode (Zero AI Calls)

For showing off the UI without burning credits:

```typescript
// actions/game.ts
const DEMO_MODE = process.env.DEMO_MODE === 'true';

export const submitBid = rateLimitedAction
  .schema(submitBidSchema)
  .action(async ({ parsedInput }) => {
    if (DEMO_MODE) {
      // Simulate AI response
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
      
      const shouldBid = Math.random() > 0.3;
      const bidAmount = shouldBid 
        ? parsedInput.currentBid + Math.floor(Math.random() * 20) + 5
        : 0;
      
      return {
        success: true,
        model: parsedInput.model,
        reasoning: shouldBid 
          ? `The valuation of $${parsedInput.privateValuation} gives me room to bid.`
          : `Current bid is too close to my valuation. Folding.`,
        action: shouldBid 
          ? { type: 'bid' as const, amount: bidAmount }
          : { type: 'fold' as const },
        tokensUsed: 0,
      };
    }
    
    // Real AI call...
  });
```

### Rate Limit UI Feedback

```typescript
// components/RateLimitStatus.tsx
'use client';

import { useEffect, useState } from 'react';

export function RateLimitStatus() {
  const [status, setStatus] = useState<{ global: number } | null>(null);
  
  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus);
  }, []);
  
  if (!status) return null;
  
  const percentage = (status.global / 500) * 100;
  const isLow = percentage < 20;
  
  return (
    <div className={`text-xs ${isLow ? 'text-red-400' : 'text-gray-500'}`}>
      API calls remaining: {status.global}/500
      {isLow && ' ⚠️ Running low!'}
    </div>
  );
}
```

### Prompt Engineering for Models

**System prompt for bidding:**
```
You are participating in an auction game against other AI models.

ITEM: {item_name}
YOUR PRIVATE VALUATION: ${valuation}
CURRENT HIGHEST BID: ${current_bid}
BIDDING HISTORY: {history}
YOUR CURRENT BALANCE: ${balance}

You may either:
1. BID: Submit a bid higher than the current bid
2. FOLD: Exit this round (keep your money, but can't win)

Think through your strategy, then respond in this exact format:
REASONING: [Your thinking about the situation]
ACTION: BID $X or FOLD

Remember: If you win, your profit = Your Valuation - Your Bid
Winning at a price above your valuation loses you money.
```

**Key prompt considerations:**
- Include opponent history to enable pattern recognition
- Make valuation very clear to avoid confusion
- Request structured output for easy parsing
- Include reasoning request for the live feed feature

---

## Hackathon Winning Factors

### 1. Demo Polish
**First impressions matter enormously.** Focus on:
- Smooth 60fps animations (use `will-change`, GPU-accelerated transforms)
- No loading spinners visible — preload everything
- Sound effects (even simple ones) add 2x perceived polish
- Have a "demo mode" with pre-seeded exciting scenarios

### 2. Narrative Hook
Your 2-minute pitch should tell a story:
> "We wanted to see if AI models could bluff. Turns out, they can—and they have very different strategies. Claude plays conservatively. GPT-4o is aggressive. Watch them figure each other out in real-time."

### 3. Live Reasoning = Unique Differentiator
No other eval shows you *why* models make decisions in real-time. This is your headline feature. Make it prominent.

### 4. Spectator Mode Works Without Interaction
Judges should be able to watch passively and still be entertained. Design for lean-back viewing, not just active participation.

### 5. Clear Metrics Dashboard
Show aggregate stats that tell a story:
- Win rate per model
- Average profit margin
- "Bluff success rate" (won with bid > valuation)
- Risk profile visualization

### 6. Quotable Moments
Design for shareability:
- Screenshot-worthy UI
- Clip-worthy moments (big wins, dramatic overbids)
- Export highlight reels?

---

## MVP Scope (48-Hour Hackathon)

### Must Have
- [ ] **Model selection dropdown (2-4 models)**
- [ ] 3 model support via AI Gateway (Claude, GPT-4o, Gemini Flash)
- [ ] Basic auction loop (5-10 rounds)
- [ ] Model cards with bid display
- [ ] Win/loss calculation and leaderboard
- [ ] Basic animations (bid updates, round transitions)
- [ ] **Upstash rate limiting (protect your $20!)**
- [ ] **next-safe-action for type-safe server actions**
- [ ] Mobile-responsive layout
- [ ] Demo mode toggle (zero AI calls for UI testing)

### Should Have
- [ ] Live reasoning feed
- [ ] Item images (can use placeholder set)
- [ ] Sound effects
- [ ] Round resolution animation
- [ ] Budget tracker UI

### Nice to Have
- [ ] Bid history ladder visualization
- [ ] Multiple game modes
- [ ] Shareable results
- [ ] Historical game replay

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Model refuses to play | Include "you are playing a game" framing; test prompts early |
| Bids aren't parseable | Robust regex + fallback to fold if unparseable |
| One model dominates | Add handicap mode; tune valuation distribution |
| Rounds take too long | Strict timeout; force fold after 15s no response |
| Rate limits hit | Queue requests; cache reasoning; reduce rounds if needed |
| **$20 budget runs out** | Multi-layer Upstash rate limits; global hourly cap; demo mode |
| **Spam/abuse** | Per-IP rate limiting; game session limits |
| **Hackathon demo fails** | Demo mode with fake AI responses; pre-record backup video |

---

## Success Metrics

### During Hackathon
- Judge engagement (are they watching or looking away?)
- Questions asked (curiosity = interest)
- Laugh moments (entertainment value)

### Post-Hackathon
- GitHub stars
- Demo plays
- Social shares
- "Can you add X model?" requests

---

## Appendix: Auction Items

25 curated items with 8-bit pixel art images. Located in `public/assets/art/`.

| Item | Price Range | Filename |
|------|-------------|----------|
| Fabergé Egg | $500,000 - $1,200,000 | `faberge_egg.png` |
| Action Comics #1 | $800,000 - $1,500,000 | `action_comics_1.png` |
| Vintage Sports Car | $2,000,000 - $5,000,000 | `vintage_sports_car.png` |
| Enigma Machine | $85,000 - $150,000 | `enigma_machine.png` |
| Gutenberg Bible Page | $45,000 - $80,000 | `gutenberg_bible_page.png` |
| Gold Bars | $25,000 - $30,000 | `gold_bars.png` |
| Katana | $15,000 - $35,000 | `katana.png` |
| Air Jordan 1 High | $10,000 - $25,000 | `air_jordan_1.png` |
| Autographed Stormtrooper Helmet | $8,000 - $15,000 | `signed_stormtrooper_helmet.png` |
| V8 Engine Block | $6,000 - $14,000 | `v8_engine.png` |
| Meteorite | $5,000 - $12,000 | `meteorite.png` |
| Jukebox | $5,000 - $12,000 | `jukebox.png` |
| Vintage Barbie in Box | $4,000 - $9,000 | `boxed_barbie.png` |
| Penny Farthing | $4,000 - $8,500 | `penny_farthing.png` |
| Deep Sea Diver Helmet | $3,500 - $7,000 | `diver_helmet.png` |
| Fine Wine Bottle | $3,000 - $8,000 | `fine_wine.png` |
| Shrunken Head in Display Case | $2,500 - $6,000 | `shrunken_head_case.png` |
| Stormtrooper Helmet | $2,000 - $5,000 | `stormtrooper_helmet.png` |
| Shrunken Head | $1,800 - $4,000 | `shrunken_head.png` |
| Vampire Hunting Kit | $1,500 - $4,500 | `vampire_hunting_kit.png` |
| First Edition Happy Meal Box | $1,000 - $4,000 | `happy_meal_box.png` |
| Ventriloquist Dummy | $400 - $1,500 | `ventriloquist_dummy.png` |
| Server Rack / Supercomputer | $300 - $1,200 | `server_rack.png` |
| Vintage Portrait | $200 - $800 | `vintage_portrait.png` |
| Mystery Briefcase | $100 - $5,000 | `mystery_briefcase.png` |

**Note:** Wide price variance creates interesting strategic situations. The Mystery Briefcase has the widest range, making it especially unpredictable.

---

## Final Note

The key insight: **this game works because it's simple to understand but complex to master.** Anyone can watch an auction. But watching AIs develop theories about each other's strategies—and sometimes be hilariously wrong—is genuinely novel entertainment.

Ship fast. Polish the animations. Let the models' personalities shine through their reasoning.

Good luck. 🎰
