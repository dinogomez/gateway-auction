"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { PokerAction } from "@/types/poker";

interface BettingControlsProps {
  chipStack: number;
  currentBet: number;
  amountToCall: number;
  minRaise: number;
  canCheck: boolean;
  potSize: number;
  onAction: (action: PokerAction) => void;
  disabled?: boolean;
  className?: string;
}

export function BettingControls({
  chipStack,
  currentBet,
  amountToCall,
  minRaise,
  canCheck,
  potSize,
  onAction,
  disabled = false,
  className,
}: BettingControlsProps) {
  const [raiseAmount, setRaiseAmount] = useState(minRaise);

  // Sync raiseAmount when minRaise prop changes
  useEffect(() => {
    setRaiseAmount((prev) => Math.max(minRaise, prev));
  }, [minRaise]);

  const maxRaise = chipStack + currentBet; // Max total bet

  // Quick bet amounts
  const halfPot = Math.max(minRaise, Math.floor(potSize / 2));
  const threeFourthPot = Math.max(minRaise, Math.floor((potSize * 3) / 4));
  const fullPot = Math.max(minRaise, potSize);

  const handleFold = () => onAction({ type: "fold" });
  const handleCheck = () => onAction({ type: "check" });
  const handleCall = () => onAction({ type: "call", amount: amountToCall });
  const handleRaise = () => onAction({ type: "raise", amount: raiseAmount });
  const handleAllIn = () => onAction({ type: "all-in" });

  // Update raise amount ensuring it's within bounds
  const updateRaiseAmount = (value: number) => {
    const clamped = Math.max(minRaise, Math.min(maxRaise, value));
    setRaiseAmount(clamped);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4",
        "bg-black border border-neutral-700",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
      style={{ borderRadius: 0 }}
      role="group"
      aria-label="Betting controls"
    >
      {/* Info row */}
      <div className="flex justify-between text-sm text-neutral-500 font-mono">
        <span
          aria-label={`Your chip stack: ${chipStack.toLocaleString()} dollars`}
        >
          Stack: ${chipStack.toLocaleString()}
        </span>
        <span aria-label={`Current pot: ${potSize.toLocaleString()} dollars`}>
          Pot: ${potSize.toLocaleString()}
        </span>
      </div>

      {/* Main action buttons */}
      <div className="flex gap-2" role="group" aria-label="Primary actions">
        <button
          className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 text-neutral-400 font-mono font-bold hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
          onClick={handleFold}
          disabled={disabled}
          style={{ borderRadius: 0 }}
          aria-label="Fold your hand"
        >
          FOLD
        </button>

        {canCheck ? (
          <button
            className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-600 text-white font-mono font-bold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            onClick={handleCheck}
            disabled={disabled}
            style={{ borderRadius: 0 }}
            aria-label="Check - no bet required"
          >
            CHECK
          </button>
        ) : (
          <button
            className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-600 text-white font-mono font-bold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            onClick={handleCall}
            disabled={disabled || amountToCall > chipStack}
            style={{ borderRadius: 0 }}
            aria-label={`Call ${amountToCall.toLocaleString()} dollars`}
          >
            CALL ${amountToCall.toLocaleString()}
          </button>
        )}

        <button
          className="flex-1 px-4 py-3 bg-white border border-white text-black font-mono font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50"
          onClick={handleRaise}
          disabled={disabled || chipStack <= amountToCall}
          style={{ borderRadius: 0 }}
          aria-label={`Raise to ${raiseAmount.toLocaleString()} dollars`}
        >
          RAISE ${raiseAmount.toLocaleString()}
        </button>
      </div>

      {/* Raise slider */}
      {chipStack > amountToCall && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              className="text-xs text-neutral-500 w-16 font-mono"
              aria-hidden="true"
            >
              ${minRaise.toLocaleString()}
            </span>
            <input
              type="range"
              value={raiseAmount}
              min={minRaise}
              max={maxRaise}
              step={Math.max(1, Math.floor((maxRaise - minRaise) / 100))}
              onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
              className="flex-1 accent-white"
              disabled={disabled}
              aria-label={`Raise amount slider, current value ${raiseAmount.toLocaleString()} dollars`}
              aria-valuemin={minRaise}
              aria-valuemax={maxRaise}
              aria-valuenow={raiseAmount}
            />
            <span
              className="text-xs text-neutral-500 w-16 text-right font-mono"
              aria-hidden="true"
            >
              ${maxRaise.toLocaleString()}
            </span>
          </div>

          {/* Quick bet buttons */}
          <div
            className="flex gap-1"
            role="group"
            aria-label="Quick bet amounts"
          >
            <button
              className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-mono hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
              onClick={() => updateRaiseAmount(halfPot)}
              disabled={disabled}
              style={{ borderRadius: 0 }}
              aria-label={`Set raise to half pot: ${halfPot.toLocaleString()} dollars`}
            >
              1/2 POT
            </button>
            <button
              className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-mono hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
              onClick={() => updateRaiseAmount(threeFourthPot)}
              disabled={disabled}
              style={{ borderRadius: 0 }}
              aria-label={`Set raise to three-quarters pot: ${threeFourthPot.toLocaleString()} dollars`}
            >
              3/4 POT
            </button>
            <button
              className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-mono hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
              onClick={() => updateRaiseAmount(fullPot)}
              disabled={disabled}
              style={{ borderRadius: 0 }}
              aria-label={`Set raise to full pot: ${fullPot.toLocaleString()} dollars`}
            >
              POT
            </button>
            <button
              className="flex-1 px-2 py-1 bg-white border border-white text-black text-xs font-mono font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50"
              onClick={handleAllIn}
              disabled={disabled}
              style={{ borderRadius: 0 }}
              aria-label={`Go all in with ${chipStack.toLocaleString()} dollars`}
            >
              ALL IN
            </button>
          </div>

          {/* Manual input */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="raise-amount-input"
              className="text-xs text-neutral-500 font-mono"
            >
              Raise to:
            </label>
            <input
              id="raise-amount-input"
              type="number"
              value={raiseAmount}
              onChange={(e) =>
                updateRaiseAmount(parseInt(e.target.value) || minRaise)
              }
              min={minRaise}
              max={maxRaise}
              className="w-24 h-7 px-2 text-sm bg-black border border-neutral-700 text-white font-mono focus:border-white focus:outline-none disabled:opacity-50"
              disabled={disabled}
              style={{ borderRadius: 0 }}
              aria-label={`Enter custom raise amount between ${minRaise.toLocaleString()} and ${maxRaise.toLocaleString()} dollars`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact betting controls for mobile/sidebar
 */
export function BettingControlsCompact({
  amountToCall,
  canCheck,
  chipStack,
  onAction,
  disabled = false,
  className,
}: {
  amountToCall: number;
  canCheck: boolean;
  chipStack: number;
  onAction: (action: PokerAction) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex gap-2", className)}
      role="group"
      aria-label="Quick betting controls"
    >
      <button
        className="px-3 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-sm font-mono hover:bg-neutral-800 disabled:opacity-50"
        onClick={() => onAction({ type: "fold" })}
        disabled={disabled}
        style={{ borderRadius: 0 }}
        aria-label="Fold your hand"
      >
        FOLD
      </button>

      {canCheck ? (
        <button
          className="px-3 py-1 bg-neutral-800 border border-neutral-600 text-white text-sm font-mono hover:bg-neutral-700 disabled:opacity-50"
          onClick={() => onAction({ type: "check" })}
          disabled={disabled}
          style={{ borderRadius: 0 }}
          aria-label="Check - no bet required"
        >
          CHECK
        </button>
      ) : (
        <button
          className="px-3 py-1 bg-neutral-800 border border-neutral-600 text-white text-sm font-mono hover:bg-neutral-700 disabled:opacity-50"
          onClick={() => onAction({ type: "call", amount: amountToCall })}
          disabled={disabled || amountToCall > chipStack}
          style={{ borderRadius: 0 }}
          aria-label={`Call ${amountToCall.toLocaleString()} dollars`}
        >
          CALL ${amountToCall.toLocaleString()}
        </button>
      )}

      <button
        className="px-3 py-1 bg-white border border-white text-black text-sm font-mono font-bold hover:bg-neutral-200 disabled:opacity-50"
        onClick={() => onAction({ type: "all-in" })}
        disabled={disabled}
        style={{ borderRadius: 0 }}
        aria-label={`Go all in with ${chipStack.toLocaleString()} dollars`}
      >
        ALL IN
      </button>
    </div>
  );
}
