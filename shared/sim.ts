/**
 * GameSim — the authoritative, engine-agnostic game simulation.
 *
 * No Phaser, no Colyseus, no DOM. The Colyseus server drives this and mirrors
 * its snapshots to clients; the same rules could feed a Unreal port (spec §11).
 *
 * Responsibility: movement, combat, enemy AI, waves, abilities, passives,
 * revives, and Zodiac Alignment supers.
 */

import {
  ARENA_CX,
  ARENA_CY,
  ARENA_RADIUS,
  ALIGNMENT_PASSIVE_PER_SEC,
  ALIGNMENT_PER_DAMAGE,
  ALIGNMENT_RANGE,
  ALIGNMENT_WINDOW,
  FINAL_WAVE,
  REVIVE_HP_FRACTION,
  REVIVE_RANGE,
  REVIVE_TIME,
} from "./constants";
import { ENEMIES, type EnemyDef, type EnemyType } from "./enemies";
import { getZodiac, type Element, type ZodiacDef } from "./zodiac";
import {
  ZERO_INPUT,
  type GameEvent,
  type InputState,
  type Phase,
  type Snapshot,
  type ZoneKind,
} from "./types";

interface SimPlayer {
  id: string;
  name: string;
  zodiacId: string;
  def: ZodiacDef;
  element: Element;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  speed: number;
  input: InputState;
  attackTimer: number; // counts down to next basic attack
  abilityCd: number; // seconds remaining
  abilityMax: number;
  meter: number; // 0..1
  charged: boolean;
  downed: boolean;
  reviveProgress: number;
  // status timers (seconds remaining)
  speedBuff: number;
  invuln: number;
  // First Strike bookkeeping handled on the enemy side (lastHitBy)
  // stats
  damageDealt: number;
  healingDone: number;
  revives: number;
  connected: boolean;
  // charge dash state
  dashTime: number;
  dashVX: number;
  dashVY: number;
  dashHitIds: Set<number>;
}

interface SimEnemy {
  id: number;
  type: EnemyType;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number; // knockback velocity (decays)
  vy: number;
  hp: number;
  maxHp: number;
  stun: number; // seconds remaining
  slow: number; // seconds remaining
  fireTimer: number;
  contactTimer: number;
  // boss
  attackTimer: number;
  telegraph: number; // seconds of wind-up remaining
  telegraphTotal: number;
  telegraphX: number;
  telegraphY: number;
  summonTimer: number;
  // First Strike: which players have "fresh" status reset
  lastHitBy: Map<string, number>; // playerId -> sim time of last hit
}

interface SimProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  hostile: boolean;
  owner: string;
  element: Element | "void";
  life: number; // seconds remaining
  pierce: number;
  hitIds: Set<number>;
  slow: number; // slow applied on hit (seconds)
}

interface SimZone {
  id: number;
  kind: ZoneKind;
  x: number;
  y: number;
  radius: number;
  angle: number; // -1 for full circle
  life: number;
  maxLife: number;
  owner: string;
  // tidepool heal rate, etc.
  healPerSec: number;
}

interface ChargedActivation {
  id: string;
  x: number;
  y: number;
  element: Element;
  t: number; // sim time seconds
}

let nextEntityId = 1;
const newId = () => nextEntityId++;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function clampToArena(x: number, y: number, r: number): [number, number] {
  const dx = x - ARENA_CX;
  const dy = y - ARENA_CY;
  const d = Math.hypot(dx, dy);
  const max = ARENA_RADIUS - r;
  if (d > max && d > 0) {
    return [ARENA_CX + (dx / d) * max, ARENA_CY + (dy / d) * max];
  }
  return [x, y];
}

export class GameSim {
  phase: Phase = "lobby";
  time = 0; // seconds since match start
  wave = 0;
  enemiesRemaining = 0;

  private players = new Map<string, SimPlayer>();
  private enemies: SimEnemy[] = [];
  private projectiles: SimProjectile[] = [];
  private zones: SimZone[] = [];
  private events: GameEvent[] = [];
  private activations: ChargedActivation[] = [];

  private waveBreak = 0; // seconds until next wave spawns (0 = none pending)
  private spawnQueue: EnemyType[] = [];
  private spawnTimer = 0;

  // ---- Lobby / roster management ----

