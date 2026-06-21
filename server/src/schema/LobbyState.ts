import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Slow-changing room state synced via Colyseus schema (lobby + meta).
 * Fast gameplay state is broadcast separately as "snap" messages each tick.
 */
export class LobbyPlayer extends Schema {
  @type("string") id = "";
  @type("string") name = "Star";
  @type("string") zodiac = "aries";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
}

export class LobbyState extends Schema {
  @type("string") code = "";
  @type("string") phase = "lobby"; // lobby | playing | won | lost
  @type("string") hostId = "";
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
}
