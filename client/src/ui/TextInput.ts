import Phaser from "phaser";
import { COLORS, FONT } from "./theme";

export interface TextInputOptions {
  width?: number;
  height?: number;
  maxLength?: number;
  placeholder?: string;
  uppercase?: boolean;
  fontSize?: number;
  /** Allowed-character test; chars failing it are ignored. */
  filter?: (ch: string) => boolean;
  onEnter?: () => void;
  onChange?: (value: string) => void;
}

/**
 * A self-contained, canvas-rendered text field. Avoids Phaser DOM elements
 * entirely so it stays pixel-aligned under Scale.FIT and never fights the
 * canvas for focus. Click to focus; type with the keyboard; Enter confirms.
 */
export class TextInput {
  value: string;
  focused = false;

  private scene: Phaser.Scene;
  private x: number;
  private y: number;
  private w: number;
  private h: number;
  private opts: TextInputOptions;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private txt: Phaser.GameObjects.Text;
  private caret: Phaser.GameObjects.Rectangle;
  private leftX: number;
  private onKey: (e: KeyboardEvent) => void;
  private onGlobalDown: (p: Phaser.Input.Pointer) => void;
  private caretEvent: Phaser.Time.TimerEvent;

  private static instances = new Set<TextInput>();

  constructor(scene: Phaser.Scene, x: number, y: number, value: string, opts: TextInputOptions = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.opts = opts;
    this.w = opts.width ?? 280;
    this.h = opts.height ?? 50;
    this.value = value ?? "";

    this.bg = scene.add.rectangle(0, 0, this.w, this.h, COLORS.panel, 1).setStrokeStyle(2, COLORS.accent, 0.7);
    this.leftX = -this.w / 2 + 14;
    this.txt = scene.add
      .text(this.leftX, 0, "", { fontFamily: FONT, fontSize: `${opts.fontSize ?? 20}px`, color: COLORS.text })
      .setOrigin(0, 0.5);
    this.caret = scene.add.rectangle(this.leftX, 0, 2, (opts.fontSize ?? 20) + 6, 0xffffff, 1).setVisible(false);

    this.container = scene.add.container(x, y, [this.bg, this.txt, this.caret]);
    this.container.setSize(this.w, this.h).setDepth(20);

    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on("pointerdown", () => this.focus());

    // type handler
    this.onKey = (e: KeyboardEvent) => this.handleKey(e);
    scene.input.keyboard?.on("keydown", this.onKey);
    scene.input.keyboard?.addCapture(["BACKSPACE"]);

    // click-away to blur
    this.onGlobalDown = (p: Phaser.Input.Pointer) => {
      const inside =
        p.x >= this.x - this.w / 2 &&
        p.x <= this.x + this.w / 2 &&
        p.y >= this.y - this.h / 2 &&
        p.y <= this.y + this.h / 2;
      if (!inside && this.focused) this.blur();
    };
    scene.input.on("pointerdown", this.onGlobalDown);

    // blinking caret
    this.caretEvent = scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.focused) this.caret.setVisible(!this.caret.visible);
      },
    });

    TextInput.instances.add(this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.redraw();
  }

  focus(): void {
    for (const o of TextInput.instances) if (o !== this && o.scene === this.scene) o.blur();
    this.focused = true;
    this.caret.setVisible(true);
    this.bg.setStrokeStyle(2, COLORS.accentBright, 1);
    this.redraw();
  }

  blur(): void {
    this.focused = false;
    this.caret.setVisible(false);
    this.bg.setStrokeStyle(2, COLORS.accent, 0.7);
    this.redraw();
  }

  getValue(): string {
    return this.value;
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.focused) return;
    if (e.key === "Enter") {
      this.blur();
      this.opts.onEnter?.();
      return;
    }
    if (e.key === "Backspace") {
      this.value = this.value.slice(0, -1);
      this.opts.onChange?.(this.value);
      this.redraw();
      e.preventDefault?.();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      let ch = e.key;
      if (this.opts.uppercase) ch = ch.toUpperCase();
      if (this.opts.filter && !this.opts.filter(ch)) return;
      const max = this.opts.maxLength ?? 16;
      if (this.value.length >= max) return;
      this.value += ch;
      this.opts.onChange?.(this.value);
      this.redraw();
    }
  }

  private redraw(): void {
    const showPlaceholder = this.value.length === 0 && this.opts.placeholder;
    if (showPlaceholder) {
      this.txt.setText(this.opts.placeholder!).setColor(COLORS.textDim);
    } else {
      this.txt.setText(this.value).setColor(COLORS.text);
    }
    this.caret.setX(this.leftX + (this.value.length === 0 ? 0 : this.txt.width) + 2);
  }

  destroy(): void {
    TextInput.instances.delete(this);
    this.scene.input.keyboard?.off("keydown", this.onKey);
    this.scene.input.off("pointerdown", this.onGlobalDown);
    this.caretEvent.remove();
    this.container.destroy();
  }
}