  addPlayer(id: string, name: string, zodiacId: string): void {
    const def = getZodiac(zodiacId);
    const stats = def.stats ?? {
      hp: 100,
      speed: 200,
      basicAttack: { damage: 10, range: 90, cooldown: 0.5, hits: 1, description: "" },
    };
    const p: SimPlayer = {
      id,
      name,
      zodiacId,
      def,
      element: def.element,
      x: ARENA_CX,
      y: ARENA_CY,
      facingX: 0,
      facingY: 1,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      input: { ...ZERO_INPUT },
      attackTimer: 0,
      abilityCd: 0,
      abilityMax: def.active.cooldown,
      meter: 0,
      charged: false,
      downed: false,
      reviveProgress: 0,
      speedBuff: 0,
      invuln: 0,
      damageDealt: 0,
      healingDone: 0,
      revives: 0,
      connected: true,
      dashTime: 0,
      dashVX: 0,
      dashVY: 0,
      dashHitIds: new Set(),
    };
    this.players.set(id, p);
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (p) p.connected = connected;
  }

  setInput(id: string, input: InputState): void {
    const p = this.players.get(id);
    if (!p) return;
    p.input = input;
  }

  hasPlayers(): boolean {
    return this.players.size > 0;
  }

  // ---- Match flow ----

  start(): void {
    if (this.phase === "playing") return;
    this.phase = "playing";
    this.time = 0;
    this.wave = 0;
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.activations = [];
    // arrange players in a small ring near center
    let i = 0;
    const n = Math.max(1, this.players.size);
    for (const p of this.players.values()) {
      const a = (i / n) * Math.PI * 2;
      p.x = ARENA_CX + Math.cos(a) * 60;
      p.y = ARENA_CY + Math.sin(a) * 60;
      p.hp = p.maxHp;
      p.downed = false;
      p.meter = 0;
      p.charged = false;
      p.abilityCd = 0;
      i++;
    }
    this.startNextWave();
  }

  private startNextWave(): void {
    this.wave += 1;
    this.waveBreak = 0;
    const isBoss = this.wave % 5 === 0;
    this.spawnQueue = this.buildWave(this.wave, isBoss);
    this.enemiesRemaining = this.spawnQueue.length;
    this.spawnTimer = 0;
    this.events.push({ type: "waveStart", text: `Wave ${this.wave}`, variant: isBoss ? "boss" : "normal" });
    if (isBoss) this.events.push({ type: "bossSpawn" });
  }

  private buildWave(wave: number, isBoss: boolean): EnemyType[] {
    const q: EnemyType[] = [];
    const scale = 1 + (this.players.size - 1) * 0.5; // more players = more enemies
    if (isBoss) {
      q.push("boss");
      const adds = Math.round((2 + wave / 2) * scale);
      for (let i = 0; i < adds; i++) q.push(i % 2 === 0 ? "drifter" : "wisp");
      return q;
    }
    const drifters = Math.round((3 + wave * 1.5) * scale);
    const wisps = Math.round((wave >= 2 ? 1 + wave * 0.6 : 0) * scale);
    const brutes = Math.round((wave >= 3 ? wave * 0.4 : 0) * scale);
    for (let i = 0; i < drifters; i++) q.push("drifter");
    for (let i = 0; i < wisps; i++) q.push("wisp");
    for (let i = 0; i < brutes; i++) q.push("brute");
    // shuffle a bit
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    return q;
  }

  private spawnEnemy(type: EnemyType): void {
    const def = ENEMIES[type];
    // spawn at a random point on the arena edge
    const a = Math.random() * Math.PI * 2;
    const r = ARENA_RADIUS - def.radius - 2;
    const e: SimEnemy = {
      id: newId(),
      type,
      def,
      x: ARENA_CX + Math.cos(a) * r,
      y: ARENA_CY + Math.sin(a) * r,
      vx: 0,
      vy: 0,
      hp: def.hp,
      maxHp: def.hp,
      stun: 0,
      slow: 0,
      fireTimer: def.fireCooldown ?? 0,
      contactTimer: 0,
      attackTimer: 3,
      telegraph: 0,
      telegraphTotal: 0,
      telegraphX: 0,
      telegraphY: 0,
      summonTimer: 6,
      lastHitBy: new Map(),
    };
    this.enemies.push(e);
  }

  // ---- Abilities ----

