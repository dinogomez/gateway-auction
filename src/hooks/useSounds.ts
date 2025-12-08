"use client";

import { useCallback, useEffect } from "react";
import {
  initSounds,
  isSoundsInitialized,
  playSound,
  playDealSound,
  setVolumeSettings,
  stopAllSounds,
  startBgMusic,
  stopBgMusic,
  startMenuMusic,
  stopMenuMusic,
  type SoundName,
} from "@/lib/sounds";
import { useSettingsStore, onHydrated } from "@/stores/settingsStore";
import { useAudioSettings } from "@/hooks/useSettings";

export function useSounds() {
  // Get mute state and toggle from Zustand store
  const isMuted = useSettingsStore((state) => state.audio.isMuted);
  const toggleMute = useSettingsStore((state) => state.toggleMute);
  const audioSettings = useAudioSettings();

  // Initialize sounds once
  useEffect(() => {
    if (!isSoundsInitialized()) {
      initSounds();
    }
  }, []);

  // Sync volume settings when they change
  useEffect(() => {
    if (isSoundsInitialized()) {
      setVolumeSettings({
        master: audioSettings.masterVolume,
        music: audioSettings.musicVolume,
        sfx: audioSettings.sfxVolume,
      });
    }
  }, [
    audioSettings.masterVolume,
    audioSettings.musicVolume,
    audioSettings.sfxVolume,
  ]);

  // Sound effects
  const play = useCallback((sound: SoundName) => {
    playSound(sound);
  }, []);

  // Play random deal sound (50/50 deal1 or deal2)
  const playDeal = useCallback(() => {
    playDealSound();
  }, []);

  const stopAll = useCallback(() => {
    stopAllSounds();
  }, []);

  // Background music controls
  const startMusic = useCallback(() => {
    startBgMusic();
  }, []);

  const stopMusic = useCallback(() => {
    stopBgMusic();
  }, []);

  // Menu music controls
  const startMenu = useCallback(() => {
    startMenuMusic();
  }, []);

  const stopMenu = useCallback(() => {
    stopMenuMusic();
  }, []);

  return {
    isMuted,
    toggleMute,
    play,
    playDeal,
    stopAll,
    startMusic,
    stopMusic,
    startMenu,
    stopMenu,
  };
}

/**
 * Hook to start music only after settings have hydrated from localStorage.
 * This prevents the race condition where music starts before mute state is loaded.
 */
export function useHydratedMusicStart(startFn: () => void, stopFn: () => void) {
  const isMuted = useSettingsStore((state) => state.audio.isMuted);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onHydrated(() => {
      if (cancelled) return;
      // Only start if not muted (hydrated state is now available)
      const currentMuted = useSettingsStore.getState().audio.isMuted;
      if (!currentMuted) {
        startFn();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopFn();
    };
  }, [startFn, stopFn]);

  // Also handle unmute - if user unmutes, start the music
  useEffect(() => {
    if (!isMuted) {
      // Check if we should start (hydration complete)
      const { hasHydrated } = require("@/stores/settingsStore");
      if (hasHydrated()) {
        startFn();
      }
    }
  }, [isMuted, startFn]);
}
