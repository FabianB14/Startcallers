import Phaser from "phaser";
import { net } from "../net/NetClient";
import { COLORS, FONT } from "../ui/theme";
import { WORLD_H, WORLD_W } from "../../../shared/constants";
import { ELEMENTS, getZodiac } from "../../../shared/zodiac";
import type { PlayerSnap, Snapshot } from "../../../shared/types";

export class HUDScene extends Phaser.Scene {
  private snap: Snapshot | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private offSnap?: () => void;

  constructor() {
    super("HUD");
  }

  create(): void {
    this.g = this.add.graphics();
    this.offSnap = net.onSnap((s) => (this.snap = s));

    // mobile ability button (also works with mouse/touch)
    const btn = this.add.circle(WORLD_W - 90, WORLD_H - 90, 54, COLORS.accent, 0.25).setStrokeStyle(3, COLORS.accentBright, 0.9);
    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerdown", () => net.useAbility());
    this.add
      .text(WORLD_W - 90, WORLD_H - 90, "✦", { fontFamily: FONT, fontSize: "40px", color: "#fff" })
      .setOrigin(0.5);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offSnap?.());
  }

  update(): void {
    this.g.clear();
    this.texts.forEach((t) => t.setVisible(false));
    let ti = 0;
    const text = (x: number, y: number, str: string, size: number, color: string, origin = 0.5): void => {
      let t = this.texts[ti];
      if (!t) {
        t = this.add.text(0, 0, "", {}).setDepth(2);
        this.texts.push(t);
      }
      t.setText(str)
        .setPosition(x, y)
        .setOrigin(origin, 0.5)
        .setStyle({ fontFamily: FONT, fontSize: `${size}px`, color })
        .setVisible(true);
      ti++;
    };

    const s = this.snap;
    if (!s) return;

    const me = s.players.find((p) => p.id === net.sessionId);

    // top-center: wave + enemies
    text(WORLD_W / 2, 30, `WAVE ${s.wave} / 10`, 26, "#e8e9ff");
    text(WORLD_W / 2, 56, `${s.enemiesRemaining} void remaining`, 16, "#9aa0d0");

    // party frames top-left (teammates)
    const others = s.players.filter((p) => p.id !== net.sessionId);
    others.forEach((p, i) => this.drawPartyFrame(p, 20, 90 + i * 64, text));

    if (me) this.drawPersonalHud(me, text);
  }

  private drawPartyFrame(
    p: PlayerSnap,
    x: number,
    y: number,
    text: (x: number, y: number, s: string, size: number, c: string, o?: number) => void,
  ): void {
    const el = ELEMENTS[p.element];
    const z = getZodiac(p.zodiac);
    const w = 220;
    this.g.fillStyle(COLORS.panel, 0.8);
    this.g.fillRoundedRect(x, y, w, 54, 8);
    this.g.lineStyle(2, p.charged ? el.accent : el.color, p.charged ? 1 : 0.7);
    this.g.strokeRoundedRect(x, y, w, 54, 8);

    text(x + 26, y + 27, z.glyph, 24, "#" + el.color.toString(16).padStart(6, "0"));

    const status = p.downed ? "DOWN — revive!" : `${z.name}`;
    text(x + 48, y + 16, p.name, 16, "#e8e9ff", 0);
    text(x + 48, y + 38, status, 13, p.downed ? "#ff6b7d" : "#9aa0d0", 0);

    // mini health bar
    const bw = 110;
    const bx = x + 100;
    const frac = Math.max(0, p.hp / p.maxHp);
    this.g.fillStyle(0x000000, 0.6);
    this.g.fillRect(bx, y + 12, bw, 7);
    this.g.fillStyle(p.downed ? 0x44496f : frac > 0.3 ? 0x6fe08a : 0xff6b7d, 1);
    this.g.fillRect(bx, y + 12, bw * frac, 7);

    // ability cooldown pip
    const cdFrac = p.abilityMax > 0 ? 1 - p.abilityCd / p.abilityMax : 1;
    this.g.fillStyle(0x000000, 0.6);
    this.g.fillRect(bx, y + 34, bw, 5);
    this.g.fillStyle(0x8a7bff, 1);
    this.g.fillRect(bx, y + 34, bw * cdFrac, 5);

    if (p.charged) {
      this.g.fillStyle(el.accent, 0.9);
      this.g.fillCircle(x + w - 12, y + 12, 5);
    }
  }

  private drawPersonalHud(
    me: PlayerSnap,
    text: (x: number, y: number, s: string, size: number, c: string, o?: number) => void,
  ): void {
    const el = ELEMENTS[me.element];
    const z = getZodiac(me.zodiac);
    const cx = WORLD_W / 2;
    const baseY = WORLD_H - 70;

    // big health bar
    const hw = 320;
    const frac = Math.max(0, me.hp / me.maxHp);
    this.g.fillStyle(0x000000, 0.6);
    this.g.fillRoundedRect(cx - hw / 2, baseY, hw, 22, 6);
    this.g.fillStyle(frac > 0.3 ? 0x6fe08a : 0xff6b7d, 1);
    this.g.fillRoundedRect(cx - hw / 2, baseY, Math.max(2, hw * frac), 22, 6);
    this.g.lineStyle(2, 0xffffff, 0.3);
    this.g.strokeRoundedRect(cx - hw / 2, baseY, hw, 22, 6);
    text(cx, baseY + 11, `${Math.ceil(me.hp)} / ${me.maxHp}`, 15, "#05060f");

    // alignment meter
    const aw = 320;
    const ay = baseY + 30;
    this.g.fillStyle(0x000000, 0.6);
    this.g.fillRoundedRect(cx - aw / 2, ay, aw, 12, 4);
    const acol = me.charged ? el.accent : 0x8a7bff;
    this.g.fillStyle(acol, 1);
    this.g.fillRoundedRect(cx - aw / 2, ay, Math.max(2, aw * me.meter), 12, 4);
    if (me.charged) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 150);
      this.g.lineStyle(2, el.accent, 0.4 + 0.6 * pulse);
      this.g.strokeRoundedRect(cx - aw / 2, ay, aw, 12, 4);
      text(cx, ay + 6, "★ ALIGNMENT READY — combo with an ally! ★", 12, "#fff");
    } else {
      text(cx - aw / 2 - 8, ay + 6, "ALIGN", 11, "#9aa0d0", 1);
    }

    // ability icon w/ radial cooldown (left of health)
    const ix = cx - hw / 2 - 60;
    const iy = baseY + 11;
    this.g.fillStyle(COLORS.panel, 0.9);
    this.g.fillCircle(ix, iy, 32);
    this.g.lineStyle(3, el.color, 0.9);
    this.g.strokeCircle(ix, iy, 32);
    const ready = me.abilityCd <= 0.01;
    text(ix, iy - 4, z.active.name, ready ? 13 : 11, ready ? "#e8e9ff" : "#9aa0d0");
    if (!ready) {
      const frac2 = me.abilityCd / me.abilityMax;
      this.g.lineStyle(5, 0x05060f, 0.85);
      this.g.beginPath();
      this.g.arc(ix, iy, 32, -Math.PI / 2, -Math.PI / 2 + frac2 * Math.PI * 2);
      this.g.strokePath();
      text(ix, iy + 12, me.abilityCd.toFixed(1), 12, "#9aa0d0");
    } else {
      text(ix, iy + 12, "SPACE", 11, "#6fe08a");
    }
  }
}
