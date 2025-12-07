import { useCallback, useRef } from "react";
import type { Model, PokerAgentContext, PokerAction } from "@/types/poker";
import { parsePokerAction } from "@/lib/poker-prompts";
import { usePokerStore } from "@/stores/pokerStore";

/**
 * Thin hook for AI poker thinking
 * - No local state (uses Zustand store)
 * - Just handles streaming API calls
 * - Calls store actions for state updates
 */
export function usePokerThinking() {
  const { startThinking, completeThinking, cancelThinking, processAction } =
    usePokerStore();

  // Abort controller for canceling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Process a single AI player's turn
   * Streams their thinking and parses the action
   */
  const processAITurn = useCallback(
    async (
      model: Model,
      context: PokerAgentContext,
    ): Promise<PokerAction | null> => {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Update store: start thinking (adds THINKING entry)
      startThinking(model.id);

      try {
        const response = await fetch("/api/game/poker-think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: model.id,
            context,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        // Stream the response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
        }

        // Parse the action from the complete response
        const action = parsePokerAction(fullText, {
          currentBet: context.currentBet,
          ownBet: context.ownCurrentBet,
          minRaise: context.minRaise,
          chipStack: context.ownChipStack,
        });

        abortControllerRef.current = null;

        if (!action) {
          // Default to fold if we can't parse the action
          console.warn(
            `Could not parse action from ${model.name}, defaulting to fold`,
          );
          const fallbackAction: PokerAction = { type: "fold" };
          processAction(model.id, fallbackAction);
          completeThinking(model.id, fallbackAction, fullText);
          return fallbackAction;
        }

        // Process the action in game state
        processAction(model.id, action);

        // Complete thinking (clears THINKING, fetches summary, adds ACTION)
        completeThinking(model.id, action, fullText);

        return action;
      } catch (error) {
        abortControllerRef.current = null;

        if ((error as Error).name === "AbortError") {
          return null;
        }

        console.error(`AI thinking error for ${model.name}:`, error);

        // Default to fold on error
        const fallbackAction: PokerAction = { type: "fold" };
        processAction(model.id, fallbackAction);
        completeThinking(
          model.id,
          fallbackAction,
          `Error: ${(error as Error).message}`,
        );
        return fallbackAction;
      }
    },
    [startThinking, completeThinking, processAction],
  );

  /**
   * Cancel the current AI thinking
   */
  const cancelCurrentThinking = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    cancelThinking();
  }, [cancelThinking]);

  return {
    processAITurn,
    cancelThinking: cancelCurrentThinking,
  };
}
