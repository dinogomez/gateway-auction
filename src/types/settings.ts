// Settings types for CRT effects and audio controls

export interface DisplaySettings {
  crtEnabled: boolean;
}

// Fixed values when effects are enabled
export const CRT_VALUES = {
  curvature: 2, // out of 10 - subtle barrel effect
  scanlines: 0.06, // 6% - very subtle
  vignette: 0.15, // 15% - minimal dimming
  chromaticAberration: 0.8, // px base for RGB separation
} as const;

export interface AudioSettings {
  masterVolume: number; // 0-1
  musicVolume: number; // 0-1
  sfxVolume: number; // 0-1
  isMuted: boolean;
}

export interface Settings {
  display: DisplaySettings;
  audio: AudioSettings;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  crtEnabled: false,
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  isMuted: false,
};

export const DEFAULT_SETTINGS: Settings = {
  display: DEFAULT_DISPLAY_SETTINGS,
  audio: DEFAULT_AUDIO_SETTINGS,
};
