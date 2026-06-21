# STARCALLERS — Full Build Spec
*Working title. A top-down, online co-op arena game where 2–4 players play as Zodiac "Starcallers," each with a passive and an active ability, and combine their powers into shared "Zodiac Alignment" supers.*

**Audience for this doc:** a code AI (Cursor / Claude Code / similar) building the game as a web app first, with a possible Unreal Engine port later.

---

## 1. The Pitch

You and your friends are **Starcallers** — channelers of the night sky. Each player picks a Zodiac sign that grants a **passive** (always on) and an **active** (cooldown ability). You drop into a dark cosmic arena and survive escalating waves of void creatures. The hook: when two or more players charge up and fire their abilities together, their stars connect into a **constellation** and unleash a massive shared super.

- **Players:** 1–4 (designed for co-op; solo is allowed)
- **Session length:** 5–15 min per run
- **Tone:** cosmic / mystical, not scary — bright glowing stars against deep space
- **Platform:** Web first (desktop + mobile browser). UE port later.

---

## 2. Recommended Tech Stack

Chosen to be **simple, well-documented, and AI-codegen friendly** — these have huge amounts of public examples so the AI will write them well.

| Layer | Choice | Why |
|---|---|---|
| Build tool | **Vite** + TypeScript | Fast, standard, AI knows it cold |
| Rendering / game engine | **Phaser 3** | 2D top-down engine with built-in scenes (perfect for menus), sprites, input, physics |
| Multiplayer | **Colyseus** | Authoritative room server with built-in room codes, state sync, and reconnection — maps 1:1 to what we need |
| Hosting (testing) | Run the Colyseus server locally + a **Cloudflare Tunnel** (or ngrok) so family can join from their phones | Free, no deploy needed to test |
| Hosting (live) | **Render** or **Railway** free tier for the server; **Netlify/Vercel** for the client | Cheap, generous free tiers |

> **Why authoritative server (Colyseus) instead of peer-to-peer:** the server holds the "truth" (positions, health, enemies). Clients send inputs, server resolves everything and broadcasts state. This prevents cheating, avoids host-migration headaches, and keeps everyone in sync. It's also less code than rolling your own P2P.

---

## 3. Top-Down Visual Design

### Camera & arena
- **Camera:** fixed top-down, looking straight down. Slight zoom so players see a good chunk of the arena (~15×10 tiles visible).
- **Arena shape:** a single bounded space — start with a **circle or rounded square** ringed by a glowing barrier. Enemies spawn from the dark edges.
- **Tile size:** 48×48 px logical units.

### Art direction
- **Background:** deep navy/black space with a subtle parallax starfield and faint nebula clouds.
- **Floor:** dark translucent "astral platform" with a faint grid or constellation lines etched in.
- **Players:** small glowing avatars (~40px) colored by their **element**:
  - 🔥 Fire = warm orange/red glow
  - 🪨 Earth = green/amber glow
  - 💨 Air = cyan/white glow
  - 💧 Water = blue/teal glow
  - Each has a floating **zodiac glyph** above them.
- **Enemies:** shadowy "void" creatures with glowing eyes — simple silhouettes so they're cheap to make and read instantly against the bright players.
- **Projectiles / abilities:** bright particle trails. Lean into glow/bloom; it makes simple art look premium.
- **Constellation effect:** when an Alignment triggers, draw animated **lines connecting the participating players** like a constellation, then a big burst.

> Art tip: a glow/bloom post-process + particles does 80% of the "looks cool" work. You can ship with simple circle/triangle shapes and still look great.

---

## 4. The Roster

Full 12-sign roster grouped by element. **Build the starter 4 first** (one per element), then expand.

**Element identity:** 🔥 Fire = burst damage · 🪨 Earth = defense/control · 💨 Air = mobility/utility · 💧 Water = healing/support

### 🔥 Fire
- **Aries (Ram)** — *Passive:* first hit on a fresh enemy deals bonus damage. *Active:* Charge — dash in a line, knock back + stun.
- **Leo (Lion)** — *Passive:* nearby allies deal more damage. *Active:* Roar — radiant blast that staggers nearby enemies.
- **Sagittarius (Archer)** — *Passive:* longest range, piercing shots. *Active:* Star Arrow — long piercing shot that *marks* enemies for bonus ally damage.

### 🪨 Earth
- **Taurus (Bull)** — *Passive:* extra HP, immune to knockback. *Active:* Bulwark — plant a barrier that blocks enemy attacks.
- **Virgo (Maiden)** — *Passive:* speeds up Alignment charge for the team. *Active:* Harvest — refund an ally's cooldown.
- **Capricorn (Sea-Goat)** — *Passive:* immune to slow/stun. *Active:* Pillar — raise a wall + high-ground bonus.

