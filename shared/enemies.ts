/** Enemy definitions (spec §5). Tunable in one place. */

export type EnemyType = "drifter" | "wisp" | "brute" | "boss";

export interface EnemyDef {
  type: EnemyType;
  hp: number;
  /** Contact / projectile damage. */
  damage: number;
  speed: number;
  radius: number;
  /** Ranged enemies fire projectiles; melee touch for contact damage. */
  ranged: boolean;
  /** Preferred distance for kiting ranged enemies. */
  kiteRange?: number;
  /** Seconds between ranged shots. */
  fireCooldown?: number;
  /** Seconds between contact damage ticks. */
  contactCooldown: number;
  /** Alignment meter / score weight (bigger = more reward). */
  worth: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  drifter: {
    type: "drifter",
    hp: 20,
    damage: 8,
    speed: 70,
    radius: 16,
    ranged: false,
    contactCooldown: 0.7,
    worth: 1,
  },
  wisp: {
    type: "wisp",
    hp: 12,
    damage: 6,
    speed: 90,
    radius: 14,
    ranged: true,
    kiteRange: 240,
    fireCooldown: 2,
    contactCooldown: 0.7,
    worth: 1.5,
  },
  brute: {
    type: "brute",
    hp: 80,
    damage: 18,
    speed: 50,
    radius: 26,
    ranged: false,
    contactCooldown: 1.0,
    worth: 4,
  },
  boss: {
    type: "boss",
    hp: 600,
    damage: 32,
    speed: 38,
    radius: 50,
    ranged: false,
    contactCooldown: 1.2,
    worth: 30,
  },
};
