"use client";

import { Howl } from "howler";

// Sound effect instances
// Using lazy initialization to avoid SSR issues
let soundsInitialized = false;

interface SoundEffects {
  gameStart: Howl;
  roundStart: Howl;
  bid: Howl;
  outbid: Howl;
  tick: Howl;
  fold: Howl;
  winProfit: Howl;
  winLoss: Howl;
  victory: Howl;
  rankChange: Howl;
}

let sounds: SoundEffects | null = null;

/**
 * Initialize all sound effects
 * Call this once when the game starts
 */
export function initSounds(): SoundEffects {
  if (sounds && soundsInitialized) {
    return sounds;
  }

  sounds = {
    gameStart: new Howl({
      src: ["/assets/sounds/game-start.mp3"],
      volume: 0.5,
    }),
    roundStart: new Howl({
      src: ["/assets/sounds/round-start.mp3"],
      volume: 0.4,
    }),
    bid: new Howl({
      src: ["/assets/sounds/bid.mp3"],
      volume: 0.3,
    }),
    outbid: new Howl({
      src: ["/assets/sounds/outbid.mp3"],
      volume: 0.3,
    }),
    tick: new Howl({
      src: ["/assets/sounds/tick.mp3"],
      volume: 0.2,
    }),
    fold: new Howl({
      src: ["/assets/sounds/fold.mp3"],
      volume: 0.4,
    }),
    winProfit: new Howl({
      src: ["/assets/sounds/win-profit.mp3"],
      volume: 0.5,
    }),
    winLoss: new Howl({
      src: ["/assets/sounds/win-loss.mp3"],
      volume: 0.5,
    }),
    victory: new Howl({
      src: ["/assets/sounds/victory.mp3"],
      volume: 0.6,
    }),
    rankChange: new Howl({
      src: ["/assets/sounds/rank-change.mp3"],
      volume: 0.3,
    }),
  };

  soundsInitialized = true;
  return sounds;
}

/**
 * Get sounds instance (initialize if needed)
 */
export function getSounds(): SoundEffects | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sounds ?? initSounds();
}

/**
 * Preload all sounds
 * Call this to ensure sounds are ready before gameplay
 */
export function preloadSounds(): void {
  const s = getSounds();
  if (s) {
    Object.values(s).forEach((sound) => sound.load());
  }
}

/**
 * Play a specific sound effect
 */
export function playSound(soundName: keyof SoundEffects): void {
  const s = getSounds();
  if (s && s[soundName]) {
    s[soundName].play();
  }
}

/**
 * Stop all sounds
 */
export function stopAllSounds(): void {
  const s = getSounds();
  if (s) {
    Object.values(s).forEach((sound) => sound.stop());
  }
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
  Howler.mute(muted);
}
