# Colonist – Implementierungsplan

Eigener Online-Catan-Klon im Stil von colonist.io. Multiplayer über Raum-Code (kein Account). Hosting auf Render.com (kostenlos, ohne Kreditkarte). Alles, was colonist.io hinter „Mitglied werden" versteckt, ist hier gratis freigeschaltet.

---

## Stack

| Layer | Technologie |
|-------|-------------|
| Monorepo | pnpm Workspaces |
| Typen + Regel-Engine | TypeScript, `packages/shared`, tsup (ESM+CJS) |
| Server | Node, **Colyseus 0.15** (CommonJS), tsx |
| Frontend | React 18, Vite, TypeScript, Tailwind, Zustand, SVG |
| Tests | Vitest (nur Engine) |
| Deploy | Render.com Free-Tier (kein Credit Card) |

---

## Repo-Struktur (Ziel)

```
colonist/
├── package.json               # root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── CLAUDE.md
├── PLAN.md
├── packages/
│   └── shared/                # STREAM A
│       ├── src/
│       │   ├── contract.ts    # Engine-API (einzige Import-Oberfläche für B + C)
│       │   ├── protocol.ts    # Netzwerk-Typen (ClientMessage, ServerBroadcast)
│       │   ├── types.ts       # Alle Kern-Typen
│       │   ├── scoring.ts     # computeScores, longestRoad, largestArmy
│       │   ├── index.ts       # re-exportiert contract + protocol
│       │   ├── board/
│       │   │   ├── coords.ts  # hexDisk, cornerKey, edgeKey, tileNeighbours
│       │   │   └── generator.ts # generateBoard, Rote-Zahlen-Balance
│       │   ├── rules/
│       │   │   ├── state.ts   # createInitialState
│       │   │   ├── validate.ts# validate(state, action, playerId)
│       │   │   ├── legal.ts   # legalActions(state, playerId)
│       │   │   ├── reduce.ts  # reduce(state, action, playerId)
│       │   │   └── view.ts    # publicView(state, playerId)
│       │   └── util/
│       │       ├── rng.ts     # SeededRng (Mulberry32)
│       │       └── resources.ts # ResourceMap-Helfer, Baukosten
│       └── tests/
│           ├── board.test.ts
│           ├── scoring.test.ts
│           └── validate.test.ts
├── apps/
│   ├── server/                # STREAM B
│   │   ├── src/
│   │   │   ├── index.ts       # Colyseus-Server, Port aus env
│   │   │   ├── rooms/
│   │   │   │   └── GameRoom.ts# Haupt-Room (Lobby + Spiel)
│   │   │   └── schema/        # Colyseus-Schema (PublicGameState-Abbild)
│   │   └── package.json
│   └── web/                   # STREAM C
│       ├── src/
│       │   ├── board/         # SVG-Hex-Board + Koordinaten-Rendering
│       │   ├── lobby/         # Lobby-Screen, Raum-Code-Eingabe
│       │   ├── game/          # Game-Screen, Panels, Dialoge
│       │   ├── builder/       # Map-Builder
│       │   ├── net/
│       │   │   ├── mockRoom.ts# Offline-Engine ohne Server (Entwicklung)
│       │   │   └── client.ts  # echter colyseus.js-Adapter
│       │   └── store/         # Zustand-Stores
│       └── package.json
```

---

## Schnittstellen-Vertrag (fixiert)

Alle drei Ströme importieren **ausschließlich** aus `@colonist/shared` (nie aus internen Pfaden).

### Engine-API (`contract.ts`)

```ts
createInitialState(config: GameConfig, playerNames: string[], seed: string): GameState
generateBoard(def: BoardDefinition | 'random', size: BoardSize, seed: string): Board
legalActions(state: GameState, playerId: string): Action[]
validate(state: GameState, action: Action, playerId: string): { ok: true } | { ok: false; reason: string }
reduce(state: GameState, action: Action, playerId: string): { state: GameState; events: GameEvent[] }
computeScores(state: GameState): Record<string, number>
publicView(state: GameState, forPlayerId: string): PublicGameState
```

### Netzwerk-Protokoll (`protocol.ts`)

