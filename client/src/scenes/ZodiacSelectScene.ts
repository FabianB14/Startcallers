import Phaser from "phaser";
import { COLORS, FONT, makeButton, toast } from "../ui/theme";
import { net } from "../net/NetClient";
import { ELEMENTS, ROSTER_ORDER, getZodiac, type Element } from "../../../shared/zodiac";

const ELEMENT_ROWS: Element[] = ["fire", "earth", "air", "water"];

export class ZodiacSelectScene extends Phaser.Scene {
  private selected = "aries";
  private detailBox!: Phaser.GameObjects.Container;
  private cells = new Map<string, Phaser.GameObjects.Rectangle>();

  constructor() {
    super("ZodiacSelect");
  }

  create(): void {
    const { width, height } = this.scale;
    this.selected = net.lobbyPlayers().find((p) => p.id === net.sessionId)?.zodiac ?? "aries";

    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x05060f, 0.95).setInteractive();
    bg.setDepth(0);

    this.add
      .text(width / 2, 56, "CHOOSE YOUR STARCALLER", { fontFamily: FONT, fontSize: "34px", color: COLORS.text })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 92, "Starter four are unlocked. More signs coming soon.", {
        fontFamily: FONT,
        fontSize: "16px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    // Grid: 4 element rows x 3 signs
    const startX = 120;
    const colW = 220;
    const startY = 150;
    const rowH = 96;
    ELEMENT_ROWS.forEach((el, row) => {
      const info = ELEMENTS[el];
      this.add
        .text(60, startY + row * rowH + 30, `${info.glyph}`, { fontFamily: FONT, fontSize: "26px" })
        .setOrigin(0.5);
      const signs = ROSTER_ORDER.filter((id) => getZodiac(id).element === el);
      signs.forEach((id, col) => {
        const z = getZodiac(id);
        const x = startX + col * colW + 80;
        const y = startY + row * rowH + 30;
        const locked = !z.implemented;
        const cell = this.add
          .rectangle(x, y, colW - 16, rowH - 18, locked ? 0x0c0f20 : COLORS.panel, 1)
          .setStrokeStyle(2, info.color, locked ? 0.25 : 0.9);
        cell.setInteractive({ useHandCursor: true });
        this.cells.set(id, cell);

        const glyph = this.add
          .text(x - 70, y, z.glyph, { fontFamily: FONT, fontSize: "28px" })
          .setOrigin(0.5);
        glyph.setTint(info.color).setAlpha(locked ? 0.4 : 1);
        this.add
          .text(x - 44, y - 12, z.name, {
            fontFamily: FONT,
            fontSize: "18px",
            color: locked ? "#5a608a" : COLORS.text,
          })
          .setOrigin(0, 0.5);
        this.add
          .text(x - 44, y + 12, locked ? "coming soon" : z.archetype, {
            fontFamily: FONT,
            fontSize: "13px",
            color: COLORS.textDim,
          })
          .setOrigin(0, 0.5);

        cell.on("pointerdown", () => {
          if (locked) {
            toast(this, `${z.name} is coming soon`);
            return;
          }
          this.select(id);
        });
      });
    });

    this.detailBox = this.add.container(width / 2, height - 200);
    this.select(this.selected);

    makeButton(this, width / 2 - 130, height - 56, "CONFIRM & READY", () => {
      net.pickZodiac(this.selected);
      net.toggleReady(true);
      this.scene.stop();
    }, { width: 300, color: COLORS.accent });
    makeButton(this, width / 2 + 150, height - 56, "CANCEL", () => this.scene.stop(), {
      width: 160,
      color: COLORS.panel,
    });
  }

  private select(id: string): void {
    this.selected = id;
    for (const [cid, cell] of this.cells) {
      const el = getZodiac(cid).element;
      cell.setStrokeStyle(cid === id ? 4 : 2, ELEMENTS[el].color, getZodiac(cid).implemented ? 0.9 : 0.25);
    }
    this.renderDetail(id);
  }

  private renderDetail(id: string): void {
    this.detailBox.removeAll(true);
    const z = getZodiac(id);
    const el = ELEMENTS[z.element];
    const { width } = this.scale;
    const panel = this.add.rectangle(0, 0, width - 160, 150, COLORS.panel, 0.95).setStrokeStyle(2, el.color, 0.9);
    const stats = z.stats ? `HP ${z.stats.hp} · Speed ${z.stats.speed} · ${z.stats.basicAttack.description}` : "";
    const lines = [
      `${z.glyph}  ${z.name} — ${el.label} (${el.identity})`,
      stats,
      `Passive — ${z.passive.name}: ${z.passive.description}`,
      `Active — ${z.active.name} (${z.active.cooldown}s): ${z.active.description}`,
    ].filter(Boolean);
    const t = this.add
      .text(0, 0, lines.join("\n"), {
        fontFamily: FONT,
        fontSize: "17px",
        color: COLORS.text,
        align: "center",
        lineSpacing: 7,
        wordWrap: { width: width - 200 },
      })
      .setOrigin(0.5);
    this.detailBox.add([panel, t]);
  }
}
