/**
 * Single source of truth for the Zodiac roster.
 *
 * Keep ALL character stats, passives, and actives here so balancing happens in
 * one place (per the build spec, §9). Phase 1 only implements Aries, but the
 * full roster metadata lives here so menus / later phases can read from it.
 */

export type Element = "fire" | "earth" | "air" | "water";

export interface ElementInfo {
  id: Element;
  label: string;
  glyph: string;
  /** Identity tagline from the spec (§4). */
  identity: string;
  /** Primary glow color for players of this element. */
  color: number;
  /** Lighter accent used for trails / glows. */
  accent: number;
}

export const ELEMENTS: Record<Element, ElementInfo> = {
  fire: {
    id: "fire",
    label: "Fire",
    glyph: "🔥",
    identity: "burst damage",
    color: 0xff6b3d,
    accent: 0xffd166,
  },
  earth: {
    id: "earth",
    label: "Earth",
    glyph: "🪨",
    identity: "defense / control",
    color: 0x6fcf6f,
    accent: 0xd6c26a,
  },
  air: {
    id: "air",
    label: "Air",
    glyph: "💨",
    identity: "mobility / utility",
    color: 0x8ee6ff,
    accent: 0xffffff,
  },
  water: {
    id: "water",
    label: "Water",
    glyph: "💧",
    identity: "healing / support",
    color: 0x4d9bff,
    accent: 0x7fe6e6,
  },
};

export interface BasicAttackDef {
  /** Damage per hit. */
  damage: number;
  /** Reach of the attack in pixels. */
  range: number;
  /** Seconds between auto-fired attacks. */
  cooldown: number;
  /** Number of projectiles / strikes per fire (e.g. Gemini twin bolts). */
  hits: number;
  description: string;
}

export interface ActiveDef {
  name: string;
  /** Cooldown in seconds. */
  cooldown: number;
  description: string;
}

export interface PassiveDef {
  name: string;
  description: string;
}

export interface ZodiacDef {
  id: string;
  name: string;
  /** Animal / archetype, e.g. "Ram". */
  archetype: string;
  element: Element;
  glyph: string;
  /** True once fully implemented & selectable. Starter 4 ship first. */
  implemented: boolean;
  /** Combat stats. Only present for implemented signs in Phase 1. */
  stats?: {
    hp: number;
    speed: number;
    basicAttack: BasicAttackDef;
  };
  passive: PassiveDef;
  active: ActiveDef;
}

export const BASE_PLAYER_HP = 100;
export const BASE_PLAYER_SPEED = 200;

/** One logical tile = 48px (spec §3). */
export const TILE = 48;

