"use client";

import { useState, useEffect } from "react";
import { AVAILABLE_MODELS } from "@/lib/models";
import type { Model } from "@/types/poker";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  onSelect: (models: Model[]) => void;
  disabled?: boolean;
  minModels?: number;
  maxModels?: number;
}

export function ModelSelector({
  onSelect,
  disabled = false,
  minModels = 2,
  maxModels = 10,
}: ModelSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);

  // Call onSelect whenever selection changes (for controlled mode)
  useEffect(() => {
    const selectedModels = AVAILABLE_MODELS.filter((m) =>
      selected.includes(m.id),
    );
    onSelect(selectedModels);
  }, [selected, onSelect]);

  const toggleModel = (id: string) => {
    if (disabled) return;

    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((m) => m !== id);
      }
      if (prev.length >= maxModels) {
        return prev;
      }
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {AVAILABLE_MODELS.map((model) => {
          const isSelected = selected.includes(model.id);

          return (
            <button
              key={model.id}
              onClick={() => toggleModel(model.id)}
              disabled={disabled}
              className={cn(
                "relative p-3 text-left border transition-all",
                isSelected
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-900 hover:border-neutral-400 bg-white",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-white text-neutral-900 flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
              )}

              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-3 h-3"
                  style={{ backgroundColor: model.color }}
                />
                <span
                  className={cn(
                    "text-sm font-mono font-bold",
                    isSelected ? "text-white" : "text-neutral-900",
                  )}
                >
                  {model.name}
                </span>
              </div>

              <span
                className={cn(
                  "text-xs font-mono uppercase",
                  isSelected ? "text-neutral-400" : "text-neutral-700",
                )}
              >
                {model.tier}
              </span>
            </button>
          );
        })}
      </div>

      <div className="text-center text-xs text-neutral-700 font-mono">
        {selected.length}/{maxModels} SELECTED
        {selected.length < minModels && (
          <span className="text-neutral-900 ml-2">(MIN {minModels})</span>
        )}
      </div>
    </div>
  );
}
