// Deterministic screenshot scenes: each plays the real game forward from a
// fixed seed, steered by a simple autopilot, so every screenshot is a
// genuine render of the game's own code.
const STEP = 1 / 30;

function nearestSentry(game) {
  let best = null, bd = Infinity;
  for (const s of game.sentries) {
    if (!s.alive || !s.active) continue;
    const d = Math.hypot(s.pos.x - game.player.pos.x, s.pos.z - game.player.pos.z);
    if (d < bd) { bd = d; best = s; }
  }
  return { sentry: best, dist: bd };
}

// Point the camera at the nearest live sentry's chest and let the
// viewmodel settle, so the frozen frame has a sentry in it.
function aimAtNearest(game) {
  const { sentry, dist } = nearestSentry(game);
  if (!sentry) return;
  game.player.yaw = angleTo(game, sentry.pos.x, sentry.pos.z);
  game.player.pitch = Math.atan2(1.25 - 1.62, Math.max(4, dist));
  game.player.update(0.016, { forward: 0, strafe: 0, sprint: false, firing: false }, game.world, game.time);
}

function angleTo(game, x, z) {
  // Yaw that faces (x, z) from the player: forward is (-sin yaw, -cos yaw).
  return Math.atan2(-(x - game.player.pos.x), -(z - game.player.pos.z));
}

