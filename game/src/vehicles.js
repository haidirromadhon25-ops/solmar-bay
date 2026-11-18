// vehicles.js — car models built from boxes (sedan, taxi, sports, van, police cruiser)
// and the traffic system: cars that drive the street grid, turn at intersections and
// queue behind each other. Police cruisers are driven by police.js, not traffic.

import * as THREE from 'three';
import { STREETS, WORLD } from './config.js';
import { pick, range, rangeInt } from './random.js';

const TRAFFIC_COLORS = [0xc0392b, 0x2e6fb0, 0xd8d8d8, 0x2c2f36, 0x7a4a9a, 0x3a7a4a, 0xc0a030, 0x808890];

export function makeCarModel(kind, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.7 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const hub = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.4 });

  const low = kind === 'sports';
  const long = kind === 'van' || kind === 'truck';
  const bodyH = low ? 0.62 : 0.85;
  const bodyY = low ? 0.55 : 0.75;
  const bodyL = long ? 5.4 : low ? 4.6 : 4.3;
  const bodyW = long ? 2.3 : 2.0;

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), paint);
  body.position.y = bodyY;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW - 0.35, low ? 0.5 : 0.7, long ? 2.2 : 2.0),
    kind === 'van' ? paint : glass,
  );
  cabin.position.set(0, bodyY + bodyH / 2 + (low ? 0.25 : 0.35), long ? 0.9 : -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.4), paint);
    spoiler.position.set(0, 1.15, -bodyL / 2 + 0.25);
    group.add(spoiler);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.1, 0.18, bodyL), paint);
    skirt.position.y = 0.32;
    group.add(skirt);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xa08000, emissiveIntensity: 0.5 }));
    sign.position.set(0, bodyY + bodyH / 2 + 0.85, -0.15);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4 }));
    bar.position.set(0, bodyY + bodyH / 2 + 0.8, -0.15);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2 }));
    red.position.set(-0.28, bodyY + bodyH / 2 + 0.95, -0.15);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x0020ff, emissiveIntensity: 2 }));
    blue.position.set(0.28, bodyY + bodyH / 2 + 0.95, -0.15);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.02, 0.3, bodyL * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    stripe.position.y = bodyY;
    group.add(stripe);
  }

  // Headlights and taillights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 1.5 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xaa0000, emissiveIntensity: 1.2 });
  for (const sx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    head.position.set(sx, bodyY + 0.1, bodyL / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    tail.position.set(sx, bodyY + 0.1, -bodyL / 2 - 0.02);
    group.add(tail);
  }

  // Chrome bumpers front and rear (low metalness: with no env map, high-metal
  // materials render near-black), and a glass windshield on vans
  // (their cabin is painted, so without it the van reads as a solid block).
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.35, metalness: 0.35 });
  for (const bz of [bodyL / 2 + 0.08, -bodyL / 2 - 0.08]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.06, 0.22, 0.3), chromeMat);
    bumper.position.set(0, 0.42, bz);
    group.add(bumper);
  }
  const cabinY = bodyY + bodyH / 2 + (low ? 0.25 : 0.35);
  if (kind === 'van') {
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.4, 0.7, 0.1), glass);
    windshield.position.set(0, cabinY, 0.9 + 1.12);
    group.add(windshield);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Group();
    const tyreMesh = new THREE.Mesh(wheelGeo, tyre);
    const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8), hub);
    hubMesh.rotation.z = Math.PI / 2;
    wheel.add(tyreMesh);
    wheel.add(hubMesh);
    wheel.position.set(wx, 0.38, wz * (long ? 1.15 : 1));
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.bodyLength = bodyL;
  return group;
}

// --- Traffic: cars cruising the grid, turning at intersections, queuing behind traffic.
export function createTraffic(scene, rng, colliders, count = 16) {
  const cars = [];
  const kinds = ['sedan', 'sedan', 'taxi', 'van', 'sports'];
  for (let i = 0; i < count; i++) {
    const kind = pick(rng, kinds);
    const color = kind === 'taxi' ? 0xf2c200 : pick(rng, TRAFFIC_COLORS);
    const model = makeCarModel(kind, color);
    scene.add(model);
    const street = pick(rng, STREETS);
    const alongStreet = Math.random() < 0.5;
    const x = alongStreet ? range(rng, -320, 320) : street;
    const z = alongStreet ? street : range(rng, -320, 320);
    const heading = alongStreet ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    cars.push({
      model, kind, x, z, heading,
      speed: range(rng, 7, 11),
      cruise: range(rng, 7, 11),
      target: null,
      wait: 0,
      alive: true,
    });
  }

  function pickNextTarget(car) {
    // Snap to the nearest intersection ahead, then choose a street to follow.
    const aheadX = car.x + Math.sin(car.heading) * 40;
    const aheadZ = car.z + Math.cos(car.heading) * 40;
    let best = null;
    let bd = Infinity;
    for (const s of STREETS) {
      for (const t of STREETS) {
        const d = (s - aheadX) ** 2 + (t - aheadZ) ** 2;
        if (d < bd) { bd = d; best = { x: s, z: t }; }
      }
    }
    return best;
  }

  function update(dt, playerX, playerZ, otherCars) {
    for (const car of cars) {
      if (!car.alive) continue;
      if (!car.target) car.target = pickNextTarget(car);
      const dx = car.target.x - car.x;
      const dz = car.target.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        car.target = pickNextTarget(car);
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      // Queue behind a car directly ahead.
      let blocked = false;
      for (const o of otherCars) {
        if (o === car || !o.alive) continue;
        const ox = o.x - car.x;
        const oz = o.z - car.z;
        const forward = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
        const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
        if (forward > 0 && forward < 8 && side < 2.4) { blocked = true; break; }
      }
      car.speed += ((blocked ? 0 : car.cruise) - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // Keep inside the city; respawn far from the player when too far away.
      const dp = Math.hypot(car.x - playerX, car.z - playerZ);
      if (dp > 260) {
        const street = pick(rng, STREETS);
        const alongStreet = Math.random() < 0.5;
        car.x = alongStreet ? playerX + range(rng, -160, 160) : street;
        car.z = alongStreet ? street : playerZ + range(rng, -160, 160);
        car.x = Math.max(-330, Math.min(330, car.x));
        car.z = Math.max(-330, Math.min(330, car.z));
        car.target = null;
      }
      car.model.position.set(car.x, 0, car.z);
      car.model.rotation.y = car.heading;
      for (const w of car.model.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
    }
  }

  return {
    cars,
    update,
    nearest(x, z, maxDist) {
      let best = null;
      let bd = maxDist * maxDist;
      for (const car of cars) {
        if (!car.alive) continue;
        const d = (car.x - x) ** 2 + (car.z - z) ** 2;
        if (d < bd) { bd = d; best = car; }
      }
      return best;
    },
    remove(car) {
      car.alive = false;
      car.model.visible = false;
    },
    restore(car) {
      car.alive = true;
      car.model.visible = true;
    },
  };
}
