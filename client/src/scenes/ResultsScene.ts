import Phaser from "phaser";
import { COLORS, FONT, makeButton, makeStarfield } from "../ui/theme";
import { net } from "../net/NetClient";
import { getZodiac } from "../../../shared/zodiac";
import type { ResultsPayload } from "../net/NetClient";

export class ResultsScene extends Phaser.Scene {
  private offToLobby?: () => void;

  constructor() {
    super("Results");
  }

  create(data: ResultsPayload): void {
    const { width, height } = this.scale;
    makeStarfield(this, width, height);

    const won = data.outcome === "won";
    const banner = this.add
      .text(width / 2, 120, won ? "VICTORY" : "THE STARS FADE", {
        fontFamily: FONT,
        fontSize: "64px",
        color: won ? "#6fe08a" : "#ff6b7d",
      })
      .setOrigin(0.5);
    banner.setShadow(0, 0, won ? "#6fe08a" : "#ff6b7d", 20, true, true);

    this.add
      .text(width / 2, 180, won ? "You survived all 10 waves!" : `You reached wave ${data.wave}`, {
        fontFamily: FONT,
        fontSize: "22px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    // stats table
    this.add
      .text(width / 2, 250, "STARCALLER          DAMAGE     HEALING     REVIVES", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    const sorted = [...data.players].sort((a, b) => b.damageDealt - a.damageDealt);
    sorted.forEach((p, i) => {
      const z = getZodiac(p.zodiac);
      const name = `${z.glyph} ${p.name}`.padEnd(18, " ").slice(0, 18);
      const row = `${name}  ${String(p.damageDealt).padStart(7)}   ${String(p.healingDone).padStart(8)}   ${String(
        p.revives,
      ).padStart(7)}`;
      this.add
        .text(width / 2, 290 + i * 34, row, { fontFamily: "monospace", fontSize: "18px", color: COLORS.text })
        .setOrigin(0.5);
    });

    // actions
    if (net.isHost) {
      makeButton(this, width / 2 - 150, height - 90, "PLAY AGAIN", () => net.returnToLobby(), {
        width: 260,
        color: COLORS.accent,
      });
    } else {
      this.add
        .text(width / 2 - 150, height - 90, "waiting for host…", {
          fontFamily: FONT,
          fontSize: "16px",
          color: COLORS.textDim,
        })
        .setOrigin(0.5);
    }
    makeButton(this, width / 2 + 150, height - 90, "MAIN MENU", () => {
      net.leave();
      this.scene.start("MainMenu");
    }, { width: 260, color: COLORS.panel });

    this.offToLobby = net.onToLobby(() => this.scene.start("Lobby"));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offToLobby?.());
  }
}
