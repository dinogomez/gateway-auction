# Pending Changes

## 1. PlayerCard.tsx - Already Done ✅
- Moved status (FOLDED, THINKING, etc.) to same row as character name, aligned right
- Moved personality (STRATEGIC RISK-TAKER) to its own row below name
- Added skeleton loaders for personality and feeling sections
- Added `pl-4` indent to align personality with name

## 2. prompts.ts - Needs Update

### Goal: Remove prescriptive strategy tips to allow diverse AI behaviors

### Changes to make:

#### AUCTION_SYSTEM_PROMPT (lines 5-24)
**Replace the entire prompt with:**
```typescript
export const AUCTION_SYSTEM_PROMPT = `You are competing in an auction against other bidders.

RULES:
- You have a private valuation (only you know yours)
- Each round: RAISE (bid higher) or FOLD (drop out)
- Last bidder standing wins and pays their winning bid
- Profit = Your Private Valuation - Winning Bid

Develop your own strategy. Think it through, then decide.

End with: ACTION: RAISE $[amount] or ACTION: FOLD`;
```

#### LEGACY_SYSTEM_PROMPT (lines 26-36)
**Replace with:**
```typescript
export const LEGACY_SYSTEM_PROMPT = `You are competing in an auction.

RULES:
- Profit = Your Private Valuation - Your Winning Bid
- Bidding above your valuation and winning = LOSS

Decide your own approach.
ACTION: RAISE $X or FOLD`;
```

#### AGENT_SYSTEM_PROMPT (lines 93-114)
**Replace with:**
```typescript
export const AGENT_SYSTEM_PROMPT = `You are competing in an auction.

## Rules

1. You have a PRIVATE VALUATION that only you know
2. Each round: RAISE (bid higher) or FOLD (drop out)
3. Last bidder standing wins and pays their bid
4. Profit = Your Private Valuation - Winning Bid

## Format

Think through your approach, then end with:

ACTION: RAISE $[amount] | FOLD`;
```

#### generateBidPrompt function (around line 80)
**Remove the strategy-guiding text, change:**
```typescript
${isFirstBid ? "You are the FIRST to bid this round. Set the pace!" : "Consider what others have done and decide your move."}

Think through your decision, then state your ACTION:
```
**To just:**
```typescript
What's your move?
```

#### generateAgentPrompt function (around line 285)
**Remove the strategy guidance at the end, change:**
```typescript
${currentStage > 1 ? `This is stage ${currentStage}. Consider what happened in previous stages and adapt your strategy.` : ""}
Reason through your decision, then state your ACTION.
```
**To just:**
```typescript
What's your move?
```

#### Also in generateAgentPrompt - remove "currentMood" from memory section (line 211)
The mood was being injected which affects personality. Remove this line:
```typescript
- Current mood: ${memory.currentMood}
```

---

## Summary of Philosophy
- **Before**: Prompts told AI how to play (fold if above valuation, raise to scare, etc.)
- **After**: Prompts only give rules, let each AI develop its own strategy
- This should create more diverse and interesting gameplay
