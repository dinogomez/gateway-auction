"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initSounds, playSound, setMuted, stopAllSounds } from "@/lib/sounds";

export function useSounds() {
  const [isMuted, setIsMuted] = useState(false);
  const initialized = useRef(false);

  // Initialize sounds on mount
  useEffect(() => {
    if (!initialized.current) {
      initSounds();
      initialized.current = true;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    setMuted(newMuted);
  }, [isMuted]);

  const play = useCallback(
    (
      sound:
        | "gameStart"
        | "roundStart"
        | "bid"
        | "outbid"
        | "tick"
        | "fold"
        | "winProfit"
        | "winLoss"
        | "victory"
        | "rankChange",
    ) => {
      if (!isMuted) {
        playSound(sound);
      }
    },
    [isMuted],
  );

  const stopAll = useCallback(() => {
    stopAllSounds();
  }, []);

  return {
    isMuted,
    toggleMute,
    play,
    stopAll,
  };
}
