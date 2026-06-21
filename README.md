# 🌟 Starcallers

A top-down, online **co-op arena game** where 2–4 players play as Zodiac
**Starcallers** — each with a passive and an active ability — and combine their
powers into shared **Zodiac Alignment** supers. Web-first (Vite + Phaser 3),
backed by an **authoritative Colyseus server**.

> Built from [`STARCALLERS_Build_Spec.md`](./STARCALLERS_Build_Spec.md). This
> repo implements the full build (all phases): multiplayer rooms, the starter-4
> roster, the four enemy types + a boss, wave survival, revives, and the
> Alignment supers.

---

## Architecture

```
starcallers/
├── shared/      Engine-agnostic game data + simulation (pure TypeScript)
│   ├── zodiac.ts      Full 12-sign roster (stats/passives/actives) — tune here
│   ├── enemies.ts     Enemy definitions
│   ├── constants.ts   Arena, tick rate, alignment + revive tuning
│   ├── types.ts       Input + snapshot contracts (client⇄server)
│   └── sim.ts         GameSim: movement, combat, AI, waves, abilities, supers
├── server/      Authoritative Colyseus room
│   └── src/
│       ├── index.ts            HTTP (room-code lookup) + Colyseus server
│       ├── rooms/GameRoom.ts   Lobby, match flow, 20Hz tick → snapshot broadcast
│       ├── schema/LobbyState.ts
│       └── roomCodes.ts        4-letter human-friendly codes ↔ roomId
└── client/      Vite + Phaser 3
    └── src/
        ├── main.ts
        ├── net/NetClient.ts    Colyseus wrapper (host/join, snapshots, lobby)
        ├── scenes/             Boot · MainMenu · Lobby · ZodiacSelect · Game · HUD · Results
        └── ui/theme.ts         Buttons, starfield, toasts
```

**Why this shape:** the server holds the truth. Clients send inputs
(`input`, `useAbility`, lobby messages); the server runs `GameSim` at ~20Hz and
broadcasts render snapshots. The simulation has **no Phaser/Colyseus/DOM
dependencies**, so the same rules can feed a future Unreal port (spec §11).

---

## Running locally

Requires Node 18+ (developed on Node 22).

```bash
# 1. install both packages
npm run install:all

# 2. in one terminal — start the authoritative server (ws + http on :2567)
npm run dev:server

# 3. in another terminal — start the client (Vite on :5173)
npm run dev:client
```

Open <http://localhost:5173>. Click **HOST GAME** to create a room (you'll get a
4-letter code), then on another device/tab click **JOIN GAME** and enter the code.

### Playing on phones (family test)

The client and server both bind to `0.0.0.0`. To let phones on your LAN join,
point the client at your machine's IP for the server connection:

```bash
# client picks this up at build/dev time
VITE_SERVER_URL=ws://<your-lan-ip>:2567 npm run dev:client
```

By default the client connects to the server on the **same hostname**, port
`2567`. For remote testing across networks, expose `:2567` with a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
or ngrok and set `VITE_SERVER_URL` to the tunnel URL.

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrow keys | drag anywhere (virtual joystick) |
| Basic attack | auto-fires at nearest enemy | auto |
| Active ability | **Space** or right-click | **✦** button (bottom-right) |
| Combo super | use your ability while **charged** near another charged ally | same |

---

## What's implemented

- **Multiplayer:** Colyseus rooms, 4-letter codes, join-by-code, lobby with
  ready/start, host controls, reconnection window, room lock on start.
- **Starter-4 roster** with real kits:
  - **Aries** (Fire) — First Strike passive · Charge dash (stun + knockback).
  - **Taurus** (Earth) — Immovable (−15% dmg, no knockback) · Bulwark arc barrier.
  - **Gemini** (Air) — Twin Shadow clone mirrors attacks · Swap with an ally.
  - **Pisces** (Water) — Flow regen aura · Tide Pool healing zone.
- **Enemies:** Drifter (chaser), Wisp (ranged kiter), Brute (tank), and the
  **Devourer boss** (telegraphed AoE + summons) on waves 5 & 10.
- **Wave survival:** escalating spawns scaled by player count; win by clearing
  **wave 10**, lose when the whole team is down.
- **Revives:** stand near a Fading Star for 3s.
- **Zodiac Alignment:** fill the meter → glow → 2+ charged allies combo within
  1.5s & nearby to fire a super. Mixed = **Constellation Nova**; matched
  elements trigger **Meteor / Healing Nova / Fortress / Slipstream**.
- **Full menu flow + HUD:** main menu, lobby, zodiac select, in-world health
  bars/glyphs, party frames, radial ability cooldown, alignment meter, results
  screen with per-player damage/healing/revives.

## Tuning

All balance numbers live in `shared/` — `zodiac.ts` (player kits),
`enemies.ts` (enemy stats), and `constants.ts` (arena, alignment, waves). Edit
in one place; both client and server read from it.

## Deploying

The client and server deploy **separately**: the client is a static site, the
server is a long-running Node process.

### Client → GitHub Pages (automated)

`.github/workflows/deploy-pages.yml` builds the client and publishes it to
GitHub Pages.

1. **Enable Pages:** repo **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
2. **Point at your server:** repo **Settings → Secrets and variables → Actions →
   Variables**, add a variable `VITE_SERVER_URL` with value
   `wss://your-server.example.com`. Because Pages is served over HTTPS, the
   server must be reachable over **`wss://`** (TLS) — a plain `ws://` endpoint
   is blocked as mixed content.
3. **Deploy:** push to `main`, or run the workflow manually from the **Actions**
   tab (`workflow_dispatch`) to deploy any branch.

The workflow sets the Vite `base` path to `/<repo>/` automatically, so the site
works at `https://<user>.github.io/<repo>/`. Without `VITE_SERVER_URL` the site
still loads (menus/how-to-play), but hosting/joining a game can't connect.

> GitHub Pages can only host the static client — it cannot run the Colyseus
> server.

### Server → Render (automated via `render.yaml`)

A [Render Blueprint](./render.yaml) is included, so the server is one apply:

1. On **render.com → New → Blueprint**, connect this repo and **Apply**.
   Render reads `render.yaml` and creates a `starcallers-server` web service
   (rootDir `server/`, build `npm install`, start `npm start`, health check
   `/health`).
2. When it's live you'll get a URL like
   `https://starcallers-server.onrender.com`.
3. Put its **`wss://`** form into the client's `VITE_SERVER_URL` Pages variable:
   `wss://starcallers-server.onrender.com`, then re-run the Pages workflow.

Render provides `PORT`, WebSockets, and TLS automatically. The **free plan
sleeps after ~15 min idle** and cold-starts on the next request (first
connection takes a few seconds) — fine for family games; use a paid plan for
always-on. Any other Node host (Railway/Fly) works too with the same
build/start commands.

(For a quick test without deploying the server, run it locally and expose
`:2567` with a Cloudflare Tunnel — see "Playing on phones" above.)

## Next steps (post-v1)

- Expand to the full 12-sign roster (metadata already present in `zodiac.ts`).
- Per-element super polish, audio, richer particles/bloom.
