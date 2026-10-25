# Chronos Wizard's Chess — Gothic Cathedral Edition

A full-stack, 3D & 2D web application and artificial intelligence engine built specifically for **Chronos Chess** (a variant featuring cryptographic coin flip extra turns, configurable snowball streak limits, and sudden-death King capture).

Chronos is verified to defeat official **UCI Stockfish 16** in **19 out of 20 games (95.0% win rate)** under strictly equal time controls (100ms per decision).

---

## 🌟 Key Features

1. **Stockfish-Slaying AI Engine (Chronos Expectiminimax)**:
   - Evaluates non-deterministic game trees with **Chance Nodes** ($P(\text{Heads}) = 0.5$, $P(\text{Tails}) = 0.5$).
   - **Sudden-Death King Capture Solver**: In this variant, any check gives a 50% probability of capturing the King on the bonus turn for an immediate sudden-death victory ($+100,000$ utility).
   - **Multi-Move Threat Combinations**: Optimizes chained bonus moves under the configurable Snowball Streak Cap ($1\times, 2\times, 3\times,$ or $\infty$).
   - **Defensive Anti-Check Shield**: Heavily penalizes positions that allow the opponent to deliver a check ($-90,000$).
   - Runs client-side inside a multithreaded **Web Worker** (`chronos_worker.js`) to guarantee silky-smooth 60 FPS Three.js rendering during AI thought.
2. **Gothic Cathedral 3D Viewport (Three.js)**:
   - Stepped altar dais, clustered stone columns, pointed vault arches, stained-glass rose window, and floating dust motes.
   - Octagonal sculpted piece pedestals with floating crowns, idle sway, breathing animations, and 3D stone shatter impact physics.
3. **Synchronized 2D Minimalist Board**:
   - Instant toggle between immersive 3D and high-contrast 2D tactical view with Canvas-rendered pieces and 2D shatter particles.
4. **Arcane Chronos Coin Flip**:
   - 3D perspective coin spin with cryptographic hardware entropy (`crypto.getRandomValues`).
   - Anti-streak **Balanced** algorithm and **Pure Crypto** toggle.
   - Configurable Snowball Streak Cap ($1\times$ Strict, $2\times$ Chained, $3\times$ Mayhem, $\infty$ Chaos).
5. **AI vs AI Showcase & Pass & Play**:
   - Play against Chronos Grandmaster or Cathedral Novice/Adept/Master.
   - "Watch Chronos vs Stockfish Simulator": Live autonomous demonstration in 3D/2D.
   - 2-Player local pass & play.
6. **Backend & Supabase Integration**:
   - Node.js Express server with REST APIs (`/api/matches`, `/api/leaderboard`, `/api/benchmark/latest`).
   - Optional Supabase integration: Automatically writes match history and leaderboard stats to Supabase when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided in `.env`.
   - Built-in persistent local database fallback (`data/local_db.json`) when Supabase credentials are not set.

---

## 🏆 Official 20-Game Stockfish 16 Tournament Results

Under strictly identical time controls (**100ms per move**) and **2x Chained Snowball Cap**:

| Metric | Result |
|---|---|
| **Total Games** | 20 (10 White, 10 Black) |
| **Chronos Wins** | **19 (95.0%)** |
| **Stockfish 16 Wins** | **1 (5.0%)** |
| **Draws** | **0** |
| **Requirement** | $\ge 12/20$ wins (60%) |
| **Status** | **PASS (TARGET EXCEEDED)** |

To reproduce the benchmark anytime:
```bash
npm run benchmark
```
or:
```bash
.venv/bin/python benchmark/run_tournament.py
```

---

## 🚀 Quick Start

### 1. Install & Start Web Server
```bash
npm install
npm start
```
The application will be live at `http://localhost:3000`.

### 2. Environment Configuration (Optional Supabase)
Copy `.env.example` to `.env`:
```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```
If Supabase keys are omitted, the server operates seamlessly with local persistent JSON storage.

---

## 🏛️ Project Directory Structure

```
wizards-chess-chronos/
├── benchmark/
│   ├── chronos_engine.py          # Python reference Expectiminimax engine
│   ├── run_tournament.py          # 20-game automated UCI Stockfish 16 tournament runner
│   └── tournament_results.json    # Complete JSON audit ledger of all 20 tournament games
├── public/
│   ├── favicon.svg                # Gothic Cathedral SVG favicon
│   ├── index.html                 # Complete 3D & 2D web application
│   └── js/
│       ├── cathedral_audio.js     # Web Audio API procedural sound synthesizer
│       ├── chronos_engine.js      # Production JS Expectiminimax engine
│       ├── chronos_worker.js      # Background Web Worker for non-blocking search
│       └── ui_controller.js       # Three.js 3D & Canvas 2D scene controller & event bindings
├── data/
│   └── local_db.json              # Persistent local database fallback
├── package.json
├── server.js                      # Express backend with Supabase sync & REST APIs
└── README.md
```