### 💨 Air
- **Gemini (Twins)** — *Passive:* shadow twin mirrors basic attacks. *Active:* Swap — trade places with an ally to rescue them.
- **Libra (Scales)** — *Passive:* shares HP to even out a low ally. *Active:* Equilibrium — team damage is split evenly for a few seconds.
- **Aquarius (Water-Bearer)** — *Passive:* trail speeds up allies. *Active:* Deluge — wave that pushes + slows enemies.

### 💧 Water
- **Cancer (Crab)** — *Passive:* regenerating armor shell. *Active:* Shell — bubble shield on an ally.
- **Scorpio (Scorpion)** — *Passive:* attacks stack poison. *Active:* Sting — nuke that detonates all poison stacks.
- **Pisces (Fish)** — *Passive:* you + nearby allies regen HP. *Active:* Tide Pool — healing + cleanse zone.

### Starter 4 — exact values to implement first
Base player HP = 100, base move speed = 200 px/s unless overridden.

| Sign | Element | HP | Speed | Basic Attack | Passive | Active (cooldown) |
|---|---|---|---|---|---|---|
| **Aries** | Fire | 90 | 220 | Short slash, 15 dmg, fast | **First Strike:** +50% dmg on first hit vs an enemy not hit by you in 3s | **Charge** (8s): dash ~4 tiles, 30 dmg + 0.75s stun + knockback to enemies in path |
| **Taurus** | Earth | 160 | 150 | Ground slam, 12 dmg, small AoE | **Immovable:** no knockback; takes 15% less damage | **Bulwark** (12s): arc barrier in front for 5s, blocks enemy contact/projectiles |
| **Gemini** | Air | 100 | 240 | Twin bolts, 8 dmg each (2 shots) | **Twin Shadow:** a clone mirrors your basic attacks | **Swap** (10s): swap places with targeted ally; if none, short blink |
| **Pisces** | Water | 110 | 200 | Water orb, 6 dmg + brief slow | **Flow:** you + allies in range regen 2 HP/s | **Tide Pool** (14s): zone for 6s, heals 8 HP/s + cleanses debuffs |

> These numbers are starting points — tune during family playtests.

---

## 5. Core Mechanics — How It All Fits Together

### Movement
- **Desktop:** WASD / arrow keys to move.
- **Mobile:** on-screen left virtual joystick to move.
- Top-down, 8-directional or free-angle movement.

### Aiming & basic attack
- **Auto-aim by default** (targets nearest enemy) — keeps it family-friendly and mobile-friendly.
- **Optional manual aim:** mouse direction on desktop, right virtual joystick on mobile (twin-stick).
- Basic attack auto-fires on a short cooldown, or on tap/click. Keep it auto-firing for accessibility.

### Active ability
- One button: **Spacebar / Right-click** on desktop, a big **ability button** on mobile.
- Shows a **radial cooldown** on the HUD.

### Passive
- Always on, no input. Each is a persistent modifier applied on the server.

### Zodiac Alignment (the signature co-op super)
This is the "align the stars together" payoff.

