import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Model name abbreviations for display
 * Maps gateway IDs to short, readable names
 */
const MODEL_ABBREVIATIONS: Record<string, string> = {
  // Main 8 models
  "anthropic/claude-sonnet-4.5": "SONNET",
  "xai/grok-4.1-fast-reasoning": "GROK",
  "deepseek/deepseek-v3.2": "DSEEK",
  "google/gemini-2.5-flash-lite-preview-09-2025": "GEMINI",
  "mistral/mistral-medium": "MISTRAL",
  "moonshotai/kimi-k2": "KIMI",
  "openai/gpt-5-mini": "GPT5M",
  "perplexity/sonar": "SONAR",
  // Dev model
  "openai/gpt-5-nano": "GPT5-N",
  // Legacy/other models
  "openai/gpt-4o": "GPT4o",
  "openai/gpt-4o-mini": "GPT4o-M",
  "anthropic/claude-opus-4.5": "OPUS4.5",
  "google/gemini-2.0-flash": "GEM2F",
};

/**
 * Abbreviate a gateway ID to a short display name
 * @param gatewayId - Full gateway ID like "openai/gpt-5-nano"
 * @returns Short name like "GPT5-N"
 */
export function abbreviateModel(gatewayId: string): string {
  // Check for exact match first
  if (MODEL_ABBREVIATIONS[gatewayId]) {
    return MODEL_ABBREVIATIONS[gatewayId];
  }

  // Fallback: extract model name after provider and clean it up
  const parts = gatewayId.split("/");
  if (parts.length >= 2) {
    const modelPart = parts[1];
    // Remove common suffixes and clean up
    return modelPart
      .replace(/-preview.*$/, "")
      .replace(/-instruct.*$/, "")
      .replace(/-\d{8}$/, "") // Remove date suffixes
      .toUpperCase()
      .slice(0, 12); // Max 12 chars
  }

  return gatewayId.toUpperCase().slice(0, 12);
}
