import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Hook for accessing and modifying application settings.
 * Settings are automatically persisted to localStorage.
 */
export function useSettings() {
  const store = useSettingsStore();

  return {
    // Current settings values
    display: store.display,
    audio: store.audio,

    // Display actions
    setCrtEnabled: store.setCrtEnabled,

    // Audio actions
    setMasterVolume: store.setMasterVolume,
    setMusicVolume: store.setMusicVolume,
    setSfxVolume: store.setSfxVolume,
    setMuted: store.setMuted,
    toggleMute: store.toggleMute,
    setAudioSettings: store.setAudioSettings,

    // Reset actions
    resetToDefaults: store.resetToDefaults,
  };
}

/**
 * Hook for accessing only display settings (for CRT components).
 */
export function useDisplaySettings() {
  return useSettingsStore((state) => state.display);
}

/**
 * Hook for accessing only audio settings (for sound components).
 */
export function useAudioSettings() {
  return useSettingsStore((state) => state.audio);
}
