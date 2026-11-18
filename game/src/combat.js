// combat.js — shooting: the player's pistol with a magazine and reload, tracers and
// muzzle flash, plus gang enemies who take cover range, shoot back and drop cash.
// Hit detection is a raycast from the camera through the crosshair.

import * as THREE from 'three';
import { range } from './random.js';

const RAY = new THREE.Raycaster();

function makeGangModel() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x8e1f2f, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.36), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.66;
  g.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
  band.position.y = 1.78;
  g.add(band);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legL.position.set(-0.14, 0.35, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.18), shirt);
  armL.position.set(-0.36, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.7 }));
  gun.position.set(0.36, 0.9, 0.3);
  g.add(gun);
  // Health bar above the head.
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.8, depthWrite: false }));
  barBg.position.y = 2.15;
  g.add(barBg);
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.09),
    new THREE.MeshBasicMaterial({ color: 0xff3020, depthWrite: false }));
  barFg.position.y = 2.15;
  barFg.position.z = 0.01;
  g.add(barFg);
  g.userData = { legL, legR, armL, armR, barFg, barBg };
  return g;
}

export function createCombat(scene, rng, effects) {
  const enemies = [];
  const tracers = [];
  let ammo = 12;
  let reloading = 0;
  let cooldown = 0;
  let flashLight = new THREE.PointLight(0xffc860, 0, 14, 1.8);
  scene.add(flashLight);

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });

  function addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, life: 0.12 });
  }

  function spawnEnemy(x, z) {
    const model = makeGangModel();
    model.position.set(x, 0, z);
    scene.add(model);
    const e = {
      model, x, z,
      heading: Math.random() * Math.PI * 2,
      health: 100,
      shootTimer: range(rng, 0.8, 2),
      moveTimer: 0,
      phase: Math.random() * 10,
      alive: true,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
    };
    enemies.push(e);
    return e;
  }

  function removeEnemy(e) {
    e.alive = false;
    scene.remove(e.model);
  }

  // Player fires the pistol. Returns 'hit' | 'miss' | 'empty' | 'reloading'.
  function playerShoot(camera, playerPos, onHitEnemy) {
    if (reloading > 0) return 'reloading';
    if (cooldown > 0) return 'cooldown';
    if (ammo <= 0) {
      reloading = 1.2;
      return 'empty';
    }
    cooldown = 0.18;
    ammo -= 1;
    const muzzle = new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z);
    RAY.setFromCamera(new THREE.Vector2(0, 0), camera);
    RAY.far = 90;
    const targets = enemies.filter((e) => e.alive).map((e) => e.model);
    const hits = RAY.intersectObjects(targets, true);
    flashLight.position.copy(muzzle).add(new THREE.Vector3(0, 0.2, 0.6));
    flashLight.intensity = 26;
    if (hits.length > 0) {
      const hit = hits[0];
      let enemy = null;
      for (const e of enemies) {
        if (e.alive && e.model === hit.object) enemy = e;
        if (!enemy && e.alive) {
          e.model.traverse((o) => { if (o === hit.object) enemy = e; });
        }
      }
      addTracer(muzzle, hit.point.clone());
      effects.burst(hit.point.x, hit.point.y, hit.point.z, 0xffcc66, 8, 3, 0.5);
      if (enemy) {
        enemy.health -= 34;
        enemy.model.userData.barFg.scale.x = Math.max(0, enemy.health / 100);
        if (enemy.health <= 0) {
          enemy.alive = false;
          enemy.model.rotation.x = -Math.PI / 2;
          enemy.model.position.y = 0.3;
          if (onHitEnemy) onHitEnemy(enemy, true);
          setTimeout(() => removeEnemy(enemy), 2500);
        } else if (onHitEnemy) {
          onHitEnemy(enemy, false);
        }
      }
      return 'hit';
    }
    const end = RAY.ray.at(60, new THREE.Vector3());
    addTracer(muzzle, end);
    return 'miss';
  }

  function update(dt, playerPos, playerAlive, onPlayerHit) {
    cooldown = Math.max(0, cooldown - dt);
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) ammo = 12;
    }
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 220);
    for (const t of tracers) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      if (tracers[i].life <= 0) tracers.splice(i, 1);
    }
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = playerPos.x - e.x;
      const dz = playerPos.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      e.model.rotation.y = e.heading;
      // Keep a fighting distance: advance when far, strafe when close.
      e.moveTimer -= dt;
      if (dist > 20) {
        e.x += Math.sin(e.heading) * 4.2 * dt;
        e.z += Math.cos(e.heading) * 4.2 * dt;
      } else if (dist < 8) {
        e.x -= Math.sin(e.heading) * 2.5 * dt;
        e.z -= Math.cos(e.heading) * 2.5 * dt;
      } else {
        const strafe = e.heading + Math.PI / 2 * e.strafeDir;
        e.x += Math.sin(strafe) * 1.6 * dt;
        e.z += Math.cos(strafe) * 1.6 * dt;
        if (e.moveTimer <= 0) {
          e.strafeDir *= -1;
          e.moveTimer = range(rng, 1.5, 3);
        }
      }
      e.phase += dt * 9;
      const swing = Math.sin(e.phase) * 0.5;
      e.model.userData.legL.rotation.x = swing;
      e.model.userData.legR.rotation.x = -swing;
      e.model.userData.armL.rotation.x = -1.2;
      e.model.userData.armR.rotation.x = -1.2;
      e.model.position.set(e.x, 0, e.z);
      // Health bar always faces the camera-ish: keep it upright, rotate with model is fine.
      e.model.userData.barFg.lookAt(playerPos.x, 2.15, playerPos.z);
      e.model.userData.barBg.lookAt(playerPos.x, 2.15, playerPos.z);
      // Shoot back, with inaccuracy that grows with distance.
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 42 && playerAlive) {
        e.shootTimer = range(rng, 1.1, 2.1);
        const muzzle = new THREE.Vector3(e.x, 1.3, e.z);
        const aim = new THREE.Vector3(
          playerPos.x + range(rng, -1.6, 1.6) * (dist / 20),
          playerPos.y + 1.2,
          playerPos.z + range(rng, -1.6, 1.6) * (dist / 20),
        );
        addTracer(muzzle, aim);
        const hitChance = dist < 14 ? 0.42 : dist < 26 ? 0.28 : 0.16;
        if (Math.random() < hitChance && onPlayerHit) onPlayerHit(range(rng, 6, 12));
      }
    }
  }

  return {
    enemies,
    spawnEnemy,
    removeEnemy,
    playerShoot,
    update,
    get ammo() { return ammo; },
    get reloading() { return reloading > 0; },
    startReload() { if (ammo < 12 && reloading <= 0) reloading = 1.2; },
    aliveEnemies() { return enemies.filter((e) => e.alive); },
  };
}