**Client → Server:**
```ts
{ type: 'action';     action: Action }
{ type: 'chat';       text: string }
{ type: 'lobbyPatch'; patch: Partial<GameConfig> }
{ type: 'ready' | 'unready' | 'start' }
{ type: 'kick';       playerId: string }
{ type: 'uploadMap';  definition: BoardDefinition; name: string }
```

**Server → Client (Broadcasts):**
```ts
{ type: 'event';         event: GameEvent }        // nach jedem reduce()
{ type: 'error';         reason: string }
{ type: 'reconnected';   seat: number }
{ type: 'playerJoined';  playerId, name }
{ type: 'lobbyUpdated';  config: GameConfig }
{ type: 'turnTimer';     remainingMs: number }
```

Room-State (Colyseus Schema, automatisch gepatcht) spiegelt `PublicGameState`.

---

## Datenmodell

### Koordinaten
- **Cube-Koordinaten** `{q, r, s}` mit Invariante `q+r+s=0`
- **CoordKey** = `"q,r,s"` (String-Key für Maps)
- **CornerKey** = 3 sortierte CoordKeys, `|`-getrennt (Vertex, von 3 Tiles geteilt)
- **EdgeKey** = 2 sortierte CoordKeys, `|`-getrennt (Kante, von 2 Tiles geteilt)
- Kanonische Sortierung → gleiche Ecke/Kante hat immer denselben Key, egal von welchem Tile aus

### Board
```ts
Board {
  tiles: Map<CoordKey, Tile>   // inkl. Meer-Tiles am Rand
  ports: Port[]                // Häfen mit corner-Paar für Bau-Prüfung
  corners: Set<CornerKey>      // alle gültigen Siedlungs-Positionen
  edges: Set<EdgeKey>          // alle gültigen Straßen-Positionen
}
```

### GameState (vereinfacht)
```ts
GameState {
  phase: GamePhase             // lobby|setup|roll|discard|moveRobber|steal|main|tradeOffer|ended
  players: Player[]            // Ressourcen, Karten, Bauten, VP
  activePlayerIndex: number
  board: Board
  devCardDeck: DevCardType[]   // verbleibender Stapel
  activeTradeOffer?: TradeOffer
  pendingDiscards: Record<string, number>  // wer muss noch wegwerfen (nach 7)
  diceRoll?: [number, number]
  winner?: string
  seq: number                  // monotoner Zähler (optimistisches UI)
}
```

### GamePhase-Übergänge
```
lobby
  └─ start → setup
setup (Schlangenreihenfolge: 0→n-1 → n-1→0)
  └─ alle platziert → roll
roll
  ├─ Würfel ≠ 7 → main
  └─ Würfel = 7
       ├─ Spieler > discardLimit → discard → moveRobber → steal? → main
       └─ niemand muss wegwerfen → moveRobber → steal? → main
main
  ├─ Handel → tradeOffer ↔ main
  └─ endTurn → roll (nächster Spieler) | ended (Sieger)
```

---

## Parallele Arbeitsströme

Das Projekt wird von **drei LLMs gleichzeitig** bearbeitet. Jeder Strom besitzt exklusiv sein Verzeichnis — keine Merge-Konflikte.

| Strom | Branch | Darf NICHT anfassen |
|-------|--------|---------------------|
| A – Engine | `stream/engine` | `apps/` |
| B – Server | `stream/server` | `packages/`, `apps/web/` |
| C – Web | `stream/web` | `packages/`, `apps/server/` |

**Entkopplung über Stubs:**
- B benutzt `reduce`-Stub bis A fertig ist (State unverändert + Dummy-Event)
- C benutzt `mockRoom.ts` (Engine direkt im Browser, kein Server) bis B fertig ist

**Git-Rhythmus:**
1. A pusht zuerst `contract.ts` + `protocol.ts` → B und C starten parallel
2. Ströme mergen lauffähige Teilstücke früh nach `main`
3. Vertragsänderung = eigener Mini-PR auf `stream/engine`, den alle anderen ziehen

---

## Aufgaben-Boards

### Stream A — Engine ✅ fertig

