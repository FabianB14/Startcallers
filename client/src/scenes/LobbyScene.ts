import Phaser from "phaser";
import { COLORS, FONT, makeButton, makeStarfield, toast } from "../ui/theme";
import { net } from "../net/NetClient";
import { ELEMENTS, getZodiac } from "../../../shared/zodiac";

export class LobbyScene extends Phaser.Scene {
  private rosterBox!: Phaser.GameObjects.Container;
  private offMatchStart?: () => void;
  private lastSig = "";

  constructor() {
    super("Lobby");
  }

  create(): void {
    const { width, height } = this.scale;
    makeStarfield(this, width, height);

    this.add.text(width / 2, 70, "LOBBY", { fontFamily: FONT, fontSize: "40px", color: COLORS.text }).setOrigin(0.5);

    // Room code panel
    this.add
      .text(width / 2, 130, "ROOM CODE", { fontFamily: FONT, fontSize: "16px", color: COLORS.textDim })
      .setOrigin(0.5);
    const code = this.add
      .text(width / 2, 168, net.code || "----", {
        fontFamily: FONT,
        fontSize: "56px",
        color: "#b9aaff",
        letterSpacing: 10,
      } as any)
      .setOrigin(0.5);
    code.setShadow(0, 0, "#8a7bff", 18, true, true);

    const copyBtn = makeButton(this, width / 2, 224, "📋 Copy Code", () => {
      navigator.clipboard?.writeText(net.code).then(
        () => toast(this, "Copied!", COLORS.good),
        () => toast(this, "Copy failed"),
      );
    }, { width: 200, height: 40, fontSize: 16 });
    copyBtn.setName("copy");

    this.rosterBox = this.add.container(0, 0);

    // bottom actions
    makeButton(this, width / 2 - 170, height - 70, "CHOOSE ZODIAC", () => {
      this.scene.launch("ZodiacSelect");
      this.scene.bringToTop("ZodiacSelect");
    }, { width: 260 });

    makeButton(this, width / 2 + 110, height - 70, "LEAVE", () => {
      net.leave();
      this.scene.start("MainMenu");
    }, { width: 160, color: COLORS.panel });

    this.offMatchStart = net.onMatchStart(() => {
      this.scene.start("Game");
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offMatchStart?.();
    });
  }

  update(): void {
    // While the ZodiacSelect overlay is open, suspend Lobby input so clicks
    // don't bleed through to the buttons underneath it.
    this.input.enabled = !this.scene.isActive("ZodiacSelect");
    this.renderRoster();
    // If a host elsewhere started, or phase moved on, react.
    if (net.phase === "playing") this.scene.start("Game");
  }

  private renderRoster(): void {
    const { width } = this.scale;
    const players = net.lobbyPlayers();
    // only rebuild when something visible changed (avoids churning buttons each frame)
    const sig = JSON.stringify({
      p: players.map((p) => [p.id, p.name, p.zodiac, p.ready, p.connected]),
      host: net.isHost,
      me: net.sessionId,
      hostId: net.hostId,
    });
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.rosterBox.removeAll(true);
    const top = 280;
    const rowH = 64;

    players.forEach((p, i) => {
      const y = top + i * rowH;
      const z = getZodiac(p.zodiac);
      const el = ELEMENTS[z.element];
      const panel = this.add.rectangle(width / 2, y, 560, 54, COLORS.panel, 0.9).setStrokeStyle(2, el.color, 0.8);
      const glyph = this.add
        .text(width / 2 - 250, y, z.glyph, { fontFamily: FONT, fontSize: "30px", color: "#fff" })
        .setOrigin(0.5);
      glyph.setTint(el.color);
      const nameTxt = `${p.name}${p.id === net.sessionId ? "  (you)" : ""}${p.id === net.hostId ? "  ★host" : ""}`;
      const name = this.add
        .text(width / 2 - 215, y - 10, nameTxt, { fontFamily: FONT, fontSize: "20px", color: COLORS.text })
        .setOrigin(0, 0.5);
      const sub = this.add
        .text(width / 2 - 215, y + 12, `${z.name} · ${el.label}`, {
          fontFamily: FONT,
          fontSize: "14px",
          color: COLORS.textDim,
        })
        .setOrigin(0, 0.5);
      const status = this.add
        .text(width / 2 + 250, y, p.ready ? "READY" : "…", {
          fontFamily: FONT,
          fontSize: "18px",
          color: p.ready ? "#6fe08a" : "#9aa0d0",
        })
        .setOrigin(1, 0.5);
      this.rosterBox.add([panel, glyph, name, sub, status]);
    });

    // Ready toggle + Start (host)
    const me = players.find((p) => p.id === net.sessionId);
    const readyLabel = me?.ready ? "✓ READY (click to undo)" : "READY UP";
    const ry = top + Math.max(players.length, 1) * rowH + 30;
    const readyBtn = makeButton(this, width / 2, ry, readyLabel, () => net.toggleReady(), {
      width: 280,
      color: me?.ready ? COLORS.good : COLORS.panelLight,
    });
    this.rosterBox.add(readyBtn);

    if (net.isHost) {
      const allReady = players.length > 0 && players.every((p) => p.ready || !p.connected);
      const startBtn = makeButton(this, width / 2, ry + 64, allReady ? "START GAME" : "waiting for players…", () => {
        if (allReady) net.startGame();
        else toast(this, "Everyone must be Ready first");
      }, { width: 280, color: allReady ? COLORS.accent : COLORS.panel });
      this.rosterBox.add(startBtn);
    }
  }
}
