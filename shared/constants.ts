/** Engine-agnostic constants shared by client + server. */

export const TICK_RATE = 20; // server simulation Hz
export const TICK_MS = 1000 / TICK_RATE;

export const TILE = 48;

/** Circular arena. World is square; arena is the inscribed circle. */
export const WORLD_W = 900;
export const WORLD_H = 900;
export const ARENA_CX = WORLD_W / 2;
export const ARENA_CY = WORLD_H / 2;
export const ARENA_RADIUS = 400;

export const MAX_PLAYERS = 4;

/** Revive: stand near a downed ally this long (seconds). */
export const REVIVE_TIME = 3;
export const REVIVE_RANGE = 70;
/** Fraction of max HP restored on revive. */
export const REVIVE_HP_FRACTION = 0.5;

/** Alignment combo window + proximity. */
export const ALIGNMENT_WINDOW = 1.5; // seconds
export const ALIGNMENT_RANGE = 260; // px between charged players

/** How fast the alignment meter fills. */
export const ALIGNMENT_PER_DAMAGE = 0.0016; // meter per point of damage dealt
export const ALIGNMENT_PASSIVE_PER_SEC = 0.012; // survival trickle

/** Win condition: clear this many waves (every 5th is a boss). */
export const FINAL_WAVE = 10;
