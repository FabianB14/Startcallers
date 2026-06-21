import type { Element } from "./zodiac";
import type { EnemyType } from "./enemies";

export type Phase = "lobby" | "playing" | "won" | "lost";

/** Client -> server per-tick input. */
export interface InputState {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimX: number; // unit vector if manual aim
  aimY: number;
  hasAim: boolean;
}

export const ZERO_INPUT: InputState = {
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  hasAim: false,
};

// ---- Snapshot (server -> client render state) ----

export interface PlayerSnap {
  id: string;
  name: string;
  zodiac: string;
  element: Element;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  abilityCd: number; // seconds remaining
  abilityMax: number;
  meter: number; // 0..1 alignment
  charged: boolean;
  downed: boolean;
  reviveProgress: number; // 0..1
  speedBuffUntil: number; // server time; >now means buffed
  invulnUntil: number;
  // mirror of Twin Shadow clone (Gemini)
  hasClone: boolean;
  cloneX: number;
  cloneY: number;
  // run stats
  damageDealt: number;
  healingDone: number;
  revives: number;
}

export interface EnemySnap {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  stunned: boolean;
  telegraph: number; // 0..1 boss attack wind-up, 0 = none
}

export interface ProjectileSnap {
  id: number;
  x: number;
  y: number;
  hostile: boolean; // true = enemy projectile
  element: Element | "void";
}

export type ZoneKind = "tidepool" | "bulwark" | "fortress" | "telegraph";

export interface ZoneSnap {
  id: number;
  kind: ZoneKind;
  x: number;
  y: number;
  radius: number;
  /** For arc barriers (bulwark): facing angle in radians; -1 = full circle. */
  angle: number;
  life: number; // 0..1 remaining
  owner: string;
}

export type GameEventType =
  | "charge"
  | "slash"
  | "slam"
  | "hit"
  | "death"
  | "alignment"
  | "revive"
  | "waveStart"
  | "playerDowned"
  | "bossSpawn";

export interface GameEvent {
  type: GameEventType;
  x?: number;
  y?: number;
  radius?: number;
  /** super flavor for "alignment" events. */
  variant?: string;
  ids?: string[]; // participating player ids (alignment)
  text?: string;
}

export interface Snapshot {
  t: number; // server time (ms)
  phase: Phase;
  wave: number;
  enemiesRemaining: number;
  players: PlayerSnap[];
  enemies: EnemySnap[];
  projectiles: ProjectileSnap[];
  zones: ZoneSnap[];
  events: GameEvent[];
}