- [x] **A0** Root-Gerüst: pnpm-Workspaces, tsconfig.base.json, `packages/shared` mit tsup + Vitest. `contract.ts` + `protocol.ts` gepusht.
- [x] **A1** Koordinaten: `hexDisk()` (direkter Cube-Algorithmus), `cornerKey`, `edgeKey`, `tileNeighbours`
- [x] **A2** Board-Generator: Zufallsboard, Rote-Zahlen-Balance (6/8 Backtracking max. 2, keine Nachbarn), Häfen, `BoardDefinition`-Support (`'random'`-Felder)
- [x] **A3** Aufbauphase + Zug: Schlangenreihenfolge, Startrohstoffe; Würfeln/Verteilen; 7→Abwurf/Räuber/Klauen; EndTurn
- [x] **A4** Bauen: Straße/Siedlung/Stadt mit Abstands-/Konnektivitäts-/Kostenregeln + Limits (15/5/4)
- [x] **A5** Dev-Karten + Handel + Sonderkarten: Ritter/Straßenbau/Erfindung/Monopol/VP; Bank/Hafen + Spieler-Handel; längste Straße (DFS), größte Rittermacht; Siegprüfung
- [x] **A6** `publicView`, `computeScores`, Vitest-Suiten — 24 Tests grün
- [ ] **A7** *(später)* Seefahrer-Modelle: Schiff-Aktionen, Gold-Tiles, Fog-Tiles, Inseln
- [ ] **A8** *(später)* Städte & Ritter-Modelle: Waren, Stadtausbauten, Ritter-Figuren, Barbaren-Schiff, Fortschrittskarten

### Stream B — Server (`apps/server/`)

- [ ] **B0** Gerüst: Colyseus 0.15 (CJS, kein `"type":"module"`), tsx dev auf :3000, `@colonist/shared` als Dep
- [ ] **B1** Raum-Code-Room: Code-Generierung (z. B. `area2438`), `joinById`, Sitzplätze, Namen, Bereit-Status, Host, Kick
- [ ] **B2** Colyseus-Schema: spiegelt `PublicGameState`; State-Sync; pro-Client-Views via `publicView()`
- [ ] **B3** Action-Loop: `"action"`-Message → `validate()`/`reduce()` autoritativ → State-Update + `"event"`-Broadcast
- [ ] **B4** Lobby-Optionen: `GameConfig`-Patches (Modus, Karte, Regel-Toggles, Slider) für alle Spieler synchronisieren
- [ ] **B5** UX-Komfort: Reconnect (Token in Session, Sitzplatz halten), Chat-Relay, Spectator-Modus, Zug-Timer (Server-autoritativ, `turnTimer`-Broadcast)
- [ ] **B6** Deploy-Config: Build/Start-Scripts, `process.env.PORT`, WebSockets, `render.yaml` (Web Service)

### Stream C — Web (`apps/web/`)

- [ ] **C0** Gerüst: Vite + React 18 + TS + Tailwind + Zustand; `@colonist/shared` als Dep; `net/mockRoom.ts` (offline gegen Engine direkt)
- [ ] **C1** SVG-Hex-Board (read-only): Felder (Pixel-Art-Stil mit eigenen Grafiken), Zahlen-Tokens mit Wahrscheinlichkeits-Punkten (6/8 rot), Häfen mit Schiff-Icons, Räuber, Meer-Rand
- [ ] **C2** Board-Interaktion: klickbare Ecken (Siedlung/Stadt), Kanten (Straße), Flächen (Räuber) mit Legal-Highlighting via `legalActions()`
- [ ] **C3** Game-Screen-Layout (wie Screenshots):
  - Bau-/Aktionsleiste unten: Würfel, Handel, Dev-Karte kaufen/spielen, Straße/Siedlung/Stadt mit Restanzahl, Zug beenden/Sanduhr
  - Rechte Spalte: Bank-Ressourcen, Spieler-Panels (Ressourcen-Anzahl, Dev-Karten-Anzahl, Ritter, Straße, VP), Chat/Log
  - Linke Seite: Einstellungen / Regelwerk / Info