  useAbility(id: string): void {
    const p = this.players.get(id);
    if (!p || p.downed || this.phase !== "playing") return;
    if (p.abilityCd > 0) return;
    p.abilityCd = p.abilityMax;

    // If charged, register an activation that may form a Zodiac Alignment.
    if (p.charged) {
      this.registerActivation(p);
    }

    switch (p.zodiacId) {
      case "aries":
        this.ariesCharge(p);
        break;
      case "taurus":
        this.taurusBulwark(p);
        break;
      case "gemini":
        this.geminiSwap(p);
        break;
      case "pisces":
        this.piscesTidePool(p);
        break;
      default:
        // generic blink for unimplemented kits
        p.x += p.facingX * 150;
        p.y += p.facingY * 150;
        [p.x, p.y] = clampToArena(p.x, p.y, 18);
    }
  }

  private ariesCharge(p: SimPlayer): void {
    // dash ~4 tiles in facing direction; damage + stun + knockback handled
    // during the dash window via dashHitIds.
    p.dashTime = 0.22; // seconds of dash
    const tiles = 4 * 48;
    const speed = tiles / p.dashTime;
    p.dashVX = p.facingX * speed;
    p.dashVY = p.facingY * speed;
    p.dashHitIds.clear();
    p.invuln = Math.max(p.invuln, 0.25);
    this.events.push({ type: "charge", x: p.x, y: p.y, radius: tiles });
  }

  private taurusBulwark(p: SimPlayer): void {
    const ang = Math.atan2(p.facingY, p.facingX);
    this.zones.push({
      id: newId(),
      kind: "bulwark",
      x: p.x + p.facingX * 40,
      y: p.y + p.facingY * 40,
      radius: 90,
      angle: ang,
      life: 5,
      maxLife: 5,
      owner: p.id,
      healPerSec: 0,
    });
  }

