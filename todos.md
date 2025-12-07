# Implementation Todos: Fake Items + Speed Up Game

## Completed ✅

### 1. Add `isFake` to types
- **File**: `src/types/game.ts`
- Added `isFake?: boolean` to `AuctionItem` interface (line 16)
- Added `isFake?: boolean` to `RoundResult` interface (line 55)

---

## Pending 🔄

### 2. Update `getRandomItems()` to mark 2 items as fake
- **File**: `src/lib/items.ts` (line ~245)
- **Change**: Replace the function with:
```typescript
export function getRandomItems(count: number): AuctionItem[] {
  const shuffled = [...AUCTION_ITEMS].sort(() => Math.random() - 0.5);
  const items = shuffled.slice(0, count).map((item) => ({ ...item }));

  // Mark 2 random items as fake (if we have at least 2 items)
  if (count >= 2) {
    const fakeIndices: number[] = [];
    while (fakeIndices.length < 2) {
      const idx = Math.floor(Math.random() * count);
      if (!fakeIndices.includes(idx)) {
        fakeIndices.push(idx);
      }
    }
    fakeIndices.forEach((i) => {
      items[i].isFake = true;
    });
  }

  return items;
}
```

### 3. Update profit calculation for fake items
- **File**: `src/hooks/useGameState.ts` (around line 760 in `resolveParallelRound`)
- **Find**: `const profit = winnerValuation - highestBid;`
- **Replace with**:
```typescript
const isFake = prev.currentItem?.isFake === true;
const profit = isFake ? -highestBid : (winnerValuation - highestBid);
```

### 4. Add fake warning to agent prompts
- **File**: `src/lib/prompts.ts` (in `generateAgentPrompt` function, around line 263)
- **Add before the return statement**:
```typescript
const fakeWarning = `
### Warning
2 of the 5 items in this game are FAKES (worthless forgeries).
If you win a fake, you lose your entire bid.
`;
```
- Include `${fakeWarning}` in the returned template string

### 5. Add FAKE/AUTHENTIC badge to UI
- **File**: `src/components/RoundSummary.tsx` or `src/components/ItemShowcase.tsx`
- After round ends, show badge:
  - Green "AUTHENTIC" if `!item.isFake`
  - Red "FAKE" if `item.isFake`

### 6. Speed up game delays
- **File**: `src/app/game/page.tsx`
  - Line ~471: Change `3500` to `800` (post-thinking wait)
  - Line ~374: Change `4000` to `800` (stage continue wait)

### 7. Speed up commentary banner
- **File**: `src/components/CommentaryBanner.tsx`
  - Line ~53: Change `4000` to `2000` (auto-dismiss delay)

---

## Summary

| Task | File | Status |
|------|------|--------|
| Add isFake to types | types/game.ts | ✅ Done |
| Mark 2 items as fake | lib/items.ts | 🔄 Pending |
| Fake profit calculation | hooks/useGameState.ts | 🔄 Pending |
| Agent prompt warning | lib/prompts.ts | 🔄 Pending |
| FAKE/AUTHENTIC badge | RoundSummary.tsx | 🔄 Pending |
| Speed up game (3500→800, 4000→800) | app/game/page.tsx | 🔄 Pending |
| Speed up banner (4000→2000) | CommentaryBanner.tsx | 🔄 Pending |
