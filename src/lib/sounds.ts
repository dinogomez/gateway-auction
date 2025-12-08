"use client";

import { Howl, Howler } from "howler";

// Sound effect instances - lazily initialized
type SoundName =
  | "call"
  | "raise"
  | "fold"
  | "check"
  | "allIn"
  | "victory"
  | "load"
  | "deal1"
  | "deal2";

// Lazy sound cache - sounds are created on first use
const soundCache: Partial<Record<SoundName, Howl>> = {};

// Background music instances - lazily initialized
let bgMusic: Howl | null = null;
let menuMusic: Howl | null = null;

// Sound file paths
const soundPaths: Record<SoundName, string> = {
  call: "/assets/sounds/call.mp3",
  raise: "/assets/sounds/raise.mp3",
  fold: "/assets/sounds/fold.mp3",
  check: "/assets/sounds/check.mp3",
  allIn: "/assets/sounds/all-in.mp3",
  victory: "/assets/sounds/victory.mp3",
  load: "/assets/sounds/load.mp3",
  deal1: "/assets/sounds/deal_1.mp3",
  deal2: "/assets/sounds/deal_2.mp3",
};

// Base volumes for each sound (before settings multipliers)
const baseVolumes: Record<SoundName, number> = {
  call: 0.4,
  raise: 0.4,
  fold: 0.4,
  check: 0.4,
  allIn: 0.5,
  victory: 0.6,
  load: 0.3,
  deal1: 0.3,
  deal2: 0.3,
};

// Sound categories for volume control
type SoundCategory = "sfx" | "music";

const soundCategories: Record<SoundName, SoundCategory> = {
  call: "sfx",
  raise: "sfx",
  fold: "sfx",
  check: "sfx",
  allIn: "sfx",
  victory: "sfx",
  load: "sfx",
  deal1: "sfx",
  deal2: "sfx",
};

// Current volume settings (updated via setVolumeSettings)
let volumeSettings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.7,
};

// Module-level initialization state (shared across all hook instances)
let soundsInitialized = false;
let isPreloading = false;
let isMuted = false;

/**
 * Check if sounds are initialized
 */
export function isSoundsInitialized(): boolean {
  return soundsInitialized;
}

/**
 * Get current mute state
 */
export function getMuted(): boolean {
  return isMuted;
}

/**
 * Get or create a sound lazily
 */
function getOrCreateSound(name: SoundName): Howl {
  if (!soundCache[name]) {
    const categoryVolume =
      soundCategories[name] === "music"
        ? volumeSettings.music
        : volumeSettings.sfx;
    const finalVolume =
      baseVolumes[name] * categoryVolume * volumeSettings.master;
    soundCache[name] = new Howl({
      src: [soundPaths[name]],
      volume: Math.max(0, Math.min(1, finalVolume)),
    });
  }
  return soundCache[name]!;
}

/**
 * Initialize sounds system and preload sounds
 * Only runs once per session (module-level tracking)
 */
export function initSounds(): void {
  if (soundsInitialized) return;
  soundsInitialized = true;
  // Preload sounds in the background to prevent freezes
  preloadSounds();
}

/**
 * Legacy compatibility - returns null, sounds are lazy now
 */
export function getSounds(): null {
  return null;
}

/**
 * Preload all sounds to prevent freezes on first play
 * Uses requestIdleCallback for non-blocking loading
 */
export function preloadSounds(): void {
  if (typeof window === "undefined") return;
  if (isPreloading) return;
  isPreloading = true;

  const preload = () => {
    // Preload SFX sounds
    for (const name of Object.keys(soundPaths) as SoundName[]) {
      getOrCreateSound(name);
    }
    // Also preload music (they're commonly used)
    getOrCreateBgMusic();
    getOrCreateMenuMusic();
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(preload, { timeout: 2000 });
  } else {
    setTimeout(preload, 100);
  }
}

/**
 * Play a specific sound effect (creates sound lazily if needed)
 */
export function playSound(soundName: SoundName): void {
  if (typeof window === "undefined") return;
  const sound = getOrCreateSound(soundName);
  sound.play();
}

/**
 * Play a random deal sound (50/50 chance deal1 or deal2)
 */
export function playDealSound(): void {
  if (typeof window === "undefined") return;
  const soundName = Math.random() < 0.5 ? "deal1" : "deal2";
  const sound = getOrCreateSound(soundName);
  sound.play();
}

/**
 * Stop all sounds
 */
export function stopAllSounds(): void {
  for (const sound of Object.values(soundCache)) {
    if (sound) sound.stop();
  }
}

/**
 * Get or create background music lazily
 */
