"use client";

import { useState } from "react";
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

  const maxRaise = chipStack + currentBet; // Max total bet

  // Quick bet amounts
  const halfPot = Math.max(minRaise, Math.floor(potSize / 2));
  const threeFourthPot = Math.max(minRaise, Math.floor((potSize * 3) / 4));
  const fullPot = Math.max(minRaise, potSize);

  const handleFold = () => onAction({ type: "fold" });
  const handleCheck = () => onAction({ type: "check" });
  const handleCall = () => onAction({ type: "call" });
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
    >
      {/* Info row */}
      <div className="flex justify-between text-sm text-neutral-500 font-mono">
        <span>Stack: ${chipStack.toLocaleString()}</span>
        <span>Pot: ${potSize.toLocaleString()}</span>
      </div>

      {/* Main action buttons */}
      <div className="flex gap-2">
        <button
          className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 text-neutral-400 font-mono font-bold hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
          onClick={handleFold}
          disabled={disabled}
          style={{ borderRadius: 0 }}
        >
          FOLD
        </button>

        {canCheck ? (
          <button
            className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-600 text-white font-mono font-bold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            onClick={handleCheck}
            disabled={disabled}
            style={{ borderRadius: 0 }}
          >
            CHECK
          </button>
        ) : (
          <button
            className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-600 text-white font-mono font-bold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            onClick={handleCall}
            disabled={disabled || amountToCall > chipStack}
            style={{ borderRadius: 0 }}
          >
            CALL ${amountToCall.toLocaleString()}
          </button>
        )}

        <button
          className="flex-1 px-4 py-3 bg-white border border-white text-black font-mono font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50"
          onClick={handleRaise}
          disabled={disabled || chipStack <= amountToCall}
          style={{ borderRadius: 0 }}
        >
          RAISE ${raiseAmount.toLocaleString()}
        </button>
      </div>

      {/* Raise slider */}
      {chipStack > amountToCall && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-16 font-mono">
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
            />
            <span className="text-xs text-neutral-500 w-16 text-right font-mono">
              ${maxRaise.toLocaleString()}
            </span>
          </div>

          {/* Quick bet buttons */}
          <div className="flex gap-1">
            <button
              className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-mono hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
              onClick={() => updateRaiseAmount(halfPot)}
              disabled={disabled}
              style={{ borderRadius: 0 }}
            >
              1/2 POT
            </button>
            <button
              className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-mono hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
              onClick={() => updateRaiseAmount(threeFourthPot)}
              disabled={disabled}
              style={{ borderRadius: 0 }}
            >
              3/4 POT
            </button>
            <button
              className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-mono hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
              onClick={() => updateRaiseAmount(fullPot)}
              disabled={disabled}
              style={{ borderRadius: 0 }}
            >
              POT
            </button>
            <button
              className="flex-1 px-2 py-1 bg-white border border-white text-black text-xs font-mono font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50"
              onClick={handleAllIn}
              disabled={disabled}
              style={{ borderRadius: 0 }}
            >
              ALL IN
            </button>
          </div>

          {/* Manual input */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-mono">
              Raise to:
            </span>
            <input
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
    <div className={cn("flex gap-2", className)}>
      <button
        className="px-3 py-1 bg-neutral-900 border border-neutral-700 text-neutral-400 text-sm font-mono hover:bg-neutral-800 disabled:opacity-50"
        onClick={() => onAction({ type: "fold" })}
        disabled={disabled}
        style={{ borderRadius: 0 }}
      >
        FOLD
      </button>

      {canCheck ? (
        <button
          className="px-3 py-1 bg-neutral-800 border border-neutral-600 text-white text-sm font-mono hover:bg-neutral-700 disabled:opacity-50"
          onClick={() => onAction({ type: "check" })}
          disabled={disabled}
          style={{ borderRadius: 0 }}
        >
          CHECK
        </button>
      ) : (
        <button
          className="px-3 py-1 bg-neutral-800 border border-neutral-600 text-white text-sm font-mono hover:bg-neutral-700 disabled:opacity-50"
          onClick={() => onAction({ type: "call" })}
          disabled={disabled || amountToCall > chipStack}
          style={{ borderRadius: 0 }}
        >
          CALL ${amountToCall.toLocaleString()}
        </button>
      )}

      <button
        className="px-3 py-1 bg-white border border-white text-black text-sm font-mono font-bold hover:bg-neutral-200 disabled:opacity-50"
        onClick={() => onAction({ type: "all-in" })}
        disabled={disabled}
        style={{ borderRadius: 0 }}
      >
        ALL IN
      </button>
    </div>
  );
}
