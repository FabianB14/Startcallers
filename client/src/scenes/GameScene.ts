import Phaser from "phaser";
import { net } from "../net/NetClient";
import { FONT, makeStarfield } from "../ui/theme";
import {
  ARENA_CX,
  ARENA_CY,
  ARENA_RADIUS,
  WORLD_H,
  WORLD_W,
} from "../../../shared/constants";
import { ELEMENTS, getZodiac, type Element } from "../../../shared/zodiac";
import type { GameEvent, InputState, Snapshot } from "../../../shared/types";

interface RenderPos {
  x: number;
  y: number;
}

const ENEMY_COLOR = 0x1a1030;
const ENEMY_EYE = 0xff5fa2;

export class GameScene extends Phaser.Scene {
  private snap: Snapshot | null = null;
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private renderPos = new Map<string | number, RenderPos>();
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };
  private inputTimer = 0;
  private joyOrigin: { x: number; y: number } | null = null;
  private joyVec = { x: 0, y: 0 };
  private offSnap?: () => void;
  private offResults?: () => void;
  private banner?: Phaser.GameObjects.Text;

  constructor() {
    super("Game");
  }

  create(): void {
    // static background
    makeStarfield(this, WORLD_W, WORLD_H);
    const bgArena = this.add.graphics().setDepth(-50);
    this.drawArena(bgArena);

    this.gfx = this.add.graphics().setDepth(1);

    // input
    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey("UP"),
      down: kb.addKey("DOWN"),
      left: kb.addKey("LEFT"),
      right: kb.addKey("RIGHT"),
      w: kb.addKey("W"),
      a: kb.addKey("A"),
      s: kb.addKey("S"),
      d: kb.addKey("D"),
    };
    kb.on("keydown-SPACE", () => net.useAbility());

    // pointer ability (right click) + virtual joystick (left drag)
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        net.useAbility();
        return;
      }
      this.joyOrigin = { x: p.x, y: p.y };
      this.joyVec = { x: 0, y: 0 };
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.joyOrigin || !p.isDown) return;
      const dx = p.x - this.joyOrigin.x;
      const dy = p.y - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      const max = 70;
      const m = Math.min(len, max) / max;
      if (len > 6) {
        this.joyVec = { x: (dx / (len || 1)) * m, y: (dy / (len || 1)) * m };
      } else {
        this.joyVec = { x: 0, y: 0 };
      }
    });
    this.input.on("pointerup", () => {
      this.joyOrigin = null;
      this.joyVec = { x: 0, y: 0 };
    });

    // HUD overlay
    this.scene.launch("HUD");

    this.offSnap = net.onSnap((s) => this.onSnap(s));
    this.offResults = net.onResults((r) => {
      this.scene.stop("HUD");
      this.scene.start("Results", r);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offSnap?.();
      this.offResults?.();
    });
  }

  private drawArena(g: Phaser.GameObjects.Graphics): void {
    // astral platform
    g.fillStyle(0x0a0e22, 0.85);
    g.fillCircle(ARENA_CX, ARENA_CY, ARENA_RADIUS);
    // faint constellation grid
    g.lineStyle(1, 0x2a316a, 0.35);
    for (let r = 80; r < ARENA_RADIUS; r += 80) g.strokeCircle(ARENA_CX, ARENA_CY, r);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      g.lineBetween(
        ARENA_CX,
        ARENA_CY,
        ARENA_CX + Math.cos(a) * ARENA_RADIUS,
        ARENA_CY + Math.sin(a) * ARENA_RADIUS,
      );
    }
    // glowing barrier ring
    g.lineStyle(6, 0x8a7bff, 0.5);
    g.strokeCircle(ARENA_CX, ARENA_CY, ARENA_RADIUS);
    g.lineStyle(2, 0xb9aaff, 0.9);
    g.strokeCircle(ARENA_CX, ARENA_CY, ARENA_RADIUS);
  }

  private onSnap(s: Snapshot): void {
    this.snap = s;
    for (const ev of s.events) this.playEvent(ev);
  }

  // ---- per-frame ----

  update(_t: number, dtMs: number): void {
    const dt = dtMs / 1000;
    this.sendInput(dt);
    this.render(dt);
  }

  private gatherMove(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) x -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) x += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) y -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) y += 1;
    if (x === 0 && y === 0 && (this.joyVec.x !== 0 || this.joyVec.y !== 0)) {
      return { x: this.joyVec.x, y: this.joyVec.y };
    }
    return { x, y };
  }

  private sendInput(dt: number): void {
    this.inputTimer -= dt;
    if (this.inputTimer > 0) return;
    this.inputTimer = 0.05; // 20Hz
    const mv = this.gatherMove();
    const input: InputState = {
      moveX: mv.x,
      moveY: mv.y,
      aimX: 0,
      aimY: 0,
      hasAim: false,
    };
    net.sendInput(input);
  }

  private lerpPos(key: string | number, tx: number, ty: number, dt: number): RenderPos {
    let rp = this.renderPos.get(key);
    if (!rp) {
      rp = { x: tx, y: ty };
      this.renderPos.set(key, rp);
    }
    const k = 1 - Math.pow(0.0001, dt); // smoothing
    rp.x += (tx - rp.x) * k;
    rp.y += (ty - rp.y) * k;
    return rp;
  }

  private render(dt: number): void {
    const g = this.gfx;
    g.clear();
    const s = this.snap;
    if (!s) return;

    const seen = new Set<string | number>();

    // zones (under everything)
    for (const z of s.zones) {
      const a = z.life;
      if (z.kind === "tidepool") {
        g.fillStyle(0x4d9bff, 0.12 * a + 0.05);
        g.fillCircle(z.x, z.y, z.radius);
        g.lineStyle(2, 0x7fe6e6, 0.5 * a);
        g.strokeCircle(z.x, z.y, z.radius);
      } else if (z.kind === "fortress") {
        g.fillStyle(0x6fcf6f, 0.12);
        g.fillCircle(z.x, z.y, z.radius);
        g.lineStyle(3, 0xd6c26a, 0.6 * a);
        g.strokeCircle(z.x, z.y, z.radius);
      } else if (z.kind === "bulwark") {
        g.lineStyle(8, 0xd6c26a, 0.8 * a);
        g.beginPath();
        g.arc(z.x, z.y, z.radius, z.angle - 0.9, z.angle + 0.9);
        g.strokePath();
      }
    }

    // projectiles
    for (const pr of s.projectiles) {
      const rp = this.lerpPos(pr.id, pr.x, pr.y, dt);
      seen.add(pr.id);
      const col = pr.hostile ? 0xff5fa2 : this.elemColor(pr.element as Element);
      g.fillStyle(col, 0.35);
      g.fillCircle(rp.x, rp.y, 9);
      g.fillStyle(col, 1);
      g.fillCircle(rp.x, rp.y, 4);
    }

    // enemies
    for (const e of s.enemies) {
      const rp = this.lerpPos(e.id, e.x, e.y, dt);
      seen.add(e.id);
      const r = e.radius;
      // telegraph (boss windup) draws a danger ring at its position
      if (e.type === "boss" && e.telegraph > 0) {
        g.lineStyle(3, 0xff5fa2, 0.5 + 0.5 * e.telegraph);
        g.strokeCircle(rp.x, rp.y, 130 * e.telegraph);
      }
      // shadow body
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(rp.x + 3, rp.y + 4, r);
      g.fillStyle(e.stunned ? 0x3a2a55 : ENEMY_COLOR, 1);
      g.fillCircle(rp.x, rp.y, r);
      g.lineStyle(2, e.type === "boss" ? 0xff5fa2 : 0x4a3fa0, 0.8);
      g.strokeCircle(rp.x, rp.y, r);
      // glowing eyes
      g.fillStyle(ENEMY_EYE, 1);
      g.fillCircle(rp.x - r * 0.3, rp.y - r * 0.1, Math.max(2, r * 0.12));
      g.fillCircle(rp.x + r * 0.3, rp.y - r * 0.1, Math.max(2, r * 0.12));
      // hp bar for tanky enemies
      if (e.maxHp > 30) {
        const w = r * 2;
        const frac = Math.max(0, e.hp / e.maxHp);
        g.fillStyle(0x000000, 0.6);
        g.fillRect(rp.x - w / 2, rp.y - r - 10, w, 5);
        g.fillStyle(0xff5fa2, 1);
        g.fillRect(rp.x - w / 2, rp.y - r - 10, w * frac, 5);
      }
    }

    // players
    for (const p of s.players) {
      const rp = this.lerpPos(p.id, p.x, p.y, dt);
      seen.add(p.id);
      const el = ELEMENTS[p.element];
      const isMe = p.id === net.sessionId;

      if (p.downed) {
        // fading star
        g.lineStyle(2, 0x9aa0d0, 0.8);
        this.drawStar(g, rp.x, rp.y, 16, 7, 0x44496f, 0.5);
        if (p.reviveProgress > 0) {
          g.lineStyle(3, 0x6fe08a, 0.9);
          g.beginPath();
          g.arc(rp.x, rp.y, 24, -Math.PI / 2, -Math.PI / 2 + p.reviveProgress * Math.PI * 2);
          g.strokePath();
        }
        this.label(p.id, `${p.name}\nDOWN`, rp.x, rp.y - 40, "#ff6b7d");
        continue;
      }

      // charged glow ring
      if (p.charged) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 150);
        g.lineStyle(3, el.accent, 0.4 + 0.5 * pulse);
        g.strokeCircle(rp.x, rp.y, 30 + pulse * 4);
      }
      // invuln shimmer
      const invuln = p.invulnUntil > (this.snap?.t ?? 0);
      // body glow
      g.fillStyle(el.color, 0.25);
      g.fillCircle(rp.x, rp.y, 26);
      g.fillStyle(el.color, 1);
      g.fillCircle(rp.x, rp.y, 16);
      g.lineStyle(isMe ? 3 : 2, isMe ? 0xffffff : el.accent, invuln ? 0.4 : 0.9);
      g.strokeCircle(rp.x, rp.y, 16);
      // facing pip
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(rp.x + p.facingX * 16, rp.y + p.facingY * 16, 4);

      // Gemini Twin Shadow clone
      if (p.hasClone) {
        const cp = this.lerpPos(p.id + "_clone", p.cloneX, p.cloneY, dt);
        g.fillStyle(el.color, 0.4);
        g.fillCircle(cp.x, cp.y, 13);
      }

      // in-world health bar + glyph
      const z = getZodiac(p.zodiac);
      const w = 40;
      const frac = Math.max(0, p.hp / p.maxHp);
      g.fillStyle(0x000000, 0.6);
      g.fillRect(rp.x - w / 2, rp.y - 30, w, 5);
      g.fillStyle(frac > 0.3 ? 0x6fe08a : 0xff6b7d, 1);
      g.fillRect(rp.x - w / 2, rp.y - 30, w * frac, 5);
      this.label(p.id, `${z.glyph} ${p.name}`, rp.x, rp.y - 48, isMe ? "#ffffff" : "#cdd2ff");
    }

    this.cullLabels(seen);
  }

  private drawStar(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    outer: number,
    inner: number,
    fill: number,
    alpha: number,
  ): void {
    g.fillStyle(fill, alpha);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
  }

  private label(key: string, text: string, x: number, y: number, color: string): void {
    let t = this.labels.get(key);
    if (!t) {
      t = this.add
        .text(0, 0, "", { fontFamily: FONT, fontSize: "13px", color, align: "center" })
        .setOrigin(0.5)
        .setDepth(6);
      this.labels.set(key, t);
    }
    t.setText(text).setPosition(x, y).setColor(color).setVisible(true);
  }

  private cullLabels(seen: Set<string | number>): void {
    for (const [key, t] of this.labels) {
      if (!seen.has(key)) t.setVisible(false);
    }
    // drop stale render positions
    for (const key of this.renderPos.keys()) {
      if (typeof key === "string" && key.endsWith("_clone")) continue;
      if (!seen.has(key)) this.renderPos.delete(key);
    }
  }

  private elemColor(el: Element | "void"): number {
    if (el === "void" || !ELEMENTS[el as Element]) return 0xff5fa2;
    return ELEMENTS[el as Element].accent;
  }

  // ---- VFX ----

  private playEvent(ev: GameEvent): void {
    switch (ev.type) {
      case "charge":
        this.flashRing(ev.x!, ev.y!, 40, 0xffd166);
        break;
      case "slam":
        this.flashRing(ev.x!, ev.y!, ev.radius ?? 55, 0xd6c26a);
        break;
      case "death":
        this.burst(ev.x!, ev.y!, 0xff5fa2);
        break;
      case "revive":
        this.flashRing(ev.x!, ev.y!, 30, 0x6fe08a);
        break;
      case "playerDowned":
        this.cameras.main.shake(150, 0.004);
        break;
      case "waveStart":
        this.showBanner(ev.text ?? "", ev.variant === "boss");
        break;
      case "bossSpawn":
        this.cameras.main.shake(400, 0.006);
        break;
      case "alignment":
        this.alignmentBurst(ev);
        break;
    }
  }

  private flashRing(x: number, y: number, r: number, color: number): void {
    const c = this.add.circle(x, y, r).setStrokeStyle(4, color, 1).setDepth(8);
    this.tweens.add({
      targets: c,
      scale: 2,
      alpha: 0,
      duration: 350,
      onComplete: () => c.destroy(),
    });
  }

  private burst(x: number, y: number, color: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const dot = this.add.circle(x, y, 3, color).setDepth(8);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * 24,
        y: y + Math.sin(a) * 24,
        alpha: 0,
        duration: 300,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private alignmentBurst(ev: GameEvent): void {
    const x = ev.x ?? ARENA_CX;
    const y = ev.y ?? ARENA_CY;
    const variant = ev.variant ?? "nova";
    const colorMap: Record<string, number> = {
      fire: 0xff6b3d,
      water: 0x4d9bff,
      earth: 0x6fcf6f,
      air: 0x8ee6ff,
      nova: 0xb9aaff,
      swap: 0x8ee6ff,
    };
    const color = colorMap[variant] ?? 0xb9aaff;

    // constellation lines between participants
    if (ev.ids && this.snap) {
      const pts = ev.ids
        .map((id) => this.snap!.players.find((p) => p.id === id))
        .filter(Boolean) as { x: number; y: number }[];
      const line = this.add.graphics().setDepth(7);
      line.lineStyle(2, color, 0.9);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          line.lineBetween(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
        }
        const star = this.add.circle(pts[i].x, pts[i].y, 6, color).setDepth(7);
        this.tweens.add({ targets: star, scale: 2, alpha: 0, duration: 700, onComplete: () => star.destroy() });
      }
      this.tweens.add({ targets: line, alpha: 0, duration: 700, onComplete: () => line.destroy() });
    }

    if (variant !== "swap") {
      const ring = this.add.circle(x, y, 30).setStrokeStyle(6, color, 1).setDepth(8);
      this.tweens.add({ targets: ring, scale: 7, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
      const flash = this.add.circle(x, y, 200, color, 0.3).setDepth(8);
      this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
      this.cameras.main.shake(250, 0.006);
      this.showBanner(this.superName(variant), false, color);
    }
  }

  private superName(variant: string): string {
    switch (variant) {
      case "fire":
        return "METEOR";
      case "water":
        return "HEALING NOVA";
      case "earth":
        return "FORTRESS";
      case "air":
        return "SLIPSTREAM";
      default:
        return "CONSTELLATION NOVA";
    }
  }

  private showBanner(text: string, boss: boolean, color = 0xb9aaff): void {
    this.banner?.destroy();
    const hex = "#" + color.toString(16).padStart(6, "0");
    const t = this.add
      .text(WORLD_W / 2, 140, boss ? `⚠  ${text || "BOSS"}  ⚠` : text, {
        fontFamily: FONT,
        fontSize: boss ? "48px" : "40px",
        color: boss ? "#ff6b7d" : hex,
      })
      .setOrigin(0.5)
      .setDepth(50);
    t.setShadow(0, 0, hex, 16, true, true);
    this.banner = t;
    t.setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 250, ease: "Back.out" });
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 500, onComplete: () => t.destroy() });
  }
}
