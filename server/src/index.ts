import http from "http";
import express from "express";
import cors from "cors";
import colyseus from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
const { Server } = colyseus;
import { GameRoom } from "./rooms/GameRoom";
import { lookupRoom } from "./roomCodes";

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

// Resolve a short room code -> Colyseus roomId so clients can join by code.
app.get("/api/room/:code", (req, res) => {
  const roomId = lookupRoom(req.params.code);
  if (!roomId) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ roomId });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define("game", GameRoom);

gameServer.listen(PORT).then(() => {
  console.log(`⭐ Starcallers server listening on :${PORT}`);
});
