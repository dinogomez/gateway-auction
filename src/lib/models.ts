import type { Model } from "@/types/poker";

export const AVAILABLE_MODELS: Model[] = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    color: "#8B5CF6",
    tier: "premium",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    color: "#10B981",
    tier: "premium",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    color: "#34D399",
    tier: "budget",
  },
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini Flash",
    color: "#3B82F6",
    tier: "budget",
  },
  {
    id: "xai/grok-2",
    name: "Grok 2",
    color: "#F97316",
    tier: "premium",
  },
  {
    id: "meta/llama-3.3-70b",
    name: "Llama 3.3 70B",
    color: "#EC4899",
    tier: "mid",
  },
];

export function getModelById(id: string): Model | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

export function getModelColor(id: string): string {
  return getModelById(id)?.color ?? "#888888";
}

export function getModelName(id: string): string {
  return getModelById(id)?.name ?? "Unknown";
}

// Tier badge colors
export const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  budget: { bg: "bg-green-900/50", text: "text-green-400" },
  mid: { bg: "bg-yellow-900/50", text: "text-yellow-400" },
  premium: { bg: "bg-purple-900/50", text: "text-purple-400" },
};
