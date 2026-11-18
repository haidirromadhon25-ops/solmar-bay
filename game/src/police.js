// police.js — the wanted system and the Solmar PD. Stars rise with crimes and fade
// when the player stays clean; cruisers chase and ram, and on-foot officers close in
// to make an arrest. Busted or wasted ends the run with a fine and a respawn.

import * as THREE from 'three';
import { makeCarModel } from './vehicles.js';
import { resolveCircleColliders } from './city.js';
import { WANTED } from './config.js';
import { clamp, range } from './random.js';

export function createPolice(scene, rng, colliders) {
  const cruisers = [];
  const officers = [];
  let stars = 0;
  let lastCrimeAt = -1e9;
  let bustedTimer = 0;
  let sirenPhase = 0;

  for (let i = 0; i < 6; i++) {
    const model = makeCarModel('police', 0x1a1a1a);
    model.visible = false;
    scene.add(model);
    cruisers.push({ model, x: 0, z: 0, heading: 0, speed: 0, active: false });
  }
  // On-foot officers: dark-blue uniforms, built from the ped shape.
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x1c2f5e, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.36), navy);
    body.position.y = 1.05;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
    head.position.y = 1.66;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10), navy);
    cap.position.y = 1.86;
    g.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), navy);
    legL.position.set(-0.14, 0.35, 0);
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.14;
    g.add(legR);
    g.visible = false;
    scene.add(g);
    officers.push({ model: g, x: 0, z: 0, heading: 0, active: false, phase: Math.random() * 10 });
  }

  function addCrime(level, now) {
    stars = clamp(stars + level, 0, WANTED.maxStars);
    lastCrimeAt = now;
  }

  function setStars(n, now) {
    stars = clamp(n, 0, WANTED.maxStars);
    lastCrimeAt = now;
  }

  function spawnNear(px, pz, dist) {
    const a = Math.random() * Math.PI * 2;
    return { x: clamp(px + Math.cos(a) * dist, -330, 330), z: clamp(pz + Math.sin(a) * dist, -330, 330) };
  }

  function update(dt, now, px, pz, playerInCar, playerSpeed, onBusted, onRam) {
    // Wanted decay: one star fades after a clean stretch.
    if (stars > 0 && now - lastCrimeAt > WANTED.decaySeconds) {
      stars -= 1;
      lastCrimeAt = now;
    }
    const wantCruisers = stars === 0 ? 0 : Math.min(2 + stars, 6);
    const wantOfficers = !playerInCar && stars >= 2 ? Math.min(stars, 4) : 0;

    sirenPhase += dt * 6;
    const flash = Math.sin(sirenPhase) > 0;
    let nearest = Infinity;

    cruisers.forEach((c, i) => {
      if (i >= wantCruisers) {
        if (c.active) { c.active = false; c.model.visible = false; }
        return;
      }
      if (!c.active) {
        const p = spawnNear(px, pz, 90);
        c.x = p.x; c.z = p.z; c.heading = Math.atan2(px - p.x, pz - p.z);
        c.speed = 0; c.active = true; c.model.visible = true;
      }
      const dx = px - c.x;
      const dz = pz - c.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += clamp(dh, -1.9 * dt, 1.9 * dt);
      const targetSpeed = playerInCar ? 26 + stars * 2.5 : 13;
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.2);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      const res = resolveCircleColliders(c.x, c.z, 2.3, colliders);
      c.x = res.x; c.z = res.z;
      if (res.hit) c.speed *= 0.6;
      // Ram the player's car or the player himself.
      if (dist < 4.6) {
        if (onRam) onRam(dist);
        c.speed *= 0.5;
      }
      if (dist > 320) { c.active = false; c.model.visible = false; }
      c.model.position.set(c.x, 0, c.z);
      c.model.rotation.y = c.heading;
      if (c.model.userData.lightRed) {
        c.model.userData.lightRed.material.emissiveIntensity = flash ? 2.5 : 0.2;
        c.model.userData.lightBlue.material.emissiveIntensity = flash ? 0.2 : 2.5;
      }
    });

    // On-foot officers run the player down and hold him for an arrest.
    let closeOfficer = false;
    officers.forEach((o, i) => {
      if (i >= wantOfficers) {
        if (o.active) { o.active = false; o.model.visible = false; }
        return;
      }
      if (!o.active) {
        const p = spawnNear(px, pz, 40);
        o.x = p.x; o.z = p.z; o.active = true; o.model.visible = true;
      }
      const dx = px - o.x;
      const dz = pz - o.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      o.heading = Math.atan2(dx, dz);
      const spd = 7.2;
      o.x += Math.sin(o.heading) * spd * dt;
      o.z += Math.cos(o.heading) * spd * dt;
      const res = resolveCircleColliders(o.x, o.z, 0.55, colliders);
      o.x = res.x; o.z = res.z;
      o.phase += dt * 10;
      o.model.position.set(o.x, Math.abs(Math.sin(o.phase)) * 0.06, o.z);
      o.model.rotation.y = o.heading;
      if (dist < WANTED.bustedRange) closeOfficer = true;
    });

    if (closeOfficer && !playerInCar) {
      bustedTimer += dt;
      if (bustedTimer > WANTED.bustedHoldSeconds && onBusted) onBusted();
    } else {
      bustedTimer = Math.max(0, bustedTimer - dt * 2);
    }

    return { nearest, bustedProgress: bustedTimer / WANTED.bustedHoldSeconds };
  }

  return {
    get stars() { return stars; },
    addCrime,
    setStars,
    update,
    cruisers,
    officers,
    activeCruisers() { return cruisers.filter((c) => c.active); },
    activeOfficers() { return officers.filter((o) => o.active); },
  };
}
