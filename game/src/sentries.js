// Patrolling sentries: patrol waypoints, suspicion, alerted combat with
// burst fire, and a visible death fall. All logic is deterministic given
// the same inputs; randomness comes from the seeded Rng.
import THREE from './three-shim.js';

const BODY_DMG = 34;
const HEAD_DMG = 68;

export class Sentry {
  constructor(scene, rng, id, waypoints, opts = {}) {
    this.id = id;
    this.elite = !!opts.elite;
    this.name = this.elite ? 'CAPTAIN VOSS' : null;
    this.active = true;
    this.rng = rng;
    this.waypoints = waypoints;
    this.wpIndex = Math.floor(rng.next() * waypoints.length);
    this.pos = new THREE.Vector3(waypoints[this.wpIndex].x, 0, waypoints[this.wpIndex].z);
    this.yaw = rng.angle();
    this.hp = this.elite ? 260 : 100;
    this.alive = true;
    this.state = 'patrol'; // patrol | suspicious | alert
    this.pauseTimer = rng.float(0, 1.5);
    this.suspicion = 0;
    this.lastSeen = null;
    this.shootTimer = rng.float(0.5, 1.2);
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.alertTimer = 0;
    this.flashTimer = 0;
    this.rngSeededTime = 0;
    this.moving = false;
    this.buildMesh(scene);
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    const uniform = new THREE.MeshStandardMaterial({ color: 0x2b3326, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d18, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a6f56, roughness: 0.8 });
    // Legs.
    for (const sx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), dark);
      leg.position.set(sx, 0.4, 0); g.add(leg);
    }
    // Torso + vest.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.38), uniform);
    torso.position.y = 1.16; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.44), dark);
    vest.position.y = 1.2; g.add(vest);
    // Head with glowing visor slit.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
    head.position.y = 1.72; g.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
    helmet.position.y = 1.76; g.add(helmet);
    this.visorColor = this.elite ? 0xff2222 : 0xff5533;
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(this.elite ? 0.38 : 0.3, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: this.visorColor }));
    this.visor.position.set(0, 1.72, 0.2); g.add(this.visor);
    // Rifle.
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.95), dark);
    rifle.position.set(0.32, 1.25, 0.3); g.add(rifle);
    // Arms reaching to the rifle.
    for (const sx of [-0.3, 0.3]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), uniform);
      arm.position.set(sx, 1.3, 0.18); arm.rotation.x = -0.9; g.add(arm);
    }
    if (this.elite) {
      // Crimson pauldrons, a red glow and a taller frame so the Captain
      // reads as the boss at a glance, even in the rain.
      const crimson = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.6 });
      for (const sx of [-0.4, 0.4]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.4), crimson);
        pad.position.set(sx, 1.52, 0); g.add(pad);
      }
      const glow = new THREE.PointLight(0xff2222, 5, 7, 1.8);
      glow.position.set(0, 1.6, 0); g.add(glow);
      g.scale.setScalar(1.12);
    }
    g.position.copy(this.pos);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.sentry = this; } });
    // Tag head vs body for hit detection.
    head.userData.part = 'head';
    torso.userData.part = 'body'; vest.userData.part = 'body';
    this.group = g;
    this.headMesh = head;
    this.torsoMesh = torso;
    scene.add(g);
    // Muzzle tip (world position computed at fire time).
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0.32, 1.3, 0.85);
    g.add(this.muzzle);
  }

  // Waves call this: dormant sentries are invisible, silent and harmless
  // until their wave opens.
  setActive(v) {
    this.active = v;
    this.group.visible = v;
  }

  muzzleWorld(out) {
    return this.muzzle.getWorldPosition(out);
  }

  takeDamage(amount, part) {
    if (!this.alive) return 0;
    this.hp -= amount;
    this.flashTimer = 0.12;
    this.visor.material.color.setHex(0xffffff);
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0.25;
      return 1;
    }
    return 0;
  }

  hearShot(fromPos, world) {
    if (!this.alive || !this.active) return;
    const d = Math.hypot(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
    if (d < 42 && this.state === 'patrol') {
      this.state = 'suspicious';
      this.suspicion = 1;
      this.lastSeen = { x: fromPos.x, z: fromPos.z };
      this.alertTimer = 6;
    }
  }

  update(dt, player, world) {
    if (!this.alive || !this.active) return;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.visor.material.color.setHex(this.visorColor);
    }
    const px = player.pos.x, pz = player.pos.z;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    // Vision: within 30 m, in front cone, line of sight clear.
    let sees = false;
    if (dist < 30) {
      let angDiff = Math.abs(((toPlayer - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (angDiff < 1.15 && !world.lineBlocked(this.pos.x, this.pos.z, px, pz)) sees = true;
    }
    if (sees) {
      this.lastSeen = { x: px, z: pz };
      if (this.state !== 'alert') {
        this.state = 'alert';
        this.alertTimer = 8;
        this.onAlerted && this.onAlerted(this);
      }
    }

    if (this.state === 'alert') {
      this.alertTimer -= dt;
      // Face the player.
      this.yaw = turnToward(this.yaw, toPlayer, dt * 6);
      // Keep a firing distance: close in if far, back off if too close.
      let move = 0;
      if (dist > 24) move = 1;
      else if (dist < 10) move = -0.7;
      // Strafe to stay a moving target.
      const strafe = Math.sin(this.rngSeededTime * 0.9 + this.id * 2.1) * 0.8;
      this.stepMove(dt, move, strafe, world, this.elite ? 4.4 : 3.4);
      // Fire bursts. The Captain reacts faster and fires longer bursts.
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && sees) {
        this.burstLeft = this.elite ? 4 : 3;
        this.burstTimer = 0;
        this.shootTimer = this.elite ? 0.55 + this.rng.next() * 0.45 : 0.9 + this.rng.next() * 0.7;
      }
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          this.burstTimer = 0.11;
          this.burstLeft--;
          this.onShoot && this.onShoot(this);
        }
      }
      if (this.alertTimer <= 0 && !sees) {
        this.state = 'patrol';
        this.suspicion = 0;
      }
    } else if (this.state === 'suspicious') {
      this.alertTimer -= dt;
      const tx = this.lastSeen.x, tz = this.lastSeen.z;
      const tdx = tx - this.pos.x, tdz = tz - this.pos.z;
      const td = Math.hypot(tdx, tdz);
      if (td > 1.2) {
        this.yaw = turnToward(this.yaw, Math.atan2(tdx, tdz), dt * 5);
        this.stepMove(dt, 1, 0, world, 2.6);
      } else {
        this.yaw += dt * 1.4; // look around
      }
      if (this.alertTimer <= 0) { this.state = 'patrol'; this.suspicion = 0; }
    } else {
      // Patrol: walk waypoints, pause at each.
      const wp = this.waypoints[this.wpIndex];
      const dx2 = wp.x - this.pos.x, dz2 = wp.z - this.pos.z;
      const d2 = Math.hypot(dx2, dz2);
      if (this.pauseTimer > 0) {
        this.pauseTimer -= dt;
        this.yaw += dt * 0.5;
      } else if (d2 > 0.6) {
        this.yaw = turnToward(this.yaw, Math.atan2(dx2, dz2), dt * 4);
        this.stepMove(dt, 1, 0, world, 1.7);
      } else {
        this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
        this.pauseTimer = 0.8 + this.rng.next() * 1.6;
      }
    }
    // Walk bob.
    this.group.position.set(this.pos.x, this.moving ? Math.abs(Math.sin(this.rngSeededTime * 9)) * 0.05 : 0, this.pos.z);
    this.group.rotation.y = this.yaw;
  }

  stepMove(dt, forward, strafe, world, speed) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const nx = this.pos.x + (fx * forward + rx * strafe) * speed * dt;
    const nz = this.pos.z + (fz * forward + rz * strafe) * speed * dt;
    const moved = world.moveWithCollision(this.pos.x, this.pos.z, nx, nz, 0.5);
    this.moving = Math.hypot(moved.x - this.pos.x, moved.z - this.pos.z) > 0.001;
    this.pos.x = moved.x; this.pos.z = moved.z;
    this.rngSeededTime = (this.rngSeededTime || 0) + dt;
  }
}

function turnToward(yaw, target, maxStep) {
  let diff = ((target - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (diff > maxStep) diff = maxStep;
  if (diff < -maxStep) diff = -maxStep;
  return yaw + diff;
}

export { BODY_DMG, HEAD_DMG };
