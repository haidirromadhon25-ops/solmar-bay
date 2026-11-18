// pedestrians.js — people walking the sidewalks. They stroll, wait at corners, flee
// from a speeding car, and fall over when one hits them. Hitting one is a crime.

import * as THREE from 'three';
import { STREETS, WORLD } from './config.js';
import { pick, range, chance } from './random.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

function makePedModel(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: pick(rng, SKINS), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pick(rng, [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037]), roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: pick(rng, [0x1a1a1a, 0x4a2f18, 0x777777, 0x8a5a2a]), roughness: 1 }));
  hair.position.y = 1.68;
  g.add(hair);
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
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

export function createPedestrians(scene, rng, count = 22) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const model = makePedModel(rng);
    scene.add(model);
    peds.push(spawnPed(model, rng, 0, 0, true));
  }

  function spawnPed(model, rng, px, pz, anywhere) {
    const street = pick(rng, STREETS);
    const along = Math.random() < 0.5;
    const x = anywhere
      ? (along ? range(rng, -320, 320) : street + (Math.random() < 0.5 ? 10 : -10))
      : px + range(rng, -90, 90);
    const z = anywhere
      ? (along ? street + (Math.random() < 0.5 ? 10 : -10) : range(rng, -320, 320))
      : pz + range(rng, -90, 90);
    return {
      model, x, z,
      heading: Math.random() * Math.PI * 2,
      speed: range(rng, 1.2, 2.2),
      walkPhase: Math.random() * 10,
      state: 'walk', // walk | flee | down
      downTimer: 0,
      waitTimer: range(rng, 0, 6),
    };
  }

  function update(dt, playerX, playerZ, playerSpeed, playerInCar, onHitPed) {
    for (const p of peds) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.state = 'walk';
          p.model.rotation.x = 0;
          p.model.position.y = 0;
        }
        continue;
      }
      const dp = Math.hypot(p.x - playerX, p.z - playerZ);
      // Flee from a fast car bearing down on them.
      if (playerInCar && playerSpeed > 8 && dp < 14) p.state = 'flee';
      else if (p.state === 'flee' && dp > 24) p.state = 'walk';

      if (p.state === 'flee') {
        const away = Math.atan2(p.x - playerX, p.z - playerZ);
        p.heading = away;
        p.x += Math.sin(away) * 4.5 * dt;
        p.z += Math.cos(away) * 4.5 * dt;
      } else {
        if (p.waitTimer > 0) {
          p.waitTimer -= dt;
        } else {
          p.x += Math.sin(p.heading) * p.speed * dt;
          p.z += Math.cos(p.heading) * p.speed * dt;
          // At an intersection, sometimes turn onto the crossing street.
          if (chance(rng, dt * 0.12)) p.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          if (Math.abs(p.x) > 330 || Math.abs(p.z) > 330) p.heading += Math.PI;
          if (p.x > 290 && p.z > 290) p.heading = Math.PI; // stay off the beach strip
        }
      }
      // Hit by the player's car.
      if (playerInCar && playerSpeed > 5 && dp < 2.6) {
        p.state = 'down';
        p.downTimer = 6;
        p.model.rotation.x = -Math.PI / 2;
        p.model.position.y = 0.35;
        onHitPed(p);
      }
      p.walkPhase += dt * (p.state === 'flee' ? 11 : 6);
      const swing = p.state === 'walk' || p.state === 'flee' ? Math.sin(p.walkPhase) * 0.55 : 0;
      const u = p.model.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      p.model.position.set(p.x, p.model.position.y, p.z);
      p.model.rotation.y = p.heading;
    }
  }

  return {
    peds,
    update,
    nearest(x, z, maxDist) {
      let best = null;
      let bd = maxDist * maxDist;
      for (const p of peds) {
        if (p.state === 'down') continue;
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
  };
}
