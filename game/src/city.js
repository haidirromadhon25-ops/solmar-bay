// city.js — builds Solmar Bay: a grid city on a sunny coast. Ground texture with roads
// and lane markings, procedural buildings with lit windows, palms, streetlights, a beach
// and an animated ocean. Also owns the collision boxes and the road graph traffic uses.

import * as THREE from 'three';
import { STREETS, WORLD } from './config.js';
import { pick, range, rangeInt, chance } from './random.js';

const PALETTE = {
  sky: 0x87c5e8,
  sun: 0xfff2d0,
  sand: 0xe8d29a,
  sidewalk: 0x9a9a92,
  road: 0x3a3d44,
  building: [0xd8c9a8, 0xc9b8a0, 0xb8c4c9, 0xd0a890, 0xa8b8a0, 0xc4b8d0, 0xe0d0b8],
  glass: 0x7fb8d8,
};

function makeWindowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const cols = 5;
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#2c3e50' : '#5a7a94');
      g.fillRect(8 + col * 24, 10 + r * 24, 16, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture(rng) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const toPx = (v) => ((v + WORLD.half + 20) / (WORLD.half * 2 + 40)) * S;
  // Sidewalk base.
  g.fillStyle = '#a8a49a';
  g.fillRect(0, 0, S, S);
  // Beach sand at the south edge.
  g.fillStyle = '#e8d29a';
  g.fillRect(0, toPx(WORLD.beachZ), S, S - toPx(WORLD.beachZ));
  // A couple of grass parks.
  g.fillStyle = '#7fae62';
  g.fillRect(toPx(-200), toPx(-200), toPx(-120) - toPx(-200), toPx(-120) - toPx(-200));
  g.fillRect(toPx(120), toPx(40), toPx(200) - toPx(120), toPx(120) - toPx(40));
  // Roads.
  g.fillStyle = '#3a3d44';
  for (const s of STREETS) {
    g.fillRect(toPx(s - WORLD.streetHalf), 0, toPx(s + WORLD.streetHalf) - toPx(s - WORLD.streetHalf), S);
    g.fillRect(0, toPx(s - WORLD.streetHalf), S, toPx(s + WORLD.streetHalf) - toPx(s - WORLD.streetHalf));
  }
  // Lane dashes.
  g.fillStyle = '#e8e4d8';
  for (const s of STREETS) {
    for (let v = -WORLD.half; v < WORLD.half; v += 24) {
      if (Math.abs(v - Math.round(v / WORLD.block) * WORLD.block) < 12) continue;
      g.fillRect(toPx(s) - 1, toPx(v), 2, 10);
      g.fillRect(toPx(v), toPx(s) - 1, 10, 2);
    }
  }
  // Crosswalks at intersections.
  g.fillStyle = '#d8d4c8';
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(toPx(sx + i * 3) - 1, toPx(sz - WORLD.streetHalf), 2, 4);
        g.fillRect(toPx(sx + i * 3) - 1, toPx(sz + WORLD.streetHalf) - 4, 2, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createCity(scene, rng, opts = {}) {
  const shadows = opts.shadows !== false;
  const colliders = [];
  const intersections = [];
  for (const sx of STREETS) for (const sz of STREETS) intersections.push({ x: sx, z: sz });

  // Sky, sun and fog.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0x9fc8e0, 220, 700);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
  sun.position.set(140, 220, 90);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -130;
  sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130;
  sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // Ground.
  const groundTex = makeGroundTexture(rng);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 40, WORLD.half * 2 + 40),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Ocean (animated in main loop via material offset) and wet sand strip.
  const oceanMat = new THREE.MeshStandardMaterial({ color: 0x1e7fa8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 220), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.15, WORLD.oceanZ + 110);
  ocean.receiveShadow = true;
  scene.add(ocean);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 6),
    new THREE.MeshBasicMaterial({ color: 0xf0f8ff, transparent: true, opacity: 0.7 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.3, WORLD.oceanZ + 2);
  scene.add(foam);

  // Buildings, one to three per block, skipping the beach strip and the two parks.
  // Static geometry is instanced (one draw call per window-texture variant) so the
  // scene stays cheap even on software renderers.
  const windowTexes = [
    makeWindowTexture(rng, '#d8c9a8', 0.22),
    makeWindowTexture(rng, '#b8c4c9', 0.18),
    makeWindowTexture(rng, '#d0a890', 0.25),
  ];
  const blockCenters = [];
  for (let i = 0; i < WORLD.avenueCount - 1; i++) {
    for (let j = 0; j < WORLD.avenueCount - 1; j++) {
      blockCenters.push({ x: -280 + i * WORLD.block, z: -280 + j * WORLD.block });
    }
  }
  const parks = [{ x: -160, z: -160 }, { x: 160, z: 80 }];
  const buildingSpots = [[], [], []]; // per texture variant: {x,y,z,w,h,d}
  const roofSpots = [];
  for (const b of blockCenters) {
    if (b.z >= WORLD.beachZ - 40) continue;
    if (parks.some((p) => Math.abs(p.x - b.x) < 10 && Math.abs(p.z - b.z) < 10)) continue;
    const count = chance(rng, 0.35) ? 1 : 2;
    for (let k = 0; k < count; k++) {
      const w = range(rng, 22, 44);
      const d = range(rng, 22, 44);
      const h = range(rng, 10, 46) * (chance(rng, 0.12) ? 1.8 : 1);
      const ox = count === 1 ? 0 : (k === 0 ? -14 : 14);
      const oz = count === 1 ? 0 : (k === 0 ? -14 : 14);
      const x = b.x + ox + range(rng, -4, 4);
      const z = b.z + oz + range(rng, -4, 4);
      const variant = rangeInt(rng, 0, 2);
      buildingSpots[variant].push({ x, y: h / 2, z, w, h, d });
      roofSpots.push({ x, y: h + 0.6, z, w: w + 1, h: 1.2, d: d + 1 });
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  function fillInstances(mesh, spots) {
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.set(s.w, s.h, s.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  buildingSpots.forEach((spots, i) => {
    if (!spots.length) return;
    const mat = new THREE.MeshStandardMaterial({
      map: windowTexes[i],
      color: pick(rng, PALETTE.building),
      roughness: 0.85,
    });
    fillInstances(new THREE.InstancedMesh(boxGeo, mat, spots.length), spots);
  });
  if (roofSpots.length) {
    fillInstances(
      new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x6a6a66, roughness: 0.9 }), roofSpots.length),
      roofSpots,
    );
  }

  // Landmark towers on Bayfront so the skyline reads at a glance.
  const towerMat = new THREE.MeshStandardMaterial({ map: windowTexes[1], color: 0x9fb8c8, roughness: 0.6, metalness: 0.25 });
  for (const [tx, tz, th] of [[-40, -320, 78], [40, -320, 64], [0, -280, 52]]) {
    const tower = new THREE.Mesh(boxGeo, towerMat);
    tower.scale.set(26, th, 26);
    tower.position.set(tx, th / 2, tz);
    tower.castShadow = shadows;
    scene.add(tower);
    colliders.push({ minX: tx - 13, maxX: tx + 13, minZ: tz - 13, maxZ: tz + 13 });
  }

  // Palm trees along the beach and a few on the boulevards (instanced trunks/fronds).
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3e9a4a, roughness: 0.9, side: THREE.DoubleSide });
  const palmSpots = [];
  for (let x = -320; x <= 320; x += 40) palmSpots.push({ x, z: 312 });
  for (const s of [-160, 0, 160]) for (let z = -280; z <= 200; z += 120) palmSpots.push({ x: s + 10, z });
  const trunkSpots = palmSpots.map((p) => ({ x: p.x, y: 3.5, z: p.z, w: 1, h: 1, d: 1, rz: range(rng, -0.08, 0.08) }));
  const frondSpots = [];
  for (const p of palmSpots) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      frondSpots.push({
        x: p.x + Math.cos(a) * 1.6, y: 7.2, z: p.z + Math.sin(a) * 1.6,
        w: 1, h: 0.35, d: 1, rz: Math.cos(a) * 1.1, rx: -Math.sin(a) * 1.1,
      });
    }
  }
  function fillInstancesRot(mesh, spots) {
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.set(s.w, s.h, s.d);
      dummy.rotation.set(s.rx || 0, 0, s.rz || 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadows;
    scene.add(mesh);
  }
  fillInstancesRot(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat, trunkSpots.length), trunkSpots);
  fillInstancesRot(new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.2, 6), frondMat, frondSpots.length), frondSpots);

  // Streetlights at every other intersection (instanced poles and lamps).
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 0.9 });
  const lightSpots = [];
  for (let i = 0; i < intersections.length; i += 2) {
    const p = intersections[i];
    lightSpots.push({ x: p.x + 9, z: p.z + 9 });
  }
  fillInstancesRot(
    new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), poleMat, lightSpots.length),
    lightSpots.map((p) => ({ x: p.x, y: 3.5, z: p.z, w: 1, h: 1, d: 1 })),
  );
  fillInstancesRot(
    new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat, lightSpots.length),
    lightSpots.map((p) => ({ x: p.x, y: 7.1, z: p.z, w: 1, h: 1, d: 1 })),
  );

  // Drifting clouds.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      puff.position.set(j * 9 - 9, range(rng, -1, 1), range(rng, -3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(range(rng, -340, 340), range(rng, 90, 130), range(rng, -340, 200));
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Cash pickups scattered around the city (gold spinners, collected on touch).
  const pickupSpots = [
    [-240, -160], [-80, -240], [160, -160], [320, -80], [-320, 0], [0, 0],
    [240, 80], [-160, 160], [80, 240], [-320, 240], [160, -320], [-40, 120],
  ];

  return {
    colliders,
    intersections,
    clouds,
    oceanMat,
    sun,
    pickupSpots,
    isOnRoad(x, z) {
      for (const s of STREETS) {
        if (Math.abs(x - s) < WORLD.streetHalf + 1 && Math.abs(z) <= WORLD.half) return true;
        if (Math.abs(z - s) < WORLD.streetHalf + 1 && Math.abs(x) <= WORLD.half) return true;
      }
      return false;
    },
    nearestStreet(x, z) {
      let best = STREETS[0];
      let bd = Infinity;
      for (const s of STREETS) {
        const d = Math.abs(s - x);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
  };
}

// Circle (player/car) vs building AABBs: push the circle out and report the hit normal.
export function resolveCircleColliders(x, z, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        x += dx * push;
        z += dz * push;
      } else {
        // Centre inside the box: shove out along the smallest penetration axis.
        const pl = x - c.minX;
        const pr = c.maxX - x;
        const pt = z - c.minZ;
        const pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - radius;
        else if (m === pr) x = c.maxX + radius;
        else if (m === pt) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  return { x, z, hit };
}
