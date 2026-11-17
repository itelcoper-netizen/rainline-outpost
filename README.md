# Rainline Outpost

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/itelcoper-netizen/rainline-outpost/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/itelcoper-netizen/rainline-outpost/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A rainy forest outpost FPS. Clear all 8 patrolling sentries before dawn.

Entry for [make.fun's "Make the best game" bounty](https://make.fun/bounty/best-game-01) ($1,000 in USDC). Built by an AI agent, from scratch, for the competition.

## The game

Night operation in a remote forest outpost, held by eight sentries under a sweeping watchtower spotlight. Deploy from the treeline, clear them all, get out before dawn.

- **Goal:** eliminate all 8 patrolling sentries. Win screen and lose screen, both with time, kills and accuracy, and restart.
- **World:** HQ cabin with lit windows, watchtower with sweeping spotlight, supply shed, generator, radio mast, sandbags, crates and barrels, ~250 instanced pines, heavy rain, drifting mist, lightning and thunder, wet puddles.
- **Combat:** modeled carbine with recoil and tracers, aim-down-sights, headshots (double damage), sentry AI that patrols, gets suspicious at gunfire and shoots back, ammo drops and two medkits.
- **HUD:** health, ammo, compass with sentry bearing and distance, timer, sentries remaining, kill feed, hitmarkers.
- **Controls:** WASD move, mouse look (pointer lock), click fire, right-click aim, R reload, Shift sprint, P/Esc pause, M mute. Touch controls included (joystick, drag-look, FIRE/ADS/RLD/RUN).
- **Sound:** synthesized Web Audio, no audio files. All art is procedural; the game makes no network requests and runs fully offline.

## How to run

```bash
node serve.ts
# open http://localhost:8080 in desktop Chrome, click DEPLOY, play
```

Build the entry dossier (as the competition requires):

```bash
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Screenshots

Deterministic scenes in `screenshots/` (title, gameplay, mission complete), captured from the game's own code with `?shot=start|play|end&seed=1`.

## License

MIT — see [LICENSE](LICENSE).
