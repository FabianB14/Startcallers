import Phaser from "phaser";
import { COLORS, FONT, makeButton, makeStarfield, toast } from "../ui/theme";
import { net } from "../net/NetClient";

const INPUT_STYLE =
  "width:260px;padding:12px;border-radius:8px;border:2px solid #4a3fa0;" +
  "background:#10142b;color:#e8e9ff;font-size:18px;font-family:inherit;text-align:center;outline:none;";

export class MainMenuScene extends Phaser.Scene {
  private nameInput!: HTMLInputElement;
  private codeInput?: HTMLInputElement;
  private busy = false;

  constructor() {
    super("MainMenu");
  }

  create(): void {
    const { width, height } = this.scale;
    makeStarfield(this, width, height);

    // Title
    const title = this.add
      .text(width / 2, 150, "STARCALLERS", {
        fontFamily: FONT,
        fontSize: "72px",
        color: COLORS.text,
      })
      .setOrigin(0.5);
    title.setShadow(0, 0, "#8a7bff", 24, true, true);
    this.tweens.add({ targets: title, y: 158, duration: 2400, yoyo: true, repeat: -1, ease: "Sine.inOut" });

    this.add
      .text(width / 2, 210, "channel the night sky · co-op arena", {
        fontFamily: FONT,
        fontSize: "20px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    // Name field
    this.add
      .text(width / 2, 290, "STARCALLER NAME", {
        fontFamily: FONT,
        fontSize: "14px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);
    const nameDom = this.add.dom(width / 2, 326).createFromHTML(
      `<input type="text" maxlength="16" style="${INPUT_STYLE}" />`,
    );
    this.nameInput = nameDom.node.querySelector("input") as HTMLInputElement;
    this.nameInput.value = net.playerName;
    this.nameInput.placeholder = "Star";

    // Buttons
    makeButton(this, width / 2, 420, "▶  HOST GAME", () => this.host(), { width: 300, fontSize: 24 });
    makeButton(this, width / 2, 484, "JOIN GAME", () => this.showJoin(), { width: 300 });
    makeButton(this, width / 2, 548, "HOW TO PLAY", () => this.howToPlay(), { width: 300 });

    this.add
      .text(width / 2, height - 30, "WASD move · auto-attack · SPACE ability · combo supers when charged", {
        fontFamily: FONT,
        fontSize: "15px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);
  }

  private saveName(): void {
    net.setName(this.nameInput.value.trim() || "Star");
  }

  private async host(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.saveName();
    try {
      await net.host();
      this.scene.start("Lobby");
    } catch (e) {
      console.error(e);
      toast(this, "Could not reach server. Is it running on :2567?");
      this.busy = false;
    }
  }

  private showJoin(): void {
    if (this.codeInput) {
      this.connect();
      return;
    }
    const { width } = this.scale;
    const dom = this.add.dom(width / 2, 484).createFromHTML(
      `<input type="text" maxlength="4" placeholder="CODE" style="${INPUT_STYLE};text-transform:uppercase;width:160px;letter-spacing:8px;" />`,
    );
    this.codeInput = dom.node.querySelector("input") as HTMLInputElement;
    this.codeInput.focus();
    makeButton(this, width / 2, 548, "CONNECT", () => this.connect(), { width: 300, color: COLORS.accent });
    this.codeInput.addEventListener("keydown", (ev) => {
      if ((ev as KeyboardEvent).key === "Enter") this.connect();
    });
  }

  private async connect(): Promise<void> {
    if (this.busy || !this.codeInput) return;
    const code = this.codeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      toast(this, "Enter a 4-letter room code");
      return;
    }
    this.busy = true;
    this.saveName();
    try {
      await net.join(code);
      this.scene.start("Lobby");
    } catch (e) {
      console.error(e);
      toast(this, "Room not found or full");
      this.busy = false;
    }
  }

  private howToPlay(): void {
    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0).setDepth(2000);
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x05060f, 0.92);
    bg.setInteractive();
    const text = [
      "HOW TO PLAY",
      "",
      "• Move with WASD or arrow keys (drag on mobile).",
      "• Your basic attack auto-fires at the nearest void creature.",
      "• Press SPACE / right-click for your active ability.",
      "• Deal damage to fill your ALIGNMENT meter — you'll glow when charged.",
      "• When 2+ charged players use their ability together, nearby,",
      "  the stars connect into a ZODIAC ALIGNMENT super.",
      "• Revive a fallen ally by standing near their Fading Star.",
      "• Survive 10 waves. Every 5th wave is a boss. All down = game over.",
      "",
      "(click anywhere to close)",
    ].join("\n");
    const t = this.add
      .text(width / 2, height / 2, text, {
        fontFamily: FONT,
        fontSize: "20px",
        color: COLORS.text,
        align: "center",
        lineSpacing: 8,
      })
      .setOrigin(0.5);
    overlay.add([bg, t]);
    bg.on("pointerdown", () => overlay.destroy());
  }
}