function turnDelta(game, targetYaw, maxStep) {
  let diff = ((targetYaw - game.player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (diff > maxStep) diff = maxStep;
  if (diff < -maxStep) diff = -maxStep;
  return diff;
}

// Returns per-step input for the autopilot. `reckless` charges in and
// never takes cover, so the run ends on the mission-failed screen.
function autopilot(game, reckless, step, ctx) {
  const input = { forward: 0, strafe: 0, lookDx: 0, lookDy: 0, firing: false, reload: false, sprint: false };
  const { sentry, dist } = nearestSentry(game);
  if (!sentry) return input;
  const p = game.player;
  // Deterministic aim wobble so the autopilot shoots like a decent human,
  // not a perfect aimbot.
  const wobbleYaw = Math.sin(step * 0.13) * 0.02;
  const wobblePitch = Math.cos(step * 0.11) * 0.015;
  const wantYaw = angleTo(game, sentry.pos.x, sentry.pos.z) + wobbleYaw;
  const dYaw = turnDelta(game, wantYaw, 0.09);
  input.lookDx = -dYaw / 0.0021;
  // Aim at the chest (y ~1.25), not over the torso: the eye is at 1.62.
  const wantPitch = Math.atan2(1.25 - 1.62, Math.max(4, dist)) + wobblePitch;
  let dPitch = wantPitch - p.pitch;
  if (dPitch > 0.05) dPitch = 0.05;
  if (dPitch < -0.05) dPitch = -0.05;
  input.lookDy = -dPitch / 0.0021;
  const aimed = Math.abs(((wantYaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.03
    && Math.abs(wantPitch - p.pitch) < 0.03;
  const los = !game.world.lineBlocked(p.pos.x, p.pos.z, sentry.pos.x, sentry.pos.z);
  const fireRange = reckless ? 26 : 30;
  // Movement: close the distance first, then strafe while engaging. With no
  // line of sight, keep closing in instead of strafing behind cover — the
  // strafe band behind a wall is a dead end the autopilot cannot shoot out of.
  const wantDist = reckless ? 12 : 19;
  if (dist > wantDist + 2 || !los) { input.forward = 1; input.strafe = 0; }
  else if (dist < wantDist - 4) input.forward = -0.6;
  else if (!reckless) input.strafe = Math.sin(step * 0.045) > 0 ? 0.7 : -0.7;
  if (!reckless && p.hp < 45) { input.forward = -1; input.strafe = 0; }
  if (p.mag === 0) input.reload = true;
  // Unstuck: if barely moving while trying to advance, sidestep for a while.
  const moved = Math.hypot(p.pos.x - ctx.lastX, p.pos.z - ctx.lastZ);
  ctx.lastX = p.pos.x; ctx.lastZ = p.pos.z;
  if (input.forward > 0 && moved < 0.02) ctx.stuck += 1; else ctx.stuck = 0;
  if (ctx.stuck > 90) {
    ctx.strafeTimer = 60;
    ctx.stuck = 0;
    ctx.strafeDir = -ctx.strafeDir;
  }
  if (ctx.strafeTimer > 0) {
    ctx.strafeTimer--;
    input.strafe = ctx.strafeDir;
    input.forward = 0.4;
  }
  // Fire in bursts only when aimed, in range, with a clear line.
  if (aimed && los && dist < fireRange && p.mag > 0) {
    input.firing = (step % 45) < (reckless ? 30 : 22);
  }
  return input;
}

export function stageShot(name, game) {
  game.reset(1);
  const ctx = { lastX: 0, lastZ: 0, stuck: 0, strafeTimer: 0, strafeDir: 1 };
  const idle = { forward: 0, strafe: 0, lookDx: 0, lookDy: 0, firing: false, reload: false, sprint: false };
  if (name === 'play' || name === 'end' || name === 'win') {
    game.startMission(true);
    const reckless = name === 'end';
    const maxSteps = (name === 'end' ? 420 : name === 'win' ? 600 : 60) * 30;
    let step = 0;
    while (step < maxSteps && game.state === 'playing') {
      game.step(STEP, autopilot(game, reckless, step, ctx));
      step++;
      // Play shot: stop once a sentry is close AND in clear view — a
      // sentry hidden behind a crate does not count as a gameplay shot.
      if (name === 'play' && step > 10 * 30) {
        const { sentry, dist } = nearestSentry(game);
        if (sentry && dist < 18
          && !game.world.lineBlocked(game.player.pos.x, game.player.pos.z, sentry.pos.x, sentry.pos.z)) break;
      }
    }
    if (name === 'play' && game.state === 'playing') {
      // Frame the nearest live sentry dead-centre for the screenshot.
      aimAtNearest(game);
      for (let i = 0; i < 12; i++) game.step(STEP, idle);
      aimAtNearest(game);
      for (let i = 0; i < 3; i++) game.step(STEP, idle);
    }
    // If the reckless run somehow survived, walk into the open and stand
    // still until the sentries finish it.
    if (name === 'end') {
      let guard = 0;
      while (game.state === 'playing' && guard++ < 60 * 30) {
        const input = { forward: 1, strafe: 0, lookDx: 0, lookDy: 0, firing: false, reload: false, sprint: false };
        game.step(STEP, input);
      }
    }
    return game.state;
  }
  if (name === 'captain') {
    // Boss moment: jump straight to the final wave, stand the other
    // final-wave sentry down, then close on the Captain without firing.
    game.startMission(true);
    game.skipToWave(2);
    const other = game.sentries[6];
    if (other.alive) { other.alive = false; other.state = 'dead'; other.group.visible = false; game.kills++; }
    const captain = game.sentries[7];
    // Deploy 13 m from the Captain, toward the outpost heart, so the boss
    // fills the frame.
    const dx = -captain.pos.x, dz = -captain.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    game.player.pos.set(captain.pos.x + (dx / len) * 13, 1.62, captain.pos.z + (dz / len) * 13);
    game.player.hp = 100;
    let step = 0;
    while (step < 8 * 30 && game.state === 'playing') {
      const chase = autopilot(game, false, step, ctx);
      chase.firing = false; // staging only: do not kill the boss before the shot
      game.step(STEP, chase);
      step++;
      const { dist } = nearestSentry(game);
      if (step > 3 * 30 && dist < 16) break;
    }
    if (game.state === 'playing') {
      aimAtNearest(game);
      for (let i = 0; i < 30; i++) game.step(STEP, idle);
      aimAtNearest(game);
      for (let i = 0; i < 30; i++) game.step(STEP, idle);
      aimAtNearest(game);
      game.hud.bannerText('⚠ CAPTAIN VOSS', 'Elite sentry — heavy armour, fast reactions', 5);
    }
    return game.state;
  }
  // Start scene: idle camera drift over the live outpost for 5 s.
  for (let i = 0; i < 5 * 30; i++) game.stepTitle(STEP);
  return 'title';
}
