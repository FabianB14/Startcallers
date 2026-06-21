import Phaser from "phaser";
import { ELEMENTS, type Element } from "../../../shared/zodiac";

export const COLORS = {
  bg: 0x05060f,
  panel: 0x10142b,
  panelLight: 0x1b2348,
  accent: 0x8a7bff,
  accentBright: 0xb9aaff,
  text: "#e8e9ff",
  textDim: "#9aa0d0",
  good: 0x6fe08a,
  bad: 0xff6b7d,
  star: 0xffffff,
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export function elementColor(el: Element): number {
  return ELEMENTS[el].color;
}

/** A glowing, hoverable text button built from Phaser game objects. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; height?: number; color?: number; fontSize?: number } = {},
): Phaser.GameObjects.Container {
  const w = opts.width ?? 240;
  const h = opts.height ?? 52;
  const base = opts.color ?? COLORS.panelLight;

  const bg = scene.add.rectangle(0, 0, w, h, base, 1).setStrokeStyle(2, COLORS.accent, 0.8);
  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: FONT,
      fontSize: `${opts.fontSize ?? 22}px`,
      color: COLORS.text,
    })
    .setOrigin(0.5);

  const container = scene.add.container(x, y, [bg, txt]);
  container.setSize(w, h);
  container.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);

  container.on("pointerover", () => {
    bg.setFillStyle(COLORS.accent, 1);
    scene.tweens.add({ targets: container, scale: 1.04, duration: 90 });
  });
  container.on("pointerout", () => {
    bg.setFillStyle(base, 1);
    scene.tweens.add({ targets: container, scale: 1, duration: 90 });
  });
  container.on("pointerdown", () => {
    scene.tweens.add({ targets: container, scale: 0.96, duration: 60, yoyo: true });
    onClick();
  });

  return container;
}

/** Parallax-ish starfield drawn into a scene. Returns the layer container. */
export function makeStarfield(scene: Phaser.Scene, width: number, height: number): void {
  const g = scene.add.graphics();
  g.setDepth(-100);
  // nebula blobs
  for (let i = 0; i < 6; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    const r = Phaser.Math.Between(120, 260);
    const col = Phaser.Display.Color.GetColor(
      Phaser.Math.Between(20, 60),
      Phaser.Math.Between(10, 40),
      Phaser.Math.Between(60, 110),
    );
    g.fillStyle(col, 0.08);
    g.fillCircle(x, y, r);
  }
  // stars
  for (let i = 0; i < 220; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    const s = Math.random() * 1.8 + 0.3;
    const a = Math.random() * 0.7 + 0.3;
    g.fillStyle(0xffffff, a);
    g.fillCircle(x, y, s);
  }
}

/** Lightweight toast message at the top of the screen. */
export function toast(scene: Phaser.Scene, message: string, color = COLORS.bad): void {
  const cam = scene.cameras.main;
  const t = scene.add
    .text(cam.width / 2, 80, message, {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 16, y: 10 },
    })
    .setOrigin(0.5)
    .setDepth(1000);
  t.setTint(color);
  scene.tweens.add({
    targets: t,
    alpha: 0,
    y: 60,
    delay: 1800,
    duration: 600,
    onComplete: () => t.destroy(),
  });
}
