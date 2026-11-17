// Rainline Outpost — entrypoint for the make.fun "Make the best game" bounty.
// The game itself lives in game/ next to this file: a three.js first-person
// shooter set in a rainy forest outpost at night, plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js vendored
// under game/vendor/, no network requests). This program hands it in: it copies
// game/ and screenshots/ from beside this file into the output directory and
// writes dossier.json there with the vendored make.fun library — the summary
// the judge reads. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands
// in for /output; play the game locally first with `node serve.ts`, then open
// http://localhost:8080.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// One-line build summary on stderr, so stdout stays clean for the grader:
// output dir, game files copied, screenshots copied. The counts come from
// the dossier itself, so the summary can never disagree with what was
// handed in (source files plus vendored files under game/). buildDossier
// returns canonical JSON bytes, so decode a copy for reading; the bytes
// written to dossier.json above are untouched.
const dossierText = new TextDecoder().decode(dossier);
const sourceFiles = Number(dossierText.match(/Source files: (\d+)/)?.[1] ?? 0);
const vendoredFiles = Number(dossierText.match(/Vendored files: (\d+)/)?.[1] ?? 0);
const screenshotCount = (JSON.parse(dossierText) as { images?: unknown[] }).images?.length ?? 0;
console.error(
  `rainline-outpost build: ${out} — ${sourceFiles + vendoredFiles} game files, ${screenshotCount} screenshots, dossier.json written`,
);
