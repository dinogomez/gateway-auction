import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Settings, AudioSettings } from "@/types/settings";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_AUDIO_SETTINGS,
} from "@/types/settings";
import { setMuted as setHowlerMuted } from "@/lib/sounds";

// Track hydration state
let isHydrated = false;
const hydrationCallbacks = new Set<() => void>();

export function onHydrated(callback: () => void): () => void {
  if (isHydrated) {
    callback();
    return () => {};
  }
  hydrationCallbacks.add(callback);
  return () => hydrationCallbacks.delete(callback);
}

export function hasHydrated(): boolean {
  return isHydrated;
}

interface SettingsStore extends Settings {
  // Display actions
  setCrtEnabled: (enabled: boolean) => void;

  // Audio actions
  setMasterVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setAudioSettings: (settings: Partial<AudioSettings>) => void;

  // General actions
  resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Initial state
      display: DEFAULT_DISPLAY_SETTINGS,
      audio: DEFAULT_AUDIO_SETTINGS,

      // Display actions
      setCrtEnabled: (enabled) =>
        set((state) => ({
          display: { ...state.display, crtEnabled: enabled },
        })),

      // Audio actions
      setMasterVolume: (value) =>
        set((state) => ({
          audio: {
            ...state.audio,
            masterVolume: Math.max(0, Math.min(1, value)),
          },
        })),

      setMusicVolume: (value) =>
        set((state) => ({
          audio: {
            ...state.audio,
            musicVolume: Math.max(0, Math.min(1, value)),
          },
        })),

      setSfxVolume: (value) =>
        set((state) => ({
          audio: { ...state.audio, sfxVolume: Math.max(0, Math.min(1, value)) },
        })),

      setMuted: (muted) => {
        setHowlerMuted(muted);
        set((state) => ({
          audio: { ...state.audio, isMuted: muted },
        }));
      },

      toggleMute: () =>
        set((state) => {
          const newMuted = !state.audio.isMuted;
          setHowlerMuted(newMuted);
          return {
            audio: { ...state.audio, isMuted: newMuted },
          };
        }),

      setAudioSettings: (settings) =>
        set((state) => ({
          audio: { ...state.audio, ...settings },
        })),

      // General actions
      resetToDefaults: () =>
        set({
          display: DEFAULT_DISPLAY_SETTINGS,
          audio: DEFAULT_AUDIO_SETTINGS,
        }),
    }),
    {
      name: "gateway-poker-settings",
      partialize: (state) => ({
        display: state.display,
        audio: state.audio,
      }),
      onRehydrateStorage: () => (state) => {
        // Called when hydration completes
        isHydrated = true;
        if (state?.audio?.isMuted) {
          setHowlerMuted(true);
        }
        // Notify all waiting callbacks
        for (const callback of hydrationCallbacks) {
          callback();
        }
        hydrationCallbacks.clear();
      },
    },
  ),
);
