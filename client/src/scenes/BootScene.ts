import Phaser from "phaser";
import { COLORS, FONT } from "../ui/theme";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 20, "STARCALLERS", {
        fontFamily: FONT,
        fontSize: "48px",
        color: COLORS.text,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 30, "aligning the stars...", {
        fontFamily: FONT,
        fontSize: "18px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    // brief beat, then to the menu
    this.time.delayedCall(500, () => this.scene.start("MainMenu"));
  }
}
