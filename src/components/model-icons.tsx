import {
  Claude,
  DeepSeek,
  Gemini,
  Grok,
  Meta,
  Mistral,
  OpenAI,
  Perplexity,
} from "@lobehub/icons";
import type { ComponentType } from "react";

// Model configuration with icons and display info
export type ModelConfig = {
  gatewayId: string;
  name: string;
  shortName: string;
  provider: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
  color: string;
};

export const MODEL_CONFIGS: ModelConfig[] = [
  {
    gatewayId: "anthropic/claude-sonnet-4.5",
    name: "Sonnet 4.5",
    shortName: "SONNET",
    provider: "anthropic",
    icon: Claude.Avatar,
    color: "#D97757",
  },
  {
    gatewayId: "xai/grok-4.1-fast-reasoning",
    name: "Grok 4.1",
    shortName: "GROK",
    provider: "xai",
    icon: Grok.Avatar,
    color: "#000000",
  },
  {
    gatewayId: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    shortName: "DSEEK",
    provider: "deepseek",
    icon: DeepSeek.Avatar,
    color: "#4D6BFE",
  },
  {
    gatewayId: "google/gemini-2.5-flash-lite-preview-09-2025",
    name: "Gemini 2.5 Flash",
    shortName: "GEMINI",
    provider: "google",
    icon: Gemini.Avatar,
    color: "#3186FF",
  },
  {
    gatewayId: "mistral/mistral-medium",
    name: "Mistral Medium",
    shortName: "MISTRAL",
    provider: "mistral",
    icon: Mistral.Avatar,
    color: "#F7D046",
  },
  {
    gatewayId: "meta/llama-4-scout",
    name: "Llama 4 Scout",
    shortName: "LLAMA",
    provider: "meta",
    icon: Meta.Avatar,
    color: "#0082FB",
  },
  {
    gatewayId: "openai/gpt-5-mini",
    name: "GPT 5 Mini",
    shortName: "GPT5M",
    provider: "openai",
    icon: OpenAI.Avatar,
    color: "#10A37F",
  },
  {
    gatewayId: "perplexity/sonar",
    name: "Sonar",
    shortName: "SONAR",
    provider: "perplexity",
    icon: Perplexity.Avatar,
    color: "#20808D",
  },
];

// Helper functions
export function getModelConfig(gatewayId: string): ModelConfig | undefined {
  return MODEL_CONFIGS.find((m) => m.gatewayId === gatewayId);
}

export function getModelIcon(
  gatewayId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ComponentType<any> | null {
  return getModelConfig(gatewayId)?.icon ?? null;
}

export function getModelDisplayName(gatewayId: string): string {
  return (
    getModelConfig(gatewayId)?.name ?? gatewayId.split("/")[1] ?? gatewayId
  );
}

export function getModelShortName(gatewayId: string): string {
  return (
    getModelConfig(gatewayId)?.shortName ??
    gatewayId.split("/")[1]?.slice(0, 6).toUpperCase() ??
    "???"
  );
}

export function getModelColor(gatewayId: string): string {
  return getModelConfig(gatewayId)?.color ?? "#888888";
}