1. Every player has an **Alignment Meter** that fills by dealing damage, surviving, and using abilities. (Virgo's passive fills it faster for the team.)
2. When full, the player **glows** ("charged").
3. If **2+ charged players activate their ability within a 1.5s window while near each other**, a **Zodiac Alignment** fires:
   - Constellation lines draw between the participating players.
   - A large shared effect triggers and consumes their meters.
4. **v1 (simple):** any 2+ charged actives = a **Constellation Nova** — big AoE damage + small team heal centered between players.
5. **v2 (expansion):** element-specific supers:
   - 2× Fire → **Meteor** (huge single-target/area burst)
   - 2× Water → **Healing Nova** (full team heal + shields)
   - 2× Earth → **Fortress** (temporary invulnerable zone)
   - 2× Air → **Slipstream** (team speed + dodge buff)
   - Mixed → generic Constellation Nova

### Combat resource
- Keep it lean: **no mana**. Basic attacks are free/auto; actives use cooldowns; Alignment uses the meter. That's the whole economy.

### Downed & revive
- At 0 HP a player becomes a **Fading Star** (downed, can't act) for a short window.
- An ally **revives** by standing near them for 3s.
- If **all players are down at once → game over.**

### Win / lose
- **Mode: Wave Survival.** Enemies spawn in escalating waves from the arena edges.
- Every **5th wave = a Boss**.
- **Lose:** whole team downed.
- **Win condition (v1):** survive to and defeat the **Wave 10 boss**. Endless mode can come later.

### Enemies (start with 4)
| Enemy | Behavior | HP | Damage |
|---|---|---|---|
| **Drifter** | Slow melee chaser | 20 | 8 on contact |
| **Wisp** | Ranged, keeps distance | 12 | 6 projectile |
| **Brute** | Tanky, hard-hitting melee | 80 | 18 slam |
| **Boss (Devourer)** | Big, telegraphed AoE attacks + summons | 600 | 25–40 |

Spawn rate and counts scale up each wave.

---

## 6. HUD & Player Frames

### In-world (above each character)
- Floating **zodiac glyph** + a thin **health bar**.
- **Name tag** for teammates.
- A glow ring when **charged** (Alignment ready).

### Personal HUD (your own, bottom of screen)
- **Health** (large bar).
- **Ability icon** with radial cooldown.
- **Alignment meter** (fills up; glows when full).
- **Wave counter** + enemies remaining (top center).
- Mobile: virtual joystick(s) + ability button overlaid.

### Party frames (the teammate UI — top-left stack)
For each other player, a compact frame:
- Zodiac portrait/glyph + element color.
- Player name.
- Mini health bar.
- Small ability-cooldown indicator.
- A "charged" highlight when their Alignment is ready (so you know who can combo with you).
- A **"DOWN — revive!"** flash when they're a Fading Star.

### Optional
- Small **minimap** or off-screen enemy arrows for awareness.

---

## 7. Menus & Screen Flow

Use Phaser **Scenes** for each screen. Flow:

```
Boot/Loading
   ↓
Main Menu ──► Settings
   │       └► How to Play
   ├──► Host Game ──► Lobby (host)
   └──► Join Game ──► (enter room code) ──► Lobby (guest)
                                   ↓
                          Zodiac Select / Ready
                                   ↓
                              In-Game Arena ──► Pause
                                   ↓
                             Results Screen ──► back to Lobby/Menu
```

### Main Menu
- Title art + animated starfield.
- Buttons: **Play (Host)**, **Join**, **Settings**, **How to Play**.
- Player name field (saved locally).

### Host Game
- Creates a Colyseus room, displays a **4–6 char ROOM CODE** prominently.
- Shows a "Share this code" + copy button.
- Drops host into the **Lobby**.

### Join Game
- Input box for the **room code**.
- "Join" connects to that room; error toast if invalid/full.

### Lobby
- Shows all connected players (up to 4) with their chosen zodiac + ready state.
- Each player opens the **Zodiac Select**.
- **Host** has a **Start** button (enabled when all are Ready).
- Settings for the match: difficulty, friendly fire off (default), starter-only roster toggle.

### Zodiac Select
- A **wheel/grid of the 12 signs**, grouped by element (color-coded).
- Hover/tap a sign → shows **name, element, passive, active** with icons and short text.
- Starter 4 unlocked first; others can be locked or flagged "coming soon" in v1.
- Confirm → marks you **Ready**.
- Two players *can* pick the same sign (or block duplicates — your call; allow it for family fun).

### Settings
- Master / SFX / Music volume sliders.
- Control scheme: Auto-aim vs Manual-aim toggle.
- Input hint: desktop vs mobile auto-detected.
- Player name.

### Pause (in-game)
- Resume, Settings, Leave (returns to menu / leaves room).
- In multiplayer, pause is local UI only — the game keeps running on the server (so one person pausing doesn't freeze others). Show a "menu open" indicator instead.

### Results Screen
- Win/Lose banner, waves cleared, damage/healing done per player, revives.
- Buttons: **Play Again** (back to lobby) / **Main Menu**.

---

## 8. Multiplayer Architecture (Colyseus)

### Rooms
- One **GameRoom** = one match. `roomId` doubles as / maps to the shareable room code.
- Max 4 clients. Late joiners go to lobby; if a match is in progress, they spectate or queue for next run (v1: lock the room once started).

### Server holds the truth (authoritative state)
The room's synced **state schema** includes:
- `players`: id, name, zodiac, x, y, hp, maxHp, abilityCooldown, alignmentMeter, isDowned, isCharged
- `enemies`: id, type, x, y, hp
- `projectiles`: id, owner, x, y, vx, vy, damage
- `wave`: number, enemiesRemaining, phase (lobby / playing / boss / won / lost)

### Clients send inputs only
Message types (client → server):
- `setName`, `pickZodiac`, `toggleReady`
- `startGame` (host only)
- `input` — movement vector + aim direction (sent every tick)
- `useAbility`
- `revive` (or handled automatically by proximity)

### Server → clients
- Continuous **state sync** (Colyseus does this efficiently via schema diffs).
- Events: `alignmentTriggered`, `waveStart`, `playerDowned`, `gameOver`, `victory`.

### Game loop
- Server runs a fixed tick (e.g., **20–30 Hz**): apply inputs, move enemies (simple AI: chase nearest player / kite), resolve attacks & collisions, update cooldowns/meters, spawn waves.
- Clients **render** the state and can do light **interpolation/prediction** on their own avatar for responsiveness.

### Room codes
- Generate a short human-friendly code (e.g., 4 uppercase letters, avoid ambiguous chars like O/0).
- Map code → roomId server-side, or use Colyseus's built-in room listing/join-by-id.

> Because this is wave-survival co-op (not twitchy PvP), small latency is fine. Don't over-engineer netcode for v1.

---

## 9. Suggested Project Structure

```
starcallers/
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   ├── scenes/
│   │   │   ├── BootScene.ts
│   │   │   ├── MainMenuScene.ts
│   │   │   ├── LobbyScene.ts
│   │   │   ├── ZodiacSelectScene.ts
│   │   │   ├── GameScene.ts
│   │   │   ├── HUDScene.ts        (runs in parallel over GameScene)
│   │   │   └── ResultsScene.ts
│   │   ├── net/ColyseusClient.ts
│   │   ├── entities/ (Player, Enemy, Projectile render objects)
│   │   ├── data/zodiac.ts          (roster definitions: passives, actives, stats)
│   │   └── ui/ (buttons, sliders, party frames)
│   └── vite.config.ts
├── server/
│   ├── index.ts
│   ├── rooms/GameRoom.ts
│   ├── schema/ (GameState, PlayerState, EnemyState…)
│   ├── systems/ (movement, combat, waves, abilities, alignment)
│   └── data/zodiac.ts              (shared with client where possible)
└── README.md
```

Keep zodiac stats/abilities in a **single data file** so balancing is one place to edit.

---

## 10. Build Phases (so you can test with family EARLY)

**Phase 1 — Single-player core (no network yet)**
- Vite + Phaser project, BootScene + GameScene.
- One arena, WASD movement, top-down camera.
- Aries only: basic attack + Charge active + First Strike passive.
- Dummy Drifter enemies that chase and die. Health, downed, game over.
- ✅ Playable solo. Test the *feel*.

**Phase 2 — Multiplayer skeleton**
- Stand up Colyseus server + GameRoom.
- Main Menu → Host (shows room code) / Join (enter code) → Lobby.
- Two clients move around the same arena in sync.
- ✅ First family test: everyone runs around together.

**Phase 3 — Full starter roster + combat**
- Add Taurus, Gemini, Pisces with their passives/actives.
- Zodiac Select screen + party frames HUD.
- Wisp + Brute enemies, wave spawning, revive.

**Phase 4 — Alignment supers + boss**
- Alignment meter + charged state + Constellation Nova (v1 combo).
- Wave 10 Boss + victory screen.
- ✅ Big family test: comboing supers together.

**Phase 5 — Polish & mobile**
- Settings, audio, virtual joysticks for mobile, glow/particles, results stats.
- Expand toward the full 12-sign roster + element-specific supers.

---

## 11. UE Port Notes (later)
- The whole design is **engine-agnostic by intent**: top-down, room-based, authoritative server, data-driven roster.
- In UE: top-down template + Enhanced Input; the Colyseus concepts map to UE replication (server-authoritative, replicated actors). Keep the **zodiac data and combat rules in a data table** so you can reuse the balance numbers.
- Don't port until the web version is fun — prove the loop first.

---

## 12. Starter Prompt for Your Code AI

Paste this to kick off the build (point the AI at this spec file too):

> Build **Phase 1** of a top-down co-op web game called **Starcallers**, per the attached build spec. Use **Vite + TypeScript + Phaser 3**. Create a single bounded top-down arena with a starfield background. Implement one playable character, **Aries** (HP 90, move speed 220, short-range slash basic attack auto-targeting the nearest enemy for 15 damage). Implement Aries's passive **First Strike** (+50% damage on the first hit to an enemy not hit by the player in the last 3 seconds) and active **Charge** on Spacebar (8s cooldown: dash ~4 tiles in the facing direction dealing 30 damage + 0.75s stun + knockback to enemies in the path, shown with a radial cooldown on the HUD). Add basic **Drifter** enemies (HP 20, 8 contact damage) that spawn at the edges and chase the player. Include a player health bar, a downed state at 0 HP, and a game-over screen with a restart button. Movement is WASD. Keep all character stats and abilities in a single `data/zodiac.ts` file so they're easy to tune. Structure the project with separate Phaser Scenes (Boot, Game, HUD) so we can add menus and multiplayer in later phases. Make it run with `npm run dev`.

After Phase 1 feels good, ask the AI to proceed to **Phase 2 (Colyseus multiplayer + room codes)**, then 3, 4, 5 in order.

---

*Build the loop, test with family, tune the numbers, then expand the roster. Have fun. 🌟*