- [ ] **C4** Handels-Dialog: Angebot zusammenstellen, Gegenangebot, Bank/Hafen-Trade (Rate aus Hafen-Prüfung)
- [ ] **C5** Lobby-Screen (Bild 1): Raum-ID-Kopf, Spieler-Panel links (Avatar, Name, Bereit, Kick), „Freunde einladen"-Button (Link kopieren / Discord), Modus-/Karten-Kacheln (alle freigeschaltet, kein Premium-Lock), Regel-Toggles, Slider (Siegpunkte 3–20, Kartenabwurflimit 5–20, max. Spieler, Zug-Timer), „Spiel beginnen"
- [ ] **C6** Map-Builder (`src/builder/`):
  - Hex-Editor: Feld hinzufügen (Klick auf leere Nachbarzelle), Feld löschen, Hafen an Randkanten platzieren
  - Pro Feld: feste Ressource wählen **oder** „Zufall/Blank" (→ random beim Spielstart)
  - Zahlen werden **nie** im Builder gesetzt — immer runtime-zufällig
  - Speichern/Laden via `localStorage`, Export/Import als JSON, Auswahl eigener Maps in der Lobby
  - Validierung: zusammenhängend, ausreichend Land-Tiles für Spielerzahl
- [ ] **C7** Netzwerk-Adapter: `mockRoom.ts` → echter `colyseus.js`-Client (`VITE_SERVER_URL=wss://...`); `render.yaml` (Static Site)

---

## Integrations-Meilensteine

Nach den parallelen Strömen werden die Teile zusammengesteckt. Vor jedem Merge: `pnpm -r build && pnpm test` grün.

| # | Was | Ergebnis |
|---|-----|----------|
| **I1** | A1–A4 + B1–B3 + C1–C3 zusammenstecken | Echte Partie (Aufbau → Würfeln → Bauen → EndTurn) in mehreren Tabs über echten Server |
| **I2** | A5 + B4 + C4 + C5 | Dev-Karten, Handel, Lobby-Optionen, Siegbedingung end-to-end |
| **I3** | B5 + C6 | Reconnect, Chat, Zug-Timer, eigene Maps spielbar |
| **I4** | B6 + C7 | Render.com live, Test mit Freunden über öffentliche URL |
| **I5** | A7 + Server/UI-Anpassungen | Seefahrer spielbar |
| **I6** | A8 + Server/UI-Anpassungen | Städte & Ritter spielbar |
| *(opt.)* | KI-Gegner | Bots mit Schwierigkeitsstufen (Einfach/Mittel/Hart) |

---

## Regel-Details (Referenz für Implementierung)

### Bau-Legalität
- **Straße:** kostet Holz+Lehm; max. 15; muss an eigene Straße/Siedlung/Stadt anschließen; Kante frei
- **Siedlung:** kostet Holz+Lehm+Schaf+Weizen; max. 5; Abstandsregel (keine benachbarte Siedlung/Stadt); muss an eigene Straße anschließen (außer Setup)
- **Stadt:** kostet 2×Weizen+3×Erz; max. 4; eigene Siedlung muss dort stehen
- **Dev-Karte:** kostet Schaf+Weizen+Erz; Stapel nicht leer; in dieser Runde gekaufte Karten können **nicht** gespielt werden (`boughtOnTurn < turnNumber`)

### Handel
- **Bank:** 4:1 (Standard); 3:1 (allgemeiner Hafen); 2:1 (Ressourcen-spezifischer Hafen); Hafen gilt wenn Siedlung/Stadt an beiden Hafen-Corners
- **Spieler:** Angebot/Gegenangebot/Annahme/Ablehnung; nur während `main`-Phase; aktives Angebot setzt Phase auf `tradeOffer`

### 7 / Räuber
1. Alle Spieler mit `> discardLimit` Karten müssen `floor(total/2)` abwerfen → Phase `discard`
2. Aktiver Spieler setzt Räuber auf beliebiges Nicht-Meer-Tile → Phase `moveRobber`
3. Wenn Spieler mit Gebäuden am neuen Räuber-Tile vorhanden: 1 Karte klauen → Phase `steal`; sonst direkt zu `main`
4. `friendlyRobber`-Config: Räuber zieht keine Karte (Skip-Steal erzwungen)

