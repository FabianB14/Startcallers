import Phaser from "phaser";
import { WORLD_W, WORLD_H } from "../../shared/constants";
import { BootScene } from "./scenes/BootScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { ZodiacSelectScene } from "./scenes/ZodiacSelectScene";
import { GameScene } from "./scenes/GameScene";
import { HUDScene } from "./scenes/HUDScene";
import { ResultsScene } from "./scenes/ResultsScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: WORLD_W,
  height: WORLD_H,
  parent: "game",
  backgroundColor: "#05060f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, roundPixels: false },
  scene: [
    BootScene,
    MainMenuScene,
    LobbyScene,
    ZodiacSelectScene,
    GameScene,
    HUDScene,
    ResultsScene,
  ],
};

new Phaser.Game(config);