  private geminiSwap(p: SimPlayer): void {
    // swap with nearest living ally, else short blink
    let best: SimPlayer | null = null;
    let bestD = Infinity;
    for (const o of this.players.values()) {
      if (o.id === p.id || o.downed) continue;
      const d = dist(p.x, p.y, o.x, o.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      const tx = best.x;
      const ty = best.y;
      best.x = p.x;
      best.y = p.y;
      p.x = tx;
      p.y = ty;
      this.events.push({ type: "alignment", x: p.x, y: p.y, variant: "swap" });
    } else {
      p.x += p.facingX * 180;
      p.y += p.facingY * 180;
      [p.x, p.y] = clampToArena(p.x, p.y, 18);
    }
  }

  private piscesTidePool(p: SimPlayer): void {
    this.zones.push({
      id: newId(),
      kind: "tidepool",
      x: p.x,
      y: p.y,
      radius: 120,
      angle: -1,
      life: 6,
      maxLife: 6,
      owner: p.id,
      healPerSec: 8,
    });
  }

  // ---- Zodiac Alignment ----

  private registerActivation(p: SimPlayer): void {
    const act: ChargedActivation = {
      id: p.id,
      x: p.x,
      y: p.y,
      element: p.element,
      t: this.time,
    };
    this.activations.push(act);

    // Find other recent activations near this one.
    const group: ChargedActivation[] = [act];
    for (const a of this.activations) {
      if (a === act || a.id === p.id) continue;
      if (this.time - a.t > ALIGNMENT_WINDOW) continue;
      if (dist(a.x, a.y, act.x, act.y) <= ALIGNMENT_RANGE) group.push(a);
    }
    if (group.length >= 2) {
      this.fireAlignment(group);
      // consume those activations
      const usedIds = new Set(group.map((g) => g.id));
      this.activations = this.activations.filter((a) => !usedIds.has(a.id));
    }
  }

  private fireAlignment(group: ChargedActivation[]): void {
    // centroid
    let cx = 0;
    let cy = 0;
    for (const g of group) {
      cx += g.x;
      cy += g.y;
    }
    cx /= group.length;
    cy /= group.length;

    // determine variant by element composition
    const elements = group.map((g) => g.element);
    const allSame = elements.every((e) => e === elements[0]);
    let variant = "nova";
    if (allSame) variant = elements[0]; // fire/earth/air/water specific super

    // consume meters + reward charged participants
    const ids = group.map((g) => g.id);
    for (const id of ids) {
      const p = this.players.get(id);
      if (p) {
        p.meter = 0;
        p.charged = false;
      }
    }

    const owner = ids[0];
    switch (variant) {
      case "fire": {
        // Meteor: huge burst at centroid
        this.explode(cx, cy, 200, 160, owner);
        break;
      }
      case "water": {
        // Healing Nova: full team heal + shields
        for (const p of this.players.values()) {
          if (!p.downed) {
            this.heal(p, p.maxHp, owner);
            p.invuln = Math.max(p.invuln, 2);
          }
        }
        break;
      }
      case "earth": {
        // Fortress: temporary invulnerable zone
        this.zones.push({
          id: newId(),
          kind: "fortress",
          x: cx,
          y: cy,
          radius: 170,
          angle: -1,
          life: 5,
          maxLife: 5,
          owner,
          healPerSec: 0,
        });
        this.explode(cx, cy, 150, 60, owner);
        break;
      }
      case "air": {
        // Slipstream: team speed + brief dodge (invuln) buff
        for (const p of this.players.values()) {
          if (!p.downed) {
            p.speedBuff = Math.max(p.speedBuff, 5);
            p.invuln = Math.max(p.invuln, 0.6);
          }
        }
        this.explode(cx, cy, 150, 70, owner);
        break;
      }
      default: {
        // Constellation Nova: big AoE damage + small team heal
        this.explode(cx, cy, 180, 110, owner);
        for (const p of this.players.values()) {
          if (!p.downed) this.heal(p, p.maxHp * 0.25, owner);
        }
      }
    }

    this.events.push({ type: "alignment", x: cx, y: cy, radius: 200, variant, ids });
  }

  private explode(x: number, y: number, radius: number, damage: number, owner: string): void {
    for (const e of this.enemies) {
      if (dist(e.x, e.y, x, y) <= radius + e.def.radius) {
        this.damageEnemy(e, damage, owner, false);
      }
    }
  }

  // ---- Damage helpers ----

  private heal(p: SimPlayer, amount: number, sourceId: string): void {
    if (p.downed) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const healed = p.hp - before;
    const src = this.players.get(sourceId);
    if (src) src.healingDone += healed;
  }

  private damageEnemy(e: SimEnemy, amount: number, sourceId: string, isBasic: boolean): void {
    let dmg = amount;
    const src = this.players.get(sourceId);

    // Aries First Strike: +50% if this player hasn't hit this enemy in 3s.
    if (isBasic && src && src.zodiacId === "aries") {
      const last = e.lastHitBy.get(sourceId);
      if (last === undefined || this.time - last >= 3) {
        dmg *= 1.5;
      }
    }
    if (src) e.lastHitBy.set(sourceId, this.time);

    e.hp -= dmg;
    if (src) {
      src.damageDealt += dmg;
      src.meter = Math.min(1, src.meter + dmg * ALIGNMENT_PER_DAMAGE);
      if (src.meter >= 1) src.charged = true;
    }
    if (e.hp <= 0) {
      this.killEnemy(e, sourceId);
    } else {
      this.events.push({ type: "hit", x: e.x, y: e.y });
    }
  }

  private killEnemy(e: SimEnemy, sourceId: string): void {
    e.hp = 0;
    this.events.push({ type: "death", x: e.x, y: e.y, radius: e.def.radius });
    const src = this.players.get(sourceId);
    if (src) {
      src.meter = Math.min(1, src.meter + e.def.worth * 0.02);
      if (src.meter >= 1) src.charged = true;
    }
  }

  private damagePlayer(p: SimPlayer, amount: number): void {
    if (p.downed || p.invuln > 0) return;
    // Fortress / protective zones
    for (const z of this.zones) {
      if (z.kind === "fortress" && dist(p.x, p.y, z.x, z.y) <= z.radius) return;
    }
    let dmg = amount;
    if (p.zodiacId === "taurus") dmg *= 0.85; // Immovable: -15% damage
    p.hp -= dmg;
    if (p.hp <= 0) {
      p.hp = 0;
      p.downed = true;
      p.reviveProgress = 0;
      this.events.push({ type: "playerDowned", x: p.x, y: p.y, ids: [p.id] });
      this.checkAllDowned();
    }
  }

  private checkAllDowned(): void {
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length > 0 && active.every((p) => p.downed)) {
      this.phase = "lost";
    }
  }

  // ---- Main update ----

  update(dt: number): void {
    if (this.phase !== "playing") return;
    this.time += dt;
    this.events = [];

    this.updateWaves(dt);
    this.updatePlayers(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.pruneActivations();
  }

  private updateWaves(dt: number): void {
    // spawn queued enemies a few at a time
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const batch = Math.min(3, this.spawnQueue.length);
        for (let i = 0; i < batch; i++) {
          const t = this.spawnQueue.shift()!;
          this.spawnEnemy(t);
        }
        this.spawnTimer = 0.8;
      }
    }