### Längste Straße
DFS über zusammenhängende Straßen des Spielers. Eigene Siedlungen/Städte unterbrechen nicht; feindliche Siedlungen/Städte auf der Kante **unterbrechen** die Straße. Mindestlänge 5 für die Sonderkarte. Karte wechselt sofort beim Überbieten.

### Größte Rittermacht
Spieler mit `knightsPlayed >= 3` und mehr als aktueller Halter übernimmt die Karte. Mindestens 3.

### Siegpunkte (verdeckt/öffentlich)
VP-Dev-Karten zählen für Endspiel-Check (`endTurn`), sind aber im `publicView` anderer Spieler **unsichtbar**. Deshalb: Sieg immer server-seitig prüfen, nie client-seitig.

---

## Board-Konfigurationen (Preset-IDs)

| ID | Tiles | Spieler | Beschreibung |
|----|-------|---------|--------------|
| `base` | 19 | 3–4 | Standard-Catan, Radius 2 |
| `base56` | 30 | 5–6 | Erweiterung 5–6 Spieler |
| `base78` | 37 | 7–8 | Großes Board, Radius 3 |
| `random` | variabel | – | Vollständig zufällig |
| *(Builder)* | frei | frei | Eigene Map (localStorage/JSON) |

Karten aus dem Screenshot (Weltkarte, USA, Diamant, Seen, Teich, Zahnrad) kommen als spätere Presets.

---

## Deployment-Konfiguration (Render.com)

### `render.yaml` (root-level, nach I4)
```yaml
services:
  - type: web
    name: colonist-server
    runtime: node
    buildCommand: pnpm install && pnpm --filter @colonist/shared build && pnpm --filter @colonist/server build
    startCommand: node apps/server/dist/index.js
    envVars:
      - key: NODE_ENV
        value: production

  - type: static
    name: colonist-web
    buildCommand: pnpm install && pnpm --filter @colonist/shared build && pnpm --filter @colonist/web build
    staticPublishPath: apps/web/dist
    envVars:
      - key: VITE_SERVER_URL
        fromService:
          name: colonist-server
          type: web
          property: url
```

Server schläft nach ~15 Min Inaktivität (Free-Tier). Colyseus-Reconnect federt den Cold-Start ab: Client speichert `reconnectToken` in `sessionStorage`, Server hält Sitzplatz frei.

---

## Visuelles Ziel (Screenshot-Referenz)

### Lobby (Bild 1)
- Raum-ID oben mittig (`Raum-ID: area2438`)
- Links: Spieler-Liste (Avatar, Name, Bereit-Badge, Schwierigkeit, Kick-X)
- Links unten: „Freunde einladen" + Discord-Icon
- Mitte: Spielmodus-Kacheln, Karten-Kacheln, Regel-Toggles, Erweiterte Einstellungen
- Unten: „Spiel beginnen"-Button (grün)
- **Kein Lock/Premium** — alle Kacheln freigeschaltet

### Spielbrett (Bilder 2 & 3)
- SVG-Board zentriert, Meer-Hintergrund (blau), Hex-Tiles mit Ressourcen im Pixel-Art-Stil
- Zahlen-Tokens rund weiß, 6/8 rot, Wahrscheinlichkeits-Punkte darunter
- Hafen-Schiffe an Rand-Tiles, Räuber-Figur auf Wüste
- Siedlungen/Städte/Straßen in Spieler-Farben an Ecken/Kanten
- Oben links: Einstellungen ⚙, Regelwerk 📖, Info ℹ
- Rechts: Event-Log (wer hat was getan), darunter Chat „Plaudern" mit Ressourcen-Icons
- Rechts Spieler-Panels: Name, VP, Dev-Karten-Anzahl, Ressourcen-Anzahl, Ritter-Anzahl, Straßen-Badge
- Unten Mitte: Verbindungs-Status + Zug-Timer
- Unten: Aktionsleiste (Ressourcen-Icons, Bauen-Buttons mit Restanzahl)
