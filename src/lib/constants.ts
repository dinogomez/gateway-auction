/**
 * Game timing constants
 */

// Turn timer
export const TURN_TIMER_SECONDS = 30;
export const TURN_WARNING_THRESHOLD = 15; // Play warning sound when timer hits this

// Action delays (ms)
export const ACTION_DELAY_MS = 1500;
export const CHIP_CHANGE_ANIMATION_MS = 2500;
export const NEXT_HAND_DELAY_MS = 2000;
export const CARD_REVEAL_BASE_DELAY_MS = 2000;

// Loading screen timing (ms)
export const LOADING_GAME_INIT_MS = 1200; // Init early during card wobble animation (masks stutter)
export const LOADING_PHASE_PREPARING_MS = 3500; // When "Preparing" text shows
export const LOADING_PHASE_DONE_MS = 5200; // When "Let's play!" text shows
export const LOADING_EXIT_MS = 6000; // When loading screen hides

/**
 * Store limits
 */
export const ACTION_LOG_LIMIT = 100;
export const DEBUG_LOG_LIMIT = 50;

/**
 * Card sprite constants
 * Sprite sheet: playing_cards.png (15 columns x 4 rows)
 * Layout: back, A, 2-10, J, Q, K, Joker (columns) x Spades, Diamonds, Clubs, Hearts (rows)
 */
export const CARD_SPRITE = {
  WIDTH: 97,
  HEIGHT: 129,
  COLS: 15,
  ROWS: 4,
} as const;
