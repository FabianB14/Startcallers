import colyseus, { type Client } from "colyseus";
const { Room } = colyseus;
import { GameSim } from "../../../shared/sim";
import { MAX_PLAYERS, TICK_MS } from "../../../shared/constants";
import { getZodiac, STARTER_FOUR } from "../../../shared/zodiac";
import type { InputState } from "../../../shared/types";
import { LobbyPlayer, LobbyState } from "../schema/LobbyState";
import { generateCode, registerCode, releaseCode } from "../roomCodes";

export class GameRoom extends Room<LobbyState> {
  maxClients = MAX_PLAYERS;

  private sim = new GameSim();
  private serverTime = 0;
  private lastResultsSent = false;

  onCreate(): void {
    const state = new LobbyState();
    state.code = generateCode();
    this.setState(state);
    registerCode(state.code, this.roomId);

    this.onMessage("setName", (client, name: string) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof name === "string") p.name = name.slice(0, 16) || "Star";
    });

    this.onMessage("pickZodiac", (client, zodiac: string) => {
      if (this.state.phase !== "lobby") return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      // Phase: only starter four are selectable.
      if (!STARTER_FOUR.includes(zodiac)) return;
      try {
        getZodiac(zodiac);
        p.zodiac = zodiac;
      } catch {
        /* ignore unknown */
      }
    });

    this.onMessage("toggleReady", (client, ready?: boolean) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.ready = ready ?? !p.ready;
    });

    this.onMessage("startGame", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      this.beginMatch();
    });

    this.onMessage("input", (client, input: InputState) => {
      this.sim.setInput(client.sessionId, input);
    });

    this.onMessage("useAbility", (client) => {
      this.sim.useAbility(client.sessionId);
    });

    this.onMessage("returnToLobby", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      this.resetToLobby();
    });

    // Fixed-tick authoritative loop (~20Hz per spec §8).
    this.setSimulationInterval((deltaMs) => this.tick(deltaMs), TICK_MS);
  }

  onJoin(client: Client, options: { name?: string } = {}): void {
    // Lock the room once a match is in progress (v1: spec §8).
    const p = new LobbyPlayer();
    p.id = client.sessionId;
    p.name = (options.name || "Star").slice(0, 16);
    p.zodiac = "aries";
    p.ready = false;
    p.connected = true;
    this.state.players.set(client.sessionId, p);

    if (!this.state.hostId) this.state.hostId = client.sessionId;
    if (this.state.players.size >= MAX_PLAYERS) this.lock();
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    this.sim.setConnected(client.sessionId, false);

    // allow brief reconnection during a live match
    if (this.state.phase === "playing" && !consented) {
      try {
        await this.allowReconnection(client, 20);
        if (p) p.connected = true;
        this.sim.setConnected(client.sessionId, true);
        return;
      } catch {
        /* fell through: treat as gone */
      }
    }

    this.state.players.delete(client.sessionId);
    this.sim.removePlayer(client.sessionId);

    // reassign host if needed
    if (this.state.hostId === client.sessionId) {
      const next = this.state.players.keys().next();
      this.state.hostId = next.done ? "" : next.value;
    }
    if (this.state.players.size < MAX_PLAYERS) this.unlock();
  }

  onDispose(): void {
    releaseCode(this.state.code);
  }

  // ---- Match control ----

  private beginMatch(): void {
    if (this.state.phase !== "lobby") return;
    const players = [...this.state.players.values()];
    if (players.length === 0) return;
    if (!players.every((p) => p.ready || !p.connected)) return;

    // seed sim from lobby roster
    for (const p of players) {
      if (!p.connected) continue;
      this.sim.addPlayer(p.id, p.name, p.zodiac);
    }
    this.sim.start();
    this.state.phase = "playing";
    this.lastResultsSent = false;
    this.lock();
    this.broadcast("matchStart", {});
  }

  private resetToLobby(): void {
    this.sim = new GameSim();
    this.state.phase = "lobby";
    for (const p of this.state.players.values()) p.ready = false;
    this.unlock();
    this.broadcast("toLobby", {});
  }

  private tick(deltaMs: number): void {
    if (this.state.phase !== "playing") return;
    this.serverTime += deltaMs;
    const dt = deltaMs / 1000;
    this.sim.update(dt);

    // broadcast render snapshot
    this.broadcast("snap", this.sim.snapshot(this.serverTime));

    // win / loss transitions
    if (this.sim.phase === "won" || this.sim.phase === "lost") {
      if (!this.lastResultsSent) {
        this.lastResultsSent = true;
        this.state.phase = this.sim.phase;
        this.broadcast("results", {
          outcome: this.sim.phase,
          wave: this.sim.wave,
          players: this.sim.results(),
        });
      }
    }
  }
}