export const ZODIAC: Record<string, ZodiacDef> = {
  // ---------- 🔥 Fire ----------
  aries: {
    id: "aries",
    name: "Aries",
    archetype: "Ram",
    element: "fire",
    glyph: "♈",
    implemented: true,
    stats: {
      hp: 90,
      speed: 220,
      basicAttack: {
        damage: 15,
        range: 90,
        cooldown: 0.45,
        hits: 1,
        description: "Short slash, fast",
      },
    },
    passive: {
      name: "First Strike",
      description:
        "+50% damage on the first hit to an enemy you haven't hit in the last 3s.",
    },
    active: {
      name: "Charge",
      cooldown: 8,
      description:
        "Dash ~4 tiles in the facing direction: 30 damage + 0.75s stun + knockback to enemies in the path.",
    },
  },
  leo: {
    id: "leo",
    name: "Leo",
    archetype: "Lion",
    element: "fire",
    glyph: "♌",
    implemented: false,
    passive: { name: "Pride", description: "Nearby allies deal more damage." },
    active: {
      name: "Roar",
      cooldown: 9,
      description: "Radiant blast that staggers nearby enemies.",
    },
  },
  sagittarius: {
    id: "sagittarius",
    name: "Sagittarius",
    archetype: "Archer",
    element: "fire",
    glyph: "♐",
    implemented: false,
    passive: { name: "Far Sight", description: "Longest range, piercing shots." },
    active: {
      name: "Star Arrow",
      cooldown: 9,
      description: "Long piercing shot that marks enemies for bonus ally damage.",
    },
  },

  // ---------- 🪨 Earth ----------
  taurus: {
    id: "taurus",
    name: "Taurus",
    archetype: "Bull",
    element: "earth",
    glyph: "♉",
    implemented: true,
    stats: {
      hp: 160,
      speed: 150,
      basicAttack: {
        damage: 12,
        range: 80,
        cooldown: 0.6,
        hits: 1,
        description: "Ground slam, small AoE",
      },
    },
    passive: {
      name: "Immovable",
      description: "No knockback; takes 15% less damage.",
    },
    active: {
      name: "Bulwark",
      cooldown: 12,
      description: "Arc barrier in front for 5s, blocks enemy contact/projectiles.",
    },
  },
  virgo: {
    id: "virgo",
    name: "Virgo",
    archetype: "Maiden",
    element: "earth",
    glyph: "♍",
    implemented: false,
    passive: {
      name: "Diligence",
      description: "Speeds up Alignment charge for the team.",
    },
    active: {
      name: "Harvest",
      cooldown: 10,
      description: "Refund an ally's cooldown.",
    },
  },
  capricorn: {
    id: "capricorn",
    name: "Capricorn",
    archetype: "Sea-Goat",
    element: "earth",
    glyph: "♑",
    implemented: false,
    passive: { name: "Steadfast", description: "Immune to slow / stun." },
    active: {
      name: "Pillar",
      cooldown: 11,
      description: "Raise a wall + high-ground bonus.",
    },
  },

  // ---------- 💨 Air ----------
  gemini: {
    id: "gemini",
    name: "Gemini",
    archetype: "Twins",
    element: "air",
    glyph: "♊",
    implemented: true,
    stats: {
      hp: 100,
      speed: 240,
      basicAttack: {
        damage: 8,
        range: 110,
        cooldown: 0.5,
        hits: 2,
        description: "Twin bolts (2 shots)",
      },
    },
    passive: {
      name: "Twin Shadow",
      description: "A clone mirrors your basic attacks.",
    },
    active: {
      name: "Swap",
      cooldown: 10,
      description: "Swap places with a targeted ally; if none, short blink.",
    },
  },
  libra: {
    id: "libra",
    name: "Libra",
    archetype: "Scales",
    element: "air",
    glyph: "♎",
    implemented: false,
    passive: { name: "Balance", description: "Shares HP to even out a low ally." },
    active: {
      name: "Equilibrium",
      cooldown: 12,
      description: "Team damage is split evenly for a few seconds.",
    },
  },
  aquarius: {
    id: "aquarius",
    name: "Aquarius",
    archetype: "Water-Bearer",
    element: "air",
    glyph: "♒",
    implemented: false,
    passive: { name: "Slipstream", description: "Trail speeds up allies." },
    active: {
      name: "Deluge",
      cooldown: 11,
      description: "Wave that pushes + slows enemies.",
    },
  },

  // ---------- 💧 Water ----------
  cancer: {
    id: "cancer",
    name: "Cancer",
    archetype: "Crab",
    element: "water",
    glyph: "♋",
    implemented: false,
    passive: { name: "Carapace", description: "Regenerating armor shell." },
    active: {
      name: "Shell",
      cooldown: 11,
      description: "Bubble shield on an ally.",
    },
  },
  scorpio: {
    id: "scorpio",
    name: "Scorpio",
    archetype: "Scorpion",
    element: "water",
    glyph: "♏",
    implemented: false,
    passive: { name: "Venom", description: "Attacks stack poison." },
    active: {
      name: "Sting",
      cooldown: 12,
      description: "Nuke that detonates all poison stacks.",
    },
  },
  pisces: {
    id: "pisces",
    name: "Pisces",
    archetype: "Fish",
    element: "water",
    glyph: "♓",
    implemented: true,
    stats: {
      hp: 110,
      speed: 200,
      basicAttack: {
        damage: 6,
        range: 100,
        cooldown: 0.5,
        hits: 1,
        description: "Water orb + brief slow",
      },
    },
    passive: {
      name: "Flow",
      description: "You + allies in range regen 2 HP/s.",
    },
    active: {
      name: "Tide Pool",
      cooldown: 14,
      description: "Zone for 6s, heals 8 HP/s + cleanses debuffs.",
    },
  },
};

/** Order to show in menus, grouped by element. */
export const ROSTER_ORDER: string[] = [
  "aries",
  "leo",
  "sagittarius",
  "taurus",
  "virgo",
  "capricorn",
  "gemini",
  "libra",
  "aquarius",
  "cancer",
  "scorpio",
  "pisces",
];

export const STARTER_FOUR = ["aries", "taurus", "gemini", "pisces"];

export function getZodiac(id: string): ZodiacDef {
  const z = ZODIAC[id];
  if (!z) throw new Error(`Unknown zodiac id: ${id}`);
  return z;
}
