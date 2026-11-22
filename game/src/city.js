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

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWindowTexture(rng, base, litRatio, cols = 5, rows = 10) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Emissive map: black everywhere except the lit windows, so only they glow.
  const e = document.createElement('canvas');
  e.width = 128;
  e.height = 256;
  const eg = e.getContext('2d');
  eg.fillStyle = '#000000';
  eg.fillRect(0, 0, 128, 256);
  const cw = 128 / cols;
  const rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < litRatio;
      const wx = col * cw + cw * 0.18;
      const wy = r * rh + rh * 0.2;
      const ww = cw * 0.64;
      const wh = rh * 0.55;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#2c3e50' : '#5a7a94');
      g.fillRect(wx, wy, ww, wh);
      if (lit) {
        eg.fillStyle = '#ffca66';
        eg.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const emissiveTex = new THREE.CanvasTexture(e);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  return { map: tex, emissiveMap: emissiveTex };
}

function makeGroundTexture(rng) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const toPx = (v) => ((v + WORLD.half + 20) / (WORLD.half * 2 + 40)) * S;
  // Sidewalk base (brightened so the on-foot foreground reads with
  // visible tile seams at distance; road contrast untouched).
  g.fillStyle = '#b8b4a8';
  g.fillRect(0, 0, S, S);
  // Sidewalk tile seams (drawn before roads/parks/beach paint over them).
  g.strokeStyle = 'rgba(60,58,50,0.30)';
  g.lineWidth = 2;
  for (let v = 0; v <= S; v += 20) {
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, S); g.stroke();
    g.beginPath(); g.moveTo(0, v); g.lineTo(S, v); g.stroke();
  }
  // Beach sand at the south edge.
  g.fillStyle = '#e8d29a';
  g.fillRect(0, toPx(WORLD.beachZ), S, S - toPx(WORLD.beachZ));
  // Wet-sand band where the water meets the beach.
  g.fillStyle = '#cba96f';
  g.fillRect(0, toPx(328), S, toPx(336) - toPx(328));
  g.fillStyle = '#a8894f';
  g.fillRect(0, toPx(336) - 1, S, 3);
  // Sparse shells and footprints on the sand.
  for (let i = 0; i < 46; i++) {
    g.fillStyle = rng() < 0.5 ? '#fff8e0' : '#e8b8a0';
    g.beginPath();
    g.arc(toPx(range(rng, -340, 340)), toPx(range(rng, 302, 356)), range(rng, 0.8, 1.8), 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 26; i++) {
    const fx = toPx(range(rng, -320, 320));
    const fy = toPx(range(rng, 304, 330));
    g.fillStyle = 'rgba(120,95,55,0.35)';
    g.beginPath(); g.ellipse(fx, fy, 2.2, 1.4, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(fx + 3, fy + 2.5, 2.2, 1.4, 0, 0, Math.PI * 2); g.fill();
  }
  // A couple of grass parks.
  g.fillStyle = '#7fae62';
  g.fillRect(toPx(-200), toPx(-200), toPx(-120) - toPx(-200), toPx(-120) - toPx(-200));
  g.fillRect(toPx(120), toPx(40), toPx(200) - toPx(120), toPx(120) - toPx(40));
  // Grass tufts and a worn path through each park.
  for (const [px, pz, pw, ph] of [[-200, -200, 80, 80], [120, 40, 80, 80]]) {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(60,110,45,0.5)' : 'rgba(160,190,110,0.5)';
      g.fillRect(toPx(px + rng() * pw), toPx(pz + rng() * ph), 2, 2);
    }
    g.fillStyle = 'rgba(210,190,140,0.7)';
    g.fillRect(toPx(px + pw / 2 - 3), toPx(pz), 5, toPx(pz + ph) - toPx(pz));
  }
  // Roads (brightened so shadowed asphalt reads as dark grey, never
  // near-black; still well below the sidewalk and lane markings).
  g.fillStyle = '#4b4f57';
  for (const s of STREETS) {
    g.fillRect(toPx(s - WORLD.streetHalf), 0, toPx(s + WORLD.streetHalf) - toPx(s - WORLD.streetHalf), S);
    g.fillRect(0, toPx(s - WORLD.streetHalf), S, toPx(s + WORLD.streetHalf) - toPx(s - WORLD.streetHalf));
  }
  // Asphalt speckle.
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
    g.fillRect(rng() * S, rng() * S, 1.6, 1.6);
  }
  // Solid edge lines along each road.
  g.fillStyle = 'rgba(216,212,200,0.75)';
  for (const s of STREETS) {
    g.fillRect(toPx(s - WORLD.streetHalf + 0.7), 0, 2, S);
    g.fillRect(toPx(s + WORLD.streetHalf - 0.7) - 2, 0, 2, S);
    g.fillRect(0, toPx(s - WORLD.streetHalf + 0.7), S, 2);
    g.fillRect(0, toPx(s + WORLD.streetHalf - 0.7) - 2, S, 2);
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

function makeWoodTexture(rng, rows = 8) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const shade = 0.85 + rng() * 0.3;
    g.fillStyle = `rgb(${Math.round(138 * shade)},${Math.round(106 * shade)},${Math.round(68 * shade)})`;
    g.fillRect(0, r * rh, 256, rh);
    // Grain streaks along the plank.
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(60,40,20,${0.08 + rng() * 0.12})`;
      g.lineWidth = 1;
      const gy = r * rh + rng() * rh;
      g.beginPath();
      g.moveTo(0, gy);
      g.bezierCurveTo(85, gy + range(rng, -2, 2), 170, gy + range(rng, -2, 2), 256, gy);
      g.stroke();
    }
    // Plank seam + staggered butt joint.
    g.fillStyle = 'rgba(40,26,12,0.85)';
    g.fillRect(0, r * rh, 256, 2);
    g.fillRect((r * 97) % 256, r * rh, 2, rh);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createCity(scene, rng, opts = {}) {
  const shadows = opts.shadows !== false;
  const colliders = [];
  const intersections = [];
  for (const sx of STREETS) for (const sz of STREETS) intersections.push({ x: sx, z: sz });

  // Sky: a vertical gradient dome (warm haze at the horizon, deep blue up top)
  // instead of a flat background color, plus a visible sun disc with glow.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 32;
  skyCanvas.height = 512;
  const sg = skyCanvas.getContext('2d');
  const skyGrad = sg.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0, '#2a63a8');
  skyGrad.addColorStop(0.4, '#5ea9e0');
  skyGrad.addColorStop(0.65, '#8ec8ee');
  skyGrad.addColorStop(0.85, '#ffd9a0');
  skyGrad.addColorStop(1, '#ffe9bb');
  sg.fillStyle = skyGrad;
  sg.fillRect(0, 0, 32, 512);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(950, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(skyDome);
  scene.background = null;
  scene.fog = new THREE.Fog(0xd8c9a8, 220, 700);
  const glowTex = makeGlowTexture();
  // Sun disc + glow placed along the true light direction (lowered to a
  // golden-hour angle so the disc actually sits in the sky you can see).
  const sunDir = new THREE.Vector3(170, 130, 110).normalize();
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffdf8a, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunGlow.scale.set(380, 380, 1);
  sunGlow.position.copy(sunDir).multiplyScalar(860);
  scene.add(sunGlow);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfffbe8, transparent: true, opacity: 1,
    depthWrite: false, fog: false,
  }));
  sunCore.scale.set(110, 110, 1);
  sunCore.position.copy(sunDir).multiplyScalar(850);
  scene.add(sunCore);

  // Hemisphere lifted (0.95 -> 1.15) and ground tint lightened so shadowed
  // facades and roads never go near-black; a weak cool fill from the
  // opposite side of the sun (no shadows) lifts the faces the warm sun
  // cannot reach. Sun elevation raised (y 95 -> 130) to shorten the
  // extreme long shadows while keeping the warm golden-hour angle.
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0xa89a78, 1.15);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.65);
  fill.position.set(-170, 120, -110);
  scene.add(fill);
  scene.add(fill.target);
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
  sun.position.set(170, 130, 110);
  sun.castShadow = shadows;
  const shadowRes = opts.softwareGL ? 1024 : 2048;
  const shadowBox = opts.softwareGL ? 130 : 170;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  sun.shadow.camera.left = -shadowBox;
  sun.shadow.camera.right = shadowBox;
  sun.shadow.camera.top = shadowBox;
  sun.shadow.camera.bottom = -shadowBox;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.4;
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

  // Ocean: animated in main loop via map offset. Procedural wave texture so the
  // water reads as moving, not a flat colour plane.
  const waveCanvas = document.createElement('canvas');
  waveCanvas.width = 256;
  waveCanvas.height = 256;
  const wg = waveCanvas.getContext('2d');
  wg.fillStyle = '#1e7fa8';
  wg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    wg.strokeStyle = `rgba(120,205,235,${0.2 + rng() * 0.3})`;
    wg.lineWidth = 1 + rng() * 2.5;
    const y0 = rng() * 256;
    wg.beginPath();
    wg.moveTo(-10, y0);
    wg.bezierCurveTo(60, y0 + range(rng, -14, 14), 180, y0 + range(rng, -14, 14), 266, y0 + range(rng, -8, 8));
    wg.stroke();
  }
  for (let i = 0; i < 220; i++) {
    wg.fillStyle = `rgba(160,220,240,${0.1 + rng() * 0.2})`;
    wg.fillRect(rng() * 256, rng() * 256, 2, 1.4);
  }
  const waveTex = new THREE.CanvasTexture(waveCanvas);
  waveTex.colorSpace = THREE.SRGBColorSpace;
  waveTex.wrapS = THREE.RepeatWrapping;
  waveTex.wrapT = THREE.RepeatWrapping;
  waveTex.repeat.set(12, 3);
  const oceanMat = new THREE.MeshStandardMaterial({ map: waveTex, roughness: 0.22, metalness: 0.25, transparent: true, opacity: 0.94 });
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
    makeWindowTexture(rng, '#c4b8a8', 0.3, 4, 12),
    makeWindowTexture(rng, '#a8b8c4', 0.15, 6, 9),
  ];
  const blockCenters = [];
  for (let i = 0; i < WORLD.avenueCount - 1; i++) {
    for (let j = 0; j < WORLD.avenueCount - 1; j++) {
      blockCenters.push({ x: -280 + i * WORLD.block, z: -280 + j * WORLD.block });
    }
  }
  const parks = [{ x: -160, z: -160 }, { x: 160, z: 80 }];
  const buildingSpots = [[], [], [], [], []]; // per texture variant: {x,y,z,w,h,d}
  const roofColors = [0x6a6a66, 0x8a5a44, 0x4a4a50];
  const roofSpots = [[], [], []];
  const acSpots = [];
  const tankSpots = [];
  const antennaSpots = [];
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
      const variant = rangeInt(rng, 0, 4);
      buildingSpots[variant].push({ x, y: h / 2, z, w, h, d });
      roofSpots[rangeInt(rng, 0, 2)].push({ x, y: h + 0.6, z, w: w + 1, h: 1.2, d: d + 1 });
      // Rooftop clutter: AC boxes, water tanks, antennae.
      if (chance(rng, 0.55)) acSpots.push({ x: x + range(rng, -w / 4, w / 4), y: h + 1.8, z: z + range(rng, -d / 4, d / 4), w: 2.6, h: 1.2, d: 2 });
      if (chance(rng, 0.55)) acSpots.push({ x: x + range(rng, -w / 4, w / 4), y: h + 1.8, z: z + range(rng, -d / 4, d / 4), w: 2.6, h: 1.2, d: 2 });
      if (chance(rng, 0.22)) tankSpots.push({ x: x + range(rng, -w / 4, w / 4), y: h + 2.4, z: z + range(rng, -d / 4, d / 4), w: 2.2, h: 2.4, d: 2.2 });
      if (chance(rng, 0.28)) antennaSpots.push({ x: x + w / 2 - 1.5, y: h + 4, z: z + d / 2 - 1.5, w: 0.25, h: 6, d: 0.25 });
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
      map: windowTexes[i].map,
      emissiveMap: windowTexes[i].emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0.4,
      color: pick(rng, PALETTE.building),
      roughness: 0.85,
    });
    fillInstances(new THREE.InstancedMesh(boxGeo, mat, spots.length), spots);
  });
  roofSpots.forEach((spots, i) => {
    if (!spots.length) return;
    fillInstances(
      new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ color: roofColors[i], roughness: 0.9 }), spots.length),
      spots,
    );
  });
  // Rooftop clutter, all instanced: AC boxes, water tanks, antennae.
  if (acSpots.length) {
    fillInstances(
      new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.7, metalness: 0.3 }), acSpots.length),
      acSpots,
    );
  }
  if (tankSpots.length) {
    fillInstances(
      new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x5a6a72, roughness: 0.6, metalness: 0.4 }), tankSpots.length),
      tankSpots,
    );
  }
  if (antennaSpots.length) {
    fillInstances(
      new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.7 }), antennaSpots.length),
      antennaSpots,
    );
  }

  // Landmark towers on Bayfront so the skyline reads at a glance.
  const towerMat = new THREE.MeshStandardMaterial({ map: windowTexes[1].map, emissiveMap: windowTexes[1].emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.4, color: 0x9fb8c8, roughness: 0.6, metalness: 0.25 });
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
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 1.8 });
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
  // One additive Points cloud for every lamp halo: a single draw call, soft glow.
  const lampGlowPos = new Float32Array(lightSpots.length * 3);
  lightSpots.forEach((p, i) => {
    lampGlowPos[i * 3] = p.x;
    lampGlowPos[i * 3 + 1] = 7.1;
    lampGlowPos[i * 3 + 2] = p.z;
  });
  const lampGlowGeo = new THREE.BufferGeometry();
  lampGlowGeo.setAttribute('position', new THREE.BufferAttribute(lampGlowPos, 3));
  const lampGlow = new THREE.Points(lampGlowGeo, new THREE.PointsMaterial({
    size: 6, map: glowTex, transparent: true, opacity: 0.55, color: 0xffd76a,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(lampGlow);

  // Drifting clouds: varied size, puff count and opacity so no two look alike.
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: range(rng, 0.5, 0.9) });
    const cloud = new THREE.Group();
    const puffs = rangeInt(rng, 3, 5);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      puff.position.set(j * 9 - ((puffs - 1) * 9) / 2, range(rng, -1, 1), range(rng, -3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(range(rng, -340, 340), range(rng, 90, 130), range(rng, -340, 200));
    cloud.scale.setScalar(range(rng, 0.8, 1.7));
    scene.add(cloud);
    clouds.push(cloud);
  }

  // --- Solmar Pier, marina boats and the beach boardwalk (south edge). ---
  // Pier: deck x 33..47, z 330..430, top y=0.35. Starts south of the z=320 road
  // (spans 313..327) so it never blocks the beach boulevard or the drive shot.
  const pierWoodTex = makeWoodTexture(rng, 8);
  pierWoodTex.repeat.set(1, 8);
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.7, 100),
    new THREE.MeshStandardMaterial({ map: pierWoodTex, roughness: 0.9 }),
  );
  pierDeck.position.set(40, 0, 380);
  pierDeck.castShadow = shadows;
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);
  // Support posts: r=0.45, y -0.6..0.35, at x=34.5/45.5.
  const pierPostSpots = [];
  for (const px of [34.5, 45.5]) {
    for (const pz of [335, 360, 385, 410, 425]) pierPostSpots.push({ x: px, y: -0.125, z: pz, w: 1, h: 1, d: 1 });
  }
  fillInstancesRot(
    new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.95, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
      pierPostSpots.length,
    ),
    pierPostSpots,
  );
  // Railing: posts along both deck edges every 10 units + a thin top rail bar.
  const railSpots = [];
  for (const rx of [33.2, 46.8]) {
    for (let rz = 330; rz <= 430; rz += 10) railSpots.push({ x: rx, y: 0.9, z: rz, w: 0.18, h: 1.1, d: 0.18 });
  }
  fillInstances(
    new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }), railSpots.length),
    railSpots,
  );
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  for (const rx of [33.2, 46.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 100), railMat);
    rail.position.set(rx, 1.15, 380);
    rail.castShadow = shadows;
    scene.add(rail);
  }
  // 3 lamps on the deck (streetlight style).
  for (const lz of [350, 380, 410]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4, 6), poleMat);
    pole.position.set(45, 2.35, lz);
    pole.castShadow = shadows;
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
    lamp.position.set(45, 4.35, lz);
    scene.add(lamp);
  }
  // Shack at the end of the pier; door faces north (toward the beach).
  const shack = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.5, 5),
    new THREE.MeshStandardMaterial({ color: 0x7a9ab0, roughness: 0.85 }),
  );
  shack.position.set(40, 2.1, 420);
  shack.castShadow = shadows;
  scene.add(shack);
  const shackRoof = new THREE.Mesh(
    new THREE.BoxGeometry(6.6, 0.3, 5.6),
    new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95 }),
  );
  shackRoof.position.set(40, 4.0, 420);
  shackRoof.castShadow = shadows;
  scene.add(shackRoof);
  const shackDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.9 }),
  );
  shackDoor.position.set(40, 1.45, 417.49);
  shackDoor.rotation.y = Math.PI;
  scene.add(shackDoor);
  colliders.push({ minX: 33, maxX: 47, minZ: 330, maxZ: 430 });

  // Marina: 3 sailboats in the water (no colliders — unreachable, z >= 375).
  const boats = [];
  function makeBoat(hullColor) {
    const boat = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.5 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 10), hullMat);
    hull.position.y = 0.5;
    hull.castShadow = shadows;
    boat.add(hull);
    const bowGeo = new THREE.ConeGeometry(2.1, 3, 4);
    bowGeo.rotateY(Math.PI / 4);
    bowGeo.rotateX(Math.PI / 2);
    const bow = new THREE.Mesh(bowGeo, hullMat);
    bow.position.set(0, 0.5, 6.2);
    boat.add(bow);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.2, 2),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.7 }),
    );
    cabin.position.set(0, 1.8, -1);
    cabin.castShadow = shadows;
    boat.add(cabin);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8 }),
    );
    mast.position.set(0, 4.7, 0.5);
    boat.add(mast);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0);
    sailShape.lineTo(0, 5.5);
    sailShape.lineTo(2.4, 0.4);
    sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(
      new THREE.ShapeGeometry(sailShape),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
    );
    sail.rotation.y = Math.PI / 2;
    sail.position.set(0, 2.5, 0.5);
    boat.add(sail);
    return boat;
  }
  const boatDefs = [
    { x: -10, z: 375, heading: 0.3, color: 0xffffff },
    { x: 90, z: 395, heading: -0.2, color: 0x2e6fb0 },
    { x: 120, z: 410, heading: 0.15, color: 0xc0392b },
  ];
  boatDefs.forEach((def, i) => {
    const boat = makeBoat(def.color);
    boat.position.set(def.x, 0, def.z);
    boat.rotation.y = def.heading;
    scene.add(boat);
    boats.push({ group: boat, baseY: 0, phase: i * 2.1 });
  });

  // Boardwalk along the beach: z 296..304, x -340..340, top y=0.1.
  const walkTex = makeWoodTexture(rng, 6);
  walkTex.repeat.set(40, 1);
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(680, 0.2, 8),
    new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 }),
  );
  boardwalk.position.set(0, 0, 300);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);
  // 4 benches at z=292 (seat, back, 2 legs each) + small collider each.
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 });
  const benchLegMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7, metalness: 0.4 });
  for (const bx of [-200, -60, 100, 250]) {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.6), benchMat);
    seat.position.set(0, 0.55, 0);
    seat.castShadow = shadows;
    bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.12), benchMat);
    back.position.set(0, 0.9, -0.26);
    back.castShadow = shadows;
    bench.add(back);
    for (const lx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.5), benchLegMat);
      leg.position.set(lx, 0.275, 0);
      bench.add(leg);
    }
    bench.position.set(bx, 0, 292);
    scene.add(bench);
    colliders.push({ minX: bx - 1.1, maxX: bx + 1.1, minZ: 291.6, maxZ: 292.5 });
  }
  // 3 boardwalk lamps at z=304 (no collider, like streetlight poles).
  for (const lx of [-160, 0, 160]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5, 6), poleMat);
    pole.position.set(lx, 2.6, 304);
    pole.castShadow = shadows;
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
    lamp.position.set(lx, 5.1, 304);
    scene.add(lamp);
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
    boats,
    oceanMat,
    foam,
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
