// Builds the rainy forest outpost: terrain, structures, trees, rain, mist,
// lightning and the watchtower spotlight. Also owns collision and
// line-of-sight tests used by movement and enemy AI.
import THREE from './three-shim.js';
import { Rng } from './rng.js';

export const WORLD_RADIUS = 95;      // playable clearing radius
export const SPAWN = { x: 0, z: 78 }; // player deploys from the south treeline

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05, ...opts });
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = new Rng(seed);
    this.colliders = [];   // {kind:'circle', x, z, r} | {kind:'box', minX, maxX, minZ, maxZ}
    this.muzzlePoints = [];
    this.time = 0;
    this.flash = 0;        // lightning flash strength 0..1
    this.nextBolt = 6;
    this.onThunder = null; // callback(delay, strength)
    this.buildLights();
    this.buildGround();
    this.buildStructures();
    this.buildTrees();
    this.buildPuddles();
    this.buildRain();
    this.buildMist();
    this.buildProps();
  }

  // ---------- lights ----------
  buildLights() {
    const s = this.scene;
    s.background = new THREE.Color(0x111c2e);
    s.fog = new THREE.FogExp2(0x111c2e, 0.015);
    this.moon = new THREE.DirectionalLight(0x9fb4e0, 1.6);
    this.moon.position.set(-40, 60, -30);
    s.add(this.moon);
    this.ambient = new THREE.AmbientLight(0x2c3f5c, 2.2);
    s.add(this.ambient);
    this.flashLight = new THREE.DirectionalLight(0xdfeaff, 0);
    this.flashLight.position.set(30, 80, 20);
    s.add(this.flashLight);
    // Warm window lights over the cabin and shed.
    this.windowLight = new THREE.PointLight(0xffb45e, 90, 26, 1.8);
    this.windowLight.position.set(-14, 3.4, -18);
    s.add(this.windowLight);
    this.shedLight = new THREE.PointLight(0xffc27a, 40, 16, 1.8);
    this.shedLight.position.set(16, 3, -6);
    s.add(this.shedLight);
  }

  // ---------- ground ----------
  buildGround() {
    const geo = new THREE.PlaneGeometry(220, 220, 44, 44);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const rng = this.rng;
    const cA = new THREE.Color(0x3a5a30); // wet grass
    const cB = new THREE.Color(0x55452a); // mud
    const cC = new THREE.Color(0x2a4026); // dark moss
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x, z);
      const n = rng.next();
      tmp.copy(cA).lerp(n < 0.45 ? cB : cC, rng.next() * 0.7);
      // Worn dirt path from the south treeline to the outpost heart.
      if (Math.abs(x) < 4 && z > -30 && z < 80) tmp.lerp(new THREE.Color(0x4a3a26), 0.55);
      if (d > WORLD_RADIUS) tmp.multiplyScalar(0.55); // darker forest floor
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0.0,
    }));
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  box(w, h, d, color, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  addBoxCollider(minX, maxX, minZ, maxZ) {
    this.colliders.push({ kind: 'box', minX, maxX, minZ, maxZ });
  }

  addCircleCollider(x, z, r) {
    this.colliders.push({ kind: 'circle', x, z, r });
  }

  // ---------- structures ----------
  buildStructures() {
    const s = this.scene;
    // HQ cabin (west), lit windows.
    this.box(12, 4.4, 8, 0x4a3826, -14, 2.2, -18);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(8.6, 2.6, 4), mat(0x2e2620));
    roof.position.set(-14, 5.7, -18); roof.rotation.y = Math.PI / 4;
    roof.castShadow = true; s.add(roof);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffc06a, emissive: 0xff9a2a, emissiveIntensity: 2.2 });
    for (const wx of [-17.5, -10.5]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), winMat);
      w.position.set(wx, 2.6, -13.95); s.add(w);
    }
    this.box(1.4, 2.6, 0.3, 0x2a2018, -14, 1.3, -13.9);
    this.addBoxCollider(-20.2, -7.8, -22.2, -13.8);

    // Watchtower (north-east) with sweeping spotlight.
    const tx = 20, tz = -34;
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 9, 6), mat(0x3a2c1e));
      leg.position.set(tx + dx, 4.5, tz + dz); leg.castShadow = true; s.add(leg);
    }
    this.box(4.6, 0.3, 4.6, 0x4a3826, tx, 9.1, tz);
    this.box(4.6, 1.1, 0.25, 0x3a2c1e, tx, 9.8, tz - 2.2);
    this.box(4.6, 1.1, 0.25, 0x3a2c1e, tx, 9.8, tz + 2.2);
    this.box(0.25, 1.1, 4.6, 0x3a2c1e, tx - 2.2, 9.8, tz);
    this.box(0.25, 1.1, 4.6, 0x3a2c1e, tx + 2.2, 9.8, tz);
    const tRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 4), mat(0x2e2620));
    tRoof.position.set(tx, 11.4, tz); tRoof.rotation.y = Math.PI / 4; s.add(tRoof);
    // Spotlight head + beam.
    this.spotHead = new THREE.Group();
    this.spotHead.position.set(tx, 9.6, tz);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.7, 10), mat(0x222222, { metalness: 0.6, roughness: 0.4 }));
    head.rotation.x = Math.PI / 2.4;
    this.spotHead.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    lens.position.set(0, -0.18, 0.36); lens.rotation.x = -Math.PI / 2.4 + Math.PI;
    this.spotHead.add(lens);
    s.add(this.spotHead);
    this.spot = new THREE.SpotLight(0xffe9a8, 1400, 70, 0.32, 0.45, 1.2);
    this.spot.position.set(tx, 9.6, tz);
    this.spotTarget = new THREE.Object3D();
    s.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    s.add(this.spot);
    const beamGeo = new THREE.ConeGeometry(4.5, 34, 16, 1, true);
    beamGeo.translate(0, -17, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.beam.position.set(tx, 9.6, tz);
    s.add(this.beam);
    this.addBoxCollider(tx - 2.2, tx + 2.2, tz - 2.2, tz + 2.2);

    // Supply shed (east).
    this.box(7, 3.2, 5, 0x37424a, 16, 1.6, -6);
    const sRoof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 1.6, 4), mat(0x232a30));
    sRoof.position.set(16, 4, -6); sRoof.rotation.y = Math.PI / 4; s.add(sRoof);
    this.addBoxCollider(12.3, 19.7, -8.7, -3.3);

    // Generator (near shed) with blinking light.
    this.box(2.2, 1.4, 1.4, 0x5a5a52, 10, 0.7, -10);
    this.genLamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    this.genLamp.position.set(10, 1.6, -10); s.add(this.genLamp);
    this.addBoxCollider(8.8, 11.2, -10.8, -9.2);

    // Radio mast (north-west) with red aircraft light.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 16, 8), mat(0x555c66, { metalness: 0.5, roughness: 0.5 }));
    mast.position.set(-26, 8, -38); mast.castShadow = true; s.add(mast);
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), mat(0x555c66, { metalness: 0.5 }));
      bar.rotation.z = Math.PI / 2;
      bar.position.set(-26, 10 + i * 2.4, -38); s.add(bar);
    }
    this.mastLamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    this.mastLamp.position.set(-26, 16.2, -38); s.add(this.mastLamp);
    this.addCircleCollider(-26, -38, 0.8);
  }

  // ---------- trees ----------
  buildTrees() {
    const rng = this.rng;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 5);
    const crownGeo = new THREE.ConeGeometry(2.1, 7.5, 7);
    const trunkMat = mat(0x4a3826);
    const crownMat = mat(0x2a5233, { roughness: 1 });
    const N = 250;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, N);
    trunks.castShadow = true; crowns.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const v = new THREE.Vector3();
    let placed = 0, guard = 0;
    while (placed < N && guard++ < 4000) {
      const a = rng.angle();
      const r = 30 + Math.pow(rng.next(), 0.6) * 78;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // Keep the heart of the outpost and the deploy path clear.
      if (Math.hypot(x, z) < 26) continue;
      if (Math.abs(x) < 6 && z > -30 && z < 82) continue;
      if (Math.hypot(x + 14, z + 18) < 10) continue;
      if (Math.hypot(x - 16, z + 6) < 8) continue;
      if (Math.hypot(x - 20, z + 34) < 7) continue;
      const s = rng.float(0.8, 1.7);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.angle());
      m.compose(v.set(x, 1.2 * s, z), q, sc.set(s, s, s));
      trunks.setMatrixAt(placed, m);
      m.compose(v.set(x, (2.4 + 3.4) * s, z), q, sc.set(s, s, s));
      crowns.setMatrixAt(placed, m);
      if (Math.hypot(x, z) < WORLD_RADIUS) this.addCircleCollider(x, z, 0.55 * s);
      placed++;
    }
    trunks.count = placed; crowns.count = placed;
    this.scene.add(trunks); this.scene.add(crowns);
    this.treeCount = placed;
  }

  // ---------- puddles ----------
  buildPuddles() {
    const rng = this.rng;
    const pudMat = new THREE.MeshStandardMaterial({
      color: 0x16242f, roughness: 0.08, metalness: 0.85,
    });
    this.puddles = [];
    for (let i = 0; i < 9; i++) {
      const r = rng.float(1.2, 2.6);
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), pudMat);
      p.rotation.x = -Math.PI / 2;
      const a = rng.angle(), d = rng.float(6, 55);
      p.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
      p.scale.x = rng.float(1, 1.8);
      this.scene.add(p);
      this.puddles.push(p);
    }
  }

  // ---------- rain ----------
  buildRain() {
    const N = 2600;
    const pos = new Float32Array(N * 3);
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (this.rng.next() - 0.5) * 70;
      pos[i * 3 + 1] = this.rng.next() * 28;
      pos[i * 3 + 2] = (this.rng.next() - 0.5) * 70;
      this.rainVel[i] = 22 + this.rng.next() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xb8ccdf, size: 0.14, transparent: true, opacity: 0.85, sizeAttenuation: true,
    }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  // ---------- mist ----------
  buildMist() {
    this.mistPuffs = [];
    const geo = new THREE.PlaneGeometry(26, 7);
    const m = new THREE.MeshBasicMaterial({
      color: 0x8fa5c0, transparent: true, opacity: 0.05, depthWrite: false,
    });
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(geo, m.clone());
      p.material.opacity = 0.06 + this.rng.next() * 0.05;
      const a = this.rng.angle(), d = this.rng.float(8, 60);
      p.position.set(Math.cos(a) * d, 1.2 + this.rng.next() * 1.6, Math.sin(a) * d);
      p.rotation.y = this.rng.angle();
      p.userData.speed = 0.3 + this.rng.next() * 0.5;
      this.scene.add(p);
      this.mistPuffs.push(p);
    }
  }

  // ---------- sandbags, crates, barrels, medkits ----------
  buildProps() {
    const rng = this.rng;
    const bagGeo = new THREE.CapsuleGeometry(0.32, 0.5, 3, 6);
    bagGeo.rotateZ(Math.PI / 2);
    const bagMat = mat(0x5c4f38);
    const bags = new THREE.InstancedMesh(bagGeo, bagMat, 90);
    bags.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let bi = 0;
    const lines = [
      { x: -6, z: 8, len: 9, rot: 0.4 }, { x: 8, z: 14, len: 8, rot: -0.3 },
      { x: -2, z: -26, len: 10, rot: 0.1 }, { x: 24, z: -14, len: 7, rot: 1.2 },
    ];
    for (const L of lines) {
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < L.len; i++) {
          if (bi >= 90) break;
          const along = (i - L.len / 2) * 0.85;
          const x = L.x + Math.cos(L.rot) * along + (row ? 0.3 : -0.3) * Math.sin(L.rot);
          const z = L.z + Math.sin(L.rot) * along - (row ? 0.3 : -0.3) * Math.cos(L.rot);
          q.setFromAxisAngle(up, L.rot + rng.float(-0.15, 0.15));
          m.compose(new THREE.Vector3(x, 0.32 + row * 0.55, z), q, new THREE.Vector3(1, 1, 1));
          bags.setMatrixAt(bi++, m);
        }
      }
    }
    bags.count = bi;
    this.scene.add(bags);
    // Crates and barrels.
    const crateMat = mat(0x6a5232);
    const barrelMat = mat(0x3d5a3a, { metalness: 0.4, roughness: 0.5 });
    this.crates = [];
    const crateSpots = [[-6, -8], [-4.4, -8.2], [-5.2, -6.6], [12, 2], [13.4, 3.2], [-20, -28], [26, -22]];
    for (const [x, z] of crateSpots) {
      const c = this.box(1.2, 1.2, 1.2, 0x6a5232, x, 0.6, z);
      c.rotation.y = rng.angle();
      this.crates.push(c);
      this.addBoxCollider(x - 0.7, x + 0.7, z - 0.7, z + 0.7);
    }
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10);
    for (const [x, z] of [[-2, -10], [-1, -10.4], [14, -12], [24, -26]]) {
      const b = new THREE.Mesh(barrelGeo, barrelMat);
      b.position.set(x, 0.55, z); b.castShadow = true;
      this.scene.add(b);
      this.addCircleCollider(x, z, 0.55);
    }
    // Medkits (white box, green cross) — two stashes.
    this.medkits = [];
    for (const [x, z] of [[-10, -13.5], [13, -3.2]]) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), mat(0xe8e8e2));
      body.position.y = 0.18; g.add(body);
      const crossMat = new THREE.MeshBasicMaterial({ color: 0x2fae4e });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.1), crossMat);
      c1.position.y = 0.37; g.add(c1);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.3), crossMat);
      c2.position.y = 0.37; g.add(c2);
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.medkits.push({ group: g, x, z, taken: false });
    }
  }

  // ---------- collision / LOS ----------
  collideCircle(x, z, r) {
    for (const c of this.colliders) {
      if (c.kind === 'circle') {
        const dx = x - c.x, dz = z - c.z;
        const rr = r + c.r;
        if (dx * dx + dz * dz < rr * rr) return true;
      } else {
        const nx = Math.max(c.minX, Math.min(x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - nx, dz = z - nz;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  // 2D segment vs colliders: true when a wall/tree blocks the line.
  lineBlocked(x1, z1, x2, z2) {
    for (const c of this.colliders) {
      if (c.kind === 'circle') {
        if (segHitsCircle(x1, z1, x2, z2, c.x, c.z, c.r)) return true;
      } else if (segHitsBox(x1, z1, x2, z2, c.minX, c.maxX, c.minZ, c.maxZ)) {
        return true;
      }
    }
    return false;
  }

  moveWithCollision(x, z, nx, nz, r) {
    // Try full move, then axis-separated, so the player slides along walls.
    if (!this.collideCircle(nx, nz, r)) return { x: nx, z: nz };
    if (!this.collideCircle(nx, z, r)) return { x: nx, z };
    if (!this.collideCircle(x, nz, r)) return { x, z: nz };
    return { x, z };
  }

  // ---------- per-frame ----------
  update(dt, t, playerPos) {
    this.time = t;
    // Rain follows the player.
    const pos = this.rain.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - this.rainVel[i] * dt;
      if (y < 0) {
        y = 24 + Math.random() * 4;
        pos.setX(i, playerPos.x + (Math.random() - 0.5) * 70);
        pos.setZ(i, playerPos.z + (Math.random() - 0.5) * 70);
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    // Mist drifts.
    for (const p of this.mistPuffs) {
      p.position.x += p.userData.speed * dt;
      if (p.position.x > 70) p.position.x = -70;
    }
    // Watchtower spotlight sweeps.
    const ang = t * 0.45;
    const tx = 20 + Math.cos(ang) * 26;
    const tz = -34 + Math.sin(ang) * 26;
    this.spotTarget.position.set(tx, 0, tz);
    this.beam.lookAt(tx, 0, tz);
    this.beam.rotateX(-Math.PI / 2);
    // Blinking lamps.
    const blink = (Math.sin(t * 2.4) > 0.6) ? 1 : 0.15;
    this.mastLamp.material.color.setHex(blink > 0.5 ? 0xff2222 : 0x551111);
    this.genLamp.material.color.setHex(Math.sin(t * 5) > 0 ? 0xff4444 : 0x441111);
    this.windowLight.intensity = 55 + Math.sin(t * 7.3) * 5;
    // Lightning (skipped in deterministic screenshot mode).
    this.nextBolt -= dt;
    if (this.nextBolt <= 0 && !this.deterministic) {
      this.flash = 1;
      this.nextBolt = 7 + Math.random() * 9;
      if (this.onThunder) this.onThunder(0.3 + Math.random() * 1.2, 0.7 + Math.random() * 0.3);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      const f = this.flash * this.flash;
      this.flashLight.intensity = f * 3.2;
      this.ambient.intensity = 2.2 + f * 1.6;
    }
  }
}

function segHitsCircle(x1, z1, x2, z2, cx, cz, r) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((cx - x1) * dx + (cz - z1) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + dx * t - cx, pz = z1 + dz * t - cz;
  return px * px + pz * pz < r * r;
}

function segHitsBox(x1, z1, x2, z2, minX, maxX, minZ, maxZ) {
  // Slab test in 2D.
  let tmin = 0, tmax = 1;
  const dx = x2 - x1, dz = z2 - z1;
  for (const [o, d, mn, mx] of [[x1, dx, minX, maxX], [z1, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return false;
    } else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