    this.enemiesRemaining = this.enemies.length + this.spawnQueue.length;

    // wave cleared?
    if (this.enemiesRemaining === 0 && this.waveBreak === 0) {
      if (this.wave >= FINAL_WAVE) {
        this.phase = "won";
        return;
      }
      this.waveBreak = 3; // brief intermission
    }
    if (this.waveBreak > 0) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) {
        this.waveBreak = 0;
        this.startNextWave();
      }
    }
  }

  private updatePlayers(dt: number): void {
    for (const p of this.players.values()) {
      // tick timers
      if (p.abilityCd > 0) p.abilityCd = Math.max(0, p.abilityCd - dt);
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
      if (p.speedBuff > 0) p.speedBuff = Math.max(0, p.speedBuff - dt);
      if (p.attackTimer > 0) p.attackTimer -= dt;

      // alignment passive trickle while alive
      if (!p.downed) {
        p.meter = Math.min(1, p.meter + ALIGNMENT_PASSIVE_PER_SEC * dt);
        if (p.meter >= 1) p.charged = true;
      }

      if (p.downed) {
        this.updateRevive(p, dt);
        continue;
      }

      // facing from aim or movement
      const inp = p.input;
      if (inp.hasAim && (inp.aimX !== 0 || inp.aimY !== 0)) {
        p.facingX = inp.aimX;
        p.facingY = inp.aimY;
      } else if (inp.moveX !== 0 || inp.moveY !== 0) {
        const m = Math.hypot(inp.moveX, inp.moveY) || 1;
        p.facingX = inp.moveX / m;
        p.facingY = inp.moveY / m;
      }

      // movement (dash overrides)
      if (p.dashTime > 0) {
        p.dashTime -= dt;
        p.x += p.dashVX * dt;
        p.y += p.dashVY * dt;
        this.resolveDashHits(p);
      } else {
        let mx = inp.moveX;
        let my = inp.moveY;
        const mag = Math.hypot(mx, my);
        if (mag > 1) {
          mx /= mag;
          my /= mag;
        }
        const spd = p.speed * (p.speedBuff > 0 ? 1.4 : 1);
        p.x += mx * spd * dt;
        p.y += my * spd * dt;
      }
      [p.x, p.y] = clampToArena(p.x, p.y, 18);

      // auto basic attack
      if (p.attackTimer <= 0) {
        this.doBasicAttack(p);
      }
    }
  }

  private updateRevive(p: SimPlayer, dt: number): void {
    let reviver = false;
    for (const o of this.players.values()) {
      if (o.id === p.id || o.downed) continue;
      if (dist(o.x, o.y, p.x, p.y) <= REVIVE_RANGE) {
        reviver = true;
        break;
      }
    }
    if (reviver) {
      p.reviveProgress += dt / REVIVE_TIME;
      if (p.reviveProgress >= 1) {
        p.downed = false;
        p.hp = p.maxHp * REVIVE_HP_FRACTION;
        p.reviveProgress = 0;
        p.invuln = 1.5;
        // credit nearby revivers
        for (const o of this.players.values()) {
          if (o.id !== p.id && !o.downed && dist(o.x, o.y, p.x, p.y) <= REVIVE_RANGE) {
            o.revives += 1;
          }
        }
        this.events.push({ type: "revive", x: p.x, y: p.y, ids: [p.id] });
      }
    } else {
      p.reviveProgress = Math.max(0, p.reviveProgress - dt * 0.5);
    }
  }

  private resolveDashHits(p: SimPlayer): void {
    for (const e of this.enemies) {
      if (p.dashHitIds.has(e.id)) continue;
      if (dist(p.x, p.y, e.x, e.y) <= 30 + e.def.radius) {
        p.dashHitIds.add(e.id);
        this.damageEnemy(e, 30, p.id, false);
        // stun + knockback (unless boss resists)
        if (e.type !== "boss") {
          e.stun = Math.max(e.stun, 0.75);
          const kb = 320;
          e.vx += p.facingX * kb;
          e.vy += p.facingY * kb;
        }
      }
    }
  }

  private doBasicAttack(p: SimPlayer): void {
    const ba = p.def.stats!.basicAttack;
    p.attackTimer = ba.cooldown;

    // pick aim direction: manual aim, else nearest enemy
    let dirX = p.facingX;
    let dirY = p.facingY;
    const target = this.nearestEnemy(p.x, p.y, ba.range);
    if (!p.input.hasAim && target) {
      const d = dist(p.x, p.y, target.x, target.y) || 1;
      dirX = (target.x - p.x) / d;
      dirY = (target.y - p.y) / d;
      p.facingX = dirX;
      p.facingY = dirY;
    }
    if (!target && !p.input.hasAim) {
      // nothing in range and not aiming: hold fire
      p.attackTimer = 0.1;
      return;
    }

    switch (p.zodiacId) {
      case "aries":
        // short slash arc: hit nearest enemy in range/cone
        this.meleeHit(p, ba.range, 0.6, ba.damage, false);
        this.events.push({ type: "slash", x: p.x, y: p.y, radius: ba.range });
        break;
      case "taurus":
        // ground slam: small AoE around facing point
        this.aoeHit(p.x + dirX * 40, p.y + dirY * 40, 55, ba.damage, p.id);
        this.events.push({ type: "slam", x: p.x + dirX * 40, y: p.y + dirY * 40, radius: 55 });
        break;
      case "gemini": {
        // twin bolts (2 projectiles), plus Twin Shadow clone mirrors them
        for (let i = 0; i < ba.hits; i++) {
          const spread = (i - (ba.hits - 1) / 2) * 0.12;
          this.fireProjectile(p, dirX, dirY, spread, ba.damage, "air");
        }
        // clone offset behind-left of player mirrors the attack
        const [clx, cly] = this.clonePos(p);
        for (let i = 0; i < ba.hits; i++) {
          const spread = (i - (ba.hits - 1) / 2) * 0.12;
          this.fireProjectileFrom(clx, cly, p, dirX, dirY, spread, ba.damage, "air");
        }
        break;
      }
      case "pisces":
        // water orb projectile + slow on hit
        this.fireProjectile(p, dirX, dirY, 0, ba.damage, "water", 0.6);
        break;
      default:
        this.meleeHit(p, ba.range, 0.7, ba.damage, false);
    }
  }

  /** Gemini clone position (Twin Shadow). */
  private clonePos(p: SimPlayer): [number, number] {
    return [p.x - p.facingX * 36 + p.facingY * 24, p.y - p.facingY * 36 - p.facingX * 24];
  }

  private nearestEnemy(x: number, y: number, maxRange = Infinity): SimEnemy | null {
    let best: SimEnemy | null = null;
    let bestD = maxRange;
    for (const e of this.enemies) {
      const d = dist(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private meleeHit(p: SimPlayer, range: number, cone: number, damage: number, _aoe: boolean): void {
    // hit the single best enemy in a cone in front
    let best: SimEnemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > range + e.def.radius) continue;
      const dx = (e.x - p.x) / (d || 1);
      const dy = (e.y - p.y) / (d || 1);
      const dot = dx * p.facingX + dy * p.facingY;
      if (dot < 1 - cone) continue; // outside cone
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) this.damageEnemy(best, damage, p.id, true);
  }

  private aoeHit(x: number, y: number, radius: number, damage: number, owner: string): void {
    let first = true;
    for (const e of this.enemies) {
      if (dist(e.x, e.y, x, y) <= radius + e.def.radius) {
        this.damageEnemy(e, damage, owner, first);
        first = false;
      }
    }
  }

  private fireProjectile(
    p: SimPlayer,
    dirX: number,
    dirY: number,
    spread: number,
    damage: number,
    element: Element | "void",
    slow = 0,
  ): void {
    this.fireProjectileFrom(p.x, p.y, p, dirX, dirY, spread, damage, element, slow);
  }

  private fireProjectileFrom(
    ox: number,
    oy: number,
    p: SimPlayer,
    dirX: number,
    dirY: number,
    spread: number,
    damage: number,
    element: Element | "void",
    slow = 0,
  ): void {
    const ang = Math.atan2(dirY, dirX) + spread;
    const speed = 520;
    this.projectiles.push({
      id: newId(),
      x: ox,
      y: oy,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      damage,
      hostile: false,
      owner: p.id,
      element,
      life: 1.2,
      pierce: 0,
      hitIds: new Set(),
      slow,
    });
  }

  // ---- Enemies ----

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      // knockback decay
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= Math.pow(0.001, dt);
      e.vy *= Math.pow(0.001, dt);

      if (e.stun > 0) {
        e.stun -= dt;
      } else {
        this.enemyAI(e, dt);
      }
      if (e.slow > 0) e.slow -= dt;
      if (e.contactTimer > 0) e.contactTimer -= dt;

      [e.x, e.y] = clampToArena(e.x, e.y, e.def.radius);
    }
    // remove dead
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private enemyAI(e: SimEnemy, dt: number): void {
    const target = this.nearestPlayer(e.x, e.y);
    if (!target) return;
    const d = dist(e.x, e.y, target.x, target.y) || 1;
    const dx = (target.x - e.x) / d;
    const dy = (target.y - e.y) / d;
    const slowFactor = e.slow > 0 ? 0.5 : 1;
    const spd = e.def.speed * slowFactor;

    if (e.type === "wisp") {
      // kite: keep preferred distance, fire
      const kite = e.def.kiteRange ?? 220;
      if (d < kite - 30) {
        e.x -= dx * spd * dt;
        e.y -= dy * spd * dt;
      } else if (d > kite + 30) {
        e.x += dx * spd * dt;
        e.y += dy * spd * dt;
      }
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = e.def.fireCooldown ?? 2;
        this.enemyShoot(e, dx, dy);
      }
      return;
    }

    if (e.type === "boss") {
      this.bossAI(e, dt, target, dx, dy, d, spd);
      return;
    }

    // drifter / brute: chase + contact damage
    if (this.blockedByBulwark(e, target)) {
      // try to slide around the barrier
      e.x += -dy * spd * dt;
      e.y += dx * spd * dt;
    } else {
      e.x += dx * spd * dt;
      e.y += dy * spd * dt;
    }
    this.tryContact(e, target);
  }

  private bossAI(
    e: SimEnemy,
    dt: number,
    target: SimPlayer,
    dx: number,
    dy: number,
    d: number,
    spd: number,
  ): void {
    // telegraphed AoE
    if (e.telegraph > 0) {
      e.telegraph -= dt;
      if (e.telegraph <= 0) {
        // detonate
        for (const p of this.players.values()) {
          if (!p.downed && dist(p.x, p.y, e.telegraphX, e.telegraphY) <= 130) {
            this.damagePlayer(p, e.def.damage);
          }
        }
        this.events.push({ type: "slam", x: e.telegraphX, y: e.telegraphY, radius: 130 });
      }
      return; // hold still while winding up
    }

    // approach
    if (d > 120) {
      e.x += dx * spd * dt;
      e.y += dy * spd * dt;
    }
    this.tryContact(e, target);

    e.attackTimer -= dt;
    if (e.attackTimer <= 0) {
      e.attackTimer = 4;
      e.telegraph = 1.4;
      e.telegraphTotal = 1.4;
      e.telegraphX = target.x;
      e.telegraphY = target.y;
    }

    e.summonTimer -= dt;
    if (e.summonTimer <= 0) {
      e.summonTimer = 8;
      for (let i = 0; i < 3; i++) this.spawnEnemy("drifter");
      this.enemiesRemaining = this.enemies.length + this.spawnQueue.length;
    }
  }

  private blockedByBulwark(e: SimEnemy, target: SimPlayer): boolean {
    for (const z of this.zones) {
      if (z.kind !== "bulwark") continue;
      // simple block: if enemy is on the outer side of the barrier near it
      const de = dist(e.x, e.y, z.x, z.y);
      if (de <= z.radius) {
        // is enemy roughly between approach and player through the arc?
        const toPlayer = Math.atan2(target.y - z.y, target.x - z.x);
        const toEnemy = Math.atan2(e.y - z.y, e.x - z.x);
        let diff = Math.abs(toPlayer - toEnemy);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 1.0) return true;
      }
    }
    return false;
  }

  private tryContact(e: SimEnemy, target: SimPlayer): void {
    if (e.contactTimer > 0) return;
    if (dist(e.x, e.y, target.x, target.y) <= e.def.radius + 18) {
      e.contactTimer = e.def.contactCooldown;
      this.damagePlayer(target, e.def.damage);
    }
  }

  private enemyShoot(e: SimEnemy, dx: number, dy: number): void {
    const speed = 300;
    this.projectiles.push({
      id: newId(),
      x: e.x,
      y: e.y,
      vx: dx * speed,
      vy: dy * speed,
      damage: e.def.damage,
      hostile: true,
      owner: "enemy",
      element: "void",
      life: 3,
      pierce: 0,
      hitIds: new Set(),
      slow: 0,
    });
  }

  private nearestPlayer(x: number, y: number): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bestD = Infinity;
    for (const p of this.players.values()) {
      if (p.downed || !p.connected) continue;
      const d = dist(x, y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // ---- Projectiles ----

  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;

      // out of arena
      if (dist(pr.x, pr.y, ARENA_CX, ARENA_CY) > ARENA_RADIUS) {
        pr.life = 0;
        continue;
      }

      if (pr.hostile) {
        // blocked by bulwark?
        if (this.projectileBlocked(pr)) {
          pr.life = 0;
          continue;
        }
        for (const p of this.players.values()) {
          if (p.downed) continue;
          if (dist(pr.x, pr.y, p.x, p.y) <= 18) {
            this.damagePlayer(p, pr.damage);
            pr.life = 0;
            break;
          }
        }
      } else {
        for (const e of this.enemies) {
          if (pr.hitIds.has(e.id)) continue;
          if (dist(pr.x, pr.y, e.x, e.y) <= e.def.radius + 6) {
            this.damageEnemy(e, pr.damage, pr.owner, true);
            if (pr.slow > 0) e.slow = Math.max(e.slow, pr.slow);
            pr.hitIds.add(e.id);
            if (pr.pierce <= 0) {
              pr.life = 0;
              break;
            }
            pr.pierce -= 1;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private projectileBlocked(pr: SimProjectile): boolean {
    for (const z of this.zones) {
      if (z.kind === "bulwark" && dist(pr.x, pr.y, z.x, z.y) <= z.radius * 0.5) {
        return true;
      }
    }
    return false;
  }

  // ---- Zones ----

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      z.life -= dt;
      if (z.kind === "tidepool" && z.healPerSec > 0) {
        for (const p of this.players.values()) {
          if (!p.downed && dist(p.x, p.y, z.x, z.y) <= z.radius) {
            this.heal(p, z.healPerSec * dt, z.owner);
          }
        }
      }
    }
    this.zones = this.zones.filter((z) => z.life > 0);
  }

  private pruneActivations(): void {
    this.activations = this.activations.filter((a) => this.time - a.t <= ALIGNMENT_WINDOW);
  }

  // ---- Snapshot ----

  snapshot(serverTimeMs: number): Snapshot {
    return {
      t: serverTimeMs,
      phase: this.phase,
      wave: this.wave,
      enemiesRemaining: this.enemiesRemaining,
      players: [...this.players.values()].map((p) => {
        const hasClone = p.zodiacId === "gemini" && !p.downed;
        const [clx, cly] = hasClone ? this.clonePos(p) : [0, 0];
        return {
          id: p.id,
          name: p.name,
          zodiac: p.zodiacId,
          element: p.element,
          x: p.x,
          y: p.y,
          facingX: p.facingX,
          facingY: p.facingY,
          hp: p.hp,
          maxHp: p.maxHp,
          abilityCd: p.abilityCd,
          abilityMax: p.abilityMax,
          meter: p.meter,
          charged: p.charged,
          downed: p.downed,
          reviveProgress: p.reviveProgress,
          speedBuffUntil: p.speedBuff > 0 ? serverTimeMs + p.speedBuff * 1000 : 0,
          invulnUntil: p.invuln > 0 ? serverTimeMs + p.invuln * 1000 : 0,
          hasClone,
          cloneX: clx,
          cloneY: cly,
          damageDealt: Math.round(p.damageDealt),
          healingDone: Math.round(p.healingDone),
          revives: p.revives,
        };
      }),
      enemies: this.enemies.map((e) => ({
        id: e.id,
        type: e.type,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        radius: e.def.radius,
        stunned: e.stun > 0,
        telegraph: e.telegraph > 0 && e.telegraphTotal > 0 ? 1 - e.telegraph / e.telegraphTotal : 0,
      })),
      projectiles: this.projectiles.map((pr) => ({
        id: pr.id,
        x: pr.x,
        y: pr.y,
        hostile: pr.hostile,
        element: pr.element,
      })),
      zones: this.zones.map((z) => ({
        id: z.id,
        kind: z.kind,
        x: z.x,
        y: z.y,
        radius: z.radius,
        angle: z.angle,
        life: z.maxLife > 0 ? z.life / z.maxLife : 0,
        owner: z.owner,
      })),
      events: this.events,
    };
  }

  /** Stats for the results screen. */
  results() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      zodiac: p.zodiacId,
      damageDealt: Math.round(p.damageDealt),
      healingDone: Math.round(p.healingDone),
      revives: p.revives,
    }));
  }
}
