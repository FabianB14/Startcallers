import { Client, Room } from "colyseus.js";
import type { InputState, Snapshot } from "../../../shared/types";

/** Resolve the server endpoints (override with VITE_SERVER_URL). */
function endpoints(): { ws: string; http: string } {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (override) {
    const http = override.replace(/^ws/, "http");
    const ws = override.replace(/^http/, "ws");
    return { ws, http };
  }
  const host = location.hostname || "localhost";
  const wsProto = location.protocol === "https:" ? "wss" : "ws";
  const httpProto = location.protocol === "https:" ? "https" : "http";
  return { ws: `${wsProto}://${host}:2567`, http: `${httpProto}://${host}:2567` };
}

export interface LobbyPlayerView {
  id: string;
  name: string;
  zodiac: string;
  ready: boolean;
  connected: boolean;
}

type SnapHandler = (s: Snapshot) => void;
type ResultsHandler = (r: ResultsPayload) => void;
type SimpleHandler = () => void;

export interface ResultsPayload {
  outcome: "won" | "lost";
  wave: number;
  players: { id: string; name: string; zodiac: string; damageDealt: number; healingDone: number; revives: number }[];
}

/**
 * Thin singleton wrapper over the Colyseus room. Scenes read `sessionId`,
 * lobby roster, and subscribe to snapshots / results.
 */
class NetClient {
  private client: Client;
  private httpBase: string;
  room: Room | null = null;
  playerName = "Star";

  private snapHandlers = new Set<SnapHandler>();
  private resultsHandlers = new Set<ResultsHandler>();
  private matchStartHandlers = new Set<SimpleHandler>();
  private toLobbyHandlers = new Set<SimpleHandler>();

  constructor() {
    const { ws, http } = endpoints();
    this.client = new Client(ws);
    this.httpBase = http;
    const saved = localStorage.getItem("starcallers.name");
    if (saved) this.playerName = saved;
  }

  get sessionId(): string {
    return this.room?.sessionId ?? "";
  }

  setName(name: string): void {
    this.playerName = name.slice(0, 16) || "Star";
    localStorage.setItem("starcallers.name", this.playerName);
    this.room?.send("setName", this.playerName);
  }

  // ---- connection ----

  async host(): Promise<string> {
    this.room = await this.client.create("game", { name: this.playerName });
    this.wire();
    await this.waitForCode();
    return (this.room.state as any).code as string;
  }

  async join(code: string): Promise<void> {
    const res = await fetch(`${this.httpBase}/api/room/${encodeURIComponent(code.toUpperCase())}`);
    if (!res.ok) throw new Error("Room not found");
    const { roomId } = (await res.json()) as { roomId: string };
    this.room = await this.client.joinById(roomId, { name: this.playerName });
    this.wire();
  }

  private waitForCode(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.room && (this.room.state as any).code) resolve();
        else setTimeout(check, 30);
      };
      check();
    });
  }

  private wire(): void {
    if (!this.room) return;
    this.room.onMessage("snap", (s: Snapshot) => this.snapHandlers.forEach((h) => h(s)));
    this.room.onMessage("results", (r: ResultsPayload) => this.resultsHandlers.forEach((h) => h(r)));
    this.room.onMessage("matchStart", () => this.matchStartHandlers.forEach((h) => h()));
    this.room.onMessage("toLobby", () => this.toLobbyHandlers.forEach((h) => h()));
  }

  // ---- lobby helpers ----

  get code(): string {
    return this.room ? ((this.room.state as any).code as string) ?? "" : "";
  }

  get hostId(): string {
    return this.room ? ((this.room.state as any).hostId as string) ?? "" : "";
  }

  get isHost(): boolean {
    return this.sessionId !== "" && this.sessionId === this.hostId;
  }

  get phase(): string {
    return this.room ? ((this.room.state as any).phase as string) ?? "lobby" : "lobby";
  }

  lobbyPlayers(): LobbyPlayerView[] {
    const out: LobbyPlayerView[] = [];
    const players = this.room ? (this.room.state as any).players : null;
    if (players && typeof players.forEach === "function") {
      players.forEach((p: any, key: string) => {
        out.push({
          id: key,
          name: p.name,
          zodiac: p.zodiac,
          ready: p.ready,
          connected: p.connected,
        });
      });
    }
    return out;
  }

  pickZodiac(id: string): void {
    this.room?.send("pickZodiac", id);
  }
  toggleReady(ready?: boolean): void {
    this.room?.send("toggleReady", ready);
  }
  startGame(): void {
    this.room?.send("startGame");
  }
  returnToLobby(): void {
    this.room?.send("returnToLobby");
  }

  // ---- in-game ----

  sendInput(input: InputState): void {
    this.room?.send("input", input);
  }
  useAbility(): void {
    this.room?.send("useAbility");
  }

  // ---- subscriptions ----

  onSnap(h: SnapHandler): () => void {
    this.snapHandlers.add(h);
    return () => this.snapHandlers.delete(h);
  }
  onResults(h: ResultsHandler): () => void {
    this.resultsHandlers.add(h);
    return () => this.resultsHandlers.delete(h);
  }
  onMatchStart(h: SimpleHandler): () => void {
    this.matchStartHandlers.add(h);
    return () => this.matchStartHandlers.delete(h);
  }
  onToLobby(h: SimpleHandler): () => void {
    this.toLobbyHandlers.add(h);
    return () => this.toLobbyHandlers.delete(h);
  }

  leave(): void {
    this.room?.leave();
    this.room = null;
  }
}

export const net = new NetClient();
