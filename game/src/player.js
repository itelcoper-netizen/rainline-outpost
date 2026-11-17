// The player: first-person movement, pointer-lock look, and the modeled
// carbine (recoil, ADS, reload, tracers, hitmarkers).
import THREE from './three-shim.js';

const EYE = 1.62;
const WALK = 4.6;
const SPRINT = 7.2;
const MAG = 30;

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, EYE, 78);
    this.yaw = 0;   // 0 faces north (-z)
    this.pitch = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.magSize = 30; // the upgrade crate raises this to 45
    this.mag = this.magSize;
    this.reserve = 120;
    this.reloading = false;
    this.reloadTimer = 0;
    this.ads = false;
    this.adsAmount = 0;
    this.fireTimer = 0;
    this.recoil = 0;
    this.spread = 0;
    this.bobPhase = 0;
    this.lastDamageAt = -99;
    this.buildViewmodel(scene);
  }

  buildViewmodel(scene) {
    const g = new THREE.Group();
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.45, metalness: 0.7 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x4a4234, roughness: 0.85 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.5, metalness: 0.6 });
    const add = (geo, m, x, y, z, rx = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      g.add(mesh);
      return mesh;
    };
    // Receiver, barrel, handguard, stock, magazine, sight, grip.
    add(new THREE.BoxGeometry(0.09, 0.13, 0.5), gunmetal, 0, 0, -0.1);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), gunmetal, 0, 0.01, -0.52, Math.PI / 2);
    add(new THREE.BoxGeometry(0.08, 0.09, 0.3), grip, 0, -0.01, -0.42);
    add(new THREE.BoxGeometry(0.07, 0.11, 0.22), gunmetal, 0, -0.01, 0.22);
    add(new THREE.BoxGeometry(0.06, 0.2, 0.1), grip, 0, -0.14, -0.05, 0.25);
    add(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip, 0, -0.12, 0.18, -0.15);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.05), accent, 0, 0.09, -0.12);
    this.frontSight = add(new THREE.BoxGeometry(0.02, 0.07, 0.02), accent, 0, 0.1, -0.34);
    // Muzzle tip object for tracer origin.
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.01, -0.75);
    g.add(this.muzzle);
    // Muzzle flash quad.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.flash.position.set(0, 0.01, -0.78);
    g.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffc06a, 0, 9, 1.6);
    this.flashLight.position.set(0, 0, -0.7);
    g.add(this.flashLight);
    this.viewmodel = g;
    this.basePos = new THREE.Vector3(0.28, -0.26, -0.5);
    this.adsPos = new THREE.Vector3(0, -0.155, -0.42);
    g.position.copy(this.basePos);
    this.camera.add(g);
    scene.add(this.camera);
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0021;
    this.pitch -= dy * 0.0021;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  update(dt, input, world, t) {
    // Movement.
    const sprinting = input.sprint && (input.forward || input.strafe);
    const speed = (sprinting ? SPRINT : WALK) * (this.ads ? 0.55 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * input.forward + rx * input.strafe;
    let mz = fz * input.forward + rz * input.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const nx = this.pos.x + mx * speed * dt;
    const nz = this.pos.z + mz * speed * dt;
    const moved = world.moveWithCollision(this.pos.x, this.pos.z, nx, nz, 0.5);
    const dxm = moved.x - this.pos.x, dzm = moved.z - this.pos.z;
    this.pos.x = moved.x; this.pos.z = moved.z;
    const moving = Math.hypot(dxm, dzm) > 0.0005;
    this.moving = moving;
    if (moving) this.bobPhase += dt * (sprinting ? 11 : 8);
    // Recoil recovery, spread.
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const targetSpread = moving ? 0.007 : 0.003;
    this.spread += (targetSpread - this.spread) * Math.min(1, dt * 8);
    // ADS blend.
    this.adsAmount += ((this.ads ? 1 : 0) - this.adsAmount) * Math.min(1, dt * 10);
    const a = this.adsAmount;
    this.camera.fov = 75 - 25 * a;
    this.camera.updateProjectionMatrix();
    // Reload timer.
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        const need = this.magSize - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take; this.reserve -= take;
        this.onReloaded && this.onReloaded();
      }
    }
    this.fireTimer -= dt;
    // Camera + viewmodel.
    const bobY = moving ? Math.sin(this.bobPhase * 2) * 0.028 : 0;
    const bobX = moving ? Math.cos(this.bobPhase) * 0.014 : 0;
    this.camera.position.set(this.pos.x + bobX, EYE + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil * 0.35, this.yaw, 0, 'YXZ');
    const vp = this.viewmodel.position;
    vp.lerpVectors(this.basePos, this.adsPos, a);
    vp.z += this.recoil * 0.09;
    vp.y += moving ? Math.sin(this.bobPhase * 2) * 0.008 : 0;
    this.viewmodel.rotation.x = this.recoil * 0.35;
    // Muzzle flash decay.
    if (this.flash.material.opacity > 0) {
      this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 14);
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 160);
    }
    // Slow health regen after 6 s without damage.
    if (t - this.lastDamageAt > 6 && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 4 * dt);
    }
  }

  canFire() {
    return !this.reloading && this.fireTimer <= 0 && this.mag > 0;
  }

  fire() {
    if (this.reloading) return 'reloading';
    if (this.fireTimer > 0) return 'cooldown';
    if (this.mag <= 0) return 'empty';
    this.fireTimer = 0.115;
    this.mag--;
    this.recoil = Math.min(0.09, this.recoil + 0.028);
    this.spread = Math.min(0.03, this.spread + 0.003);
    this.flash.material.opacity = 0.9;
    this.flashLight.intensity = 22;
    this.flash.rotation.z = Math.random() * Math.PI;
    return 'fired';
  }

  startReload() {
    if (this.reloading || this.mag === this.magSize || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = 1.15;
    return true;
  }

  damage(amount, t) {
    if (this.hp <= 0) return;
    this.hp -= amount;
    this.lastDamageAt = t;
    if (this.hp < 0) this.hp = 0;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  muzzleWorld(out) {
    return this.muzzle.getWorldPosition(out);
  }
}