function getOrCreateBgMusic(): Howl {
  if (!bgMusic) {
    bgMusic = new Howl({
      src: ["/assets/sounds/bg-music.mp3"],
      loop: true,
      volume: 0.3 * volumeSettings.music * volumeSettings.master,
    });
  }
  return bgMusic;
}

/**
 * Get or create menu music lazily
 */
function getOrCreateMenuMusic(): Howl {
  if (!menuMusic) {
    menuMusic = new Howl({
      src: ["/assets/sounds/main-menu.mp3"],
      loop: true,
      volume: 0.3 * volumeSettings.music * volumeSettings.master,
    });
  }
  return menuMusic;
}

/**
 * Start background music (creates lazily if needed)
 */
export function startBgMusic(): void {
  if (typeof window === "undefined") return;
  const music = getOrCreateBgMusic();
  if (!music.playing()) {
    music.play();
  }
}

/**
 * Stop background music
 */
export function stopBgMusic(): void {
  if (bgMusic) {
    bgMusic.stop();
  }
}

/**
 * Check if background music is playing
 */
export function isBgMusicPlaying(): boolean {
  return bgMusic?.playing() ?? false;
}

/**
 * Start main menu music (creates lazily if needed)
 */
export function startMenuMusic(): void {
  if (typeof window === "undefined") return;
  const music = getOrCreateMenuMusic();
  if (!music.playing()) {
    music.play();
  }
}

/**
 * Stop main menu music
 */
export function stopMenuMusic(): void {
  if (menuMusic) {
    menuMusic.stop();
  }
}

/**
 * Check if menu music is playing
 */
export function isMenuMusicPlaying(): boolean {
  return menuMusic?.playing() ?? false;
}

/**
 * Set global volume (0-1)
 */
export function setGlobalVolume(volume: number): void {
  Howler.volume(Math.max(0, Math.min(1, volume)));
}

/**
 * Mute/unmute all sounds
 */
export function setMuted(muted: boolean): void {
  isMuted = muted;
  Howler.mute(muted);
}

/**
 * Update volume settings from the settings store
 * Call this when settings change
 */
export function setVolumeSettings(settings: {
  master: number;
  music: number;
  sfx: number;
}): void {
  volumeSettings = { ...settings };
  applyVolumeSettings();
}

/**
 * Apply current volume settings to all cached sounds
 */
function applyVolumeSettings(): void {
  // Update cached sound effects
  for (const [soundName, sound] of Object.entries(soundCache)) {
    if (!sound) continue;
    const key = soundName as SoundName;
    const category = soundCategories[key];
    const baseVolume = baseVolumes[key];
    const categoryVolume =
      category === "music" ? volumeSettings.music : volumeSettings.sfx;

    const finalVolume = baseVolume * categoryVolume * volumeSettings.master;
    sound.volume(Math.max(0, Math.min(1, finalVolume)));
  }

  // Update background music volume
  if (bgMusic) {
    const musicVolume = 0.3 * volumeSettings.music * volumeSettings.master;
    bgMusic.volume(Math.max(0, Math.min(1, musicVolume)));
  }

  // Update menu music volume
  if (menuMusic) {
    const musicVolume = 0.3 * volumeSettings.music * volumeSettings.master;
    menuMusic.volume(Math.max(0, Math.min(1, musicVolume)));
  }
}

/**
 * Get current volume settings
 */
export function getVolumeSettings(): {
  master: number;
  music: number;
  sfx: number;
} {
  return { ...volumeSettings };
}

/**
 * Stop all playing sounds (but keep them loaded)
 * Use this for component unmounts - doesn't destroy the cache
 */
export function stopAllPlayingSounds(): void {
  for (const sound of Object.values(soundCache)) {
    if (sound?.playing()) {
      sound.stop();
    }
  }
  if (bgMusic?.playing()) {
    bgMusic.stop();
  }
  if (menuMusic?.playing()) {
    menuMusic.stop();
  }
}

/**
 * Full cleanup - unloads all sounds and resets state
 * Only call this on app unmount or hot reload, NOT on component unmount
 */
export function cleanupSounds(): void {
  // Cleanup cached sounds
  for (const [key, sound] of Object.entries(soundCache)) {
    if (sound) {
      sound.stop();
      sound.unload();
    }
    delete soundCache[key as SoundName];
  }

  if (bgMusic) {
    bgMusic.stop();
    bgMusic.unload();
    bgMusic = null;
  }

  if (menuMusic) {
    menuMusic.stop();
    menuMusic.unload();
    menuMusic = null;
  }

  soundsInitialized = false;
  isPreloading = false;
}

// Re-export SoundName type
export type { SoundName };
