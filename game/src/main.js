// main.js — Solmar Bay. Boot, the one game loop, and the wiring between every system:
// city, traffic, pedestrians, player, driving, police, combat, missions, HUD, effects,
// audio and saves. ?seed=N fixes the city. ?shot=chase|drive|mission|onfoot stages a
// screenshot scene instead of the title screen and sets window.__shotReady.

import * as THREE from 'three';
import { GAME_TITLE, MISSIONS, ECONOMY, PLAYER, STORY_INTRO, WORLD } from './config.js';
import { createRandom, clamp } from './random.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createCity } from './city.js';
import { makeCarModel, createTraffic } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createDriving } from './driving.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createEffects } from './effects.js';
import { loadSave, saveGame, clearSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

// Adaptive quality: software renderers (SwiftShader in headless Chrome, llvmpipe)
// pay a lot for antialiasing, so the game turns it off there and keeps it on real GPUs.
function isSoftwareGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|softpipe|basic render/i.test(r);
  } catch {
    return true;
  }
}
const softwareGL = isSoftwareGL();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareGL });
renderer.setPixelRatio(softwareGL ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !softwareGL;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(60, 40, 180);

const audio = createAudio();
const input = createInput(canvas);
const city = createCity(scene, rng, { shadows: !softwareGL, softwareGL });
const effects = createEffects(scene);
const traffic = createTraffic(scene, rng, city.colliders, 16);
const peds = createPedestrians(scene, rng, 22);
const player = createPlayer(scene, 200, -240);
const driving = createDriving(scene, rng);
const police = createPolice(scene, rng, city.colliders);
const combat = createCombat(scene, rng, effects);
const missions = createMissions(scene);

for (const [px, pz] of city.pickupSpots) effects.addPickup(px, pz);

// --- Parked cars the player can steal. parked[0] is the orange Comet GT.
const parked = [];
function addParked(kind, color, x, z, heading) {
  const model = makeCarModel(kind, color);
  model.position.set(x, 0, z);
  model.rotation.y = heading;
  scene.add(model);
  const p = { model, kind, color, x, z, heading, taken: false, target: false };
  parked.push(p);
  return p;
}
addParked('sports', 0xff6a00, 216, -236, Math.PI / 2);
addParked('sedan', 0x2e6fb0, 184, -244, Math.PI / 2);
addParked('taxi', 0xf2c200, -44, 84, Math.PI / 2);
addParked('van', 0xd8d8d8, 124, 164, Math.PI / 2);
addParked('sedan', 0x7a4a9a, -204, -76, Math.PI / 2);
addParked('sedan', 0x3a7a4a, 84, 244, Math.PI / 2);
addParked('sports', 0xc0392b, 284, 4, Math.PI / 2);
addParked('sedan', 0xc0a030, -124, -244, -Math.PI / 2);

// --- Game state.
const state = {
  screen: 'title', // title | play | pause | end
  cash: ECONOMY.startCash,
  health: PLAYER.maxHealth,
  carHealth: 100,
  totalEarned: 0,
  bestCash: ECONOMY.startCash,
  completed: [],
  time: 0,
  storyDone: false,
  muted: false,
  endKind: null,
  endFine: 0,
};
let targetCar = null; // the mission-3 Comet GT, once spawned
let lastCrimeAt = -1e9;
let ramCooldown = 0;
let exhaustTimer = 0;
let dustTimer = 0;
let fps = 0;
let frames = 0;
let fpsTimer = 0;
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

function saveNow() {
  saveGame({
    cash: state.cash,
    missionIndex: missions.missionIndex,
    completed: state.completed,
    bestCash: state.bestCash,
    playerX: player.state.x,
    playerZ: player.state.z,
    totalEarned: state.totalEarned,
  });
}

function applySave(data) {
  state.cash = data.cash ?? ECONOMY.startCash;
  state.totalEarned = data.totalEarned ?? 0;
  state.bestCash = data.bestCash ?? state.cash;
  state.completed = data.completed ?? [];
  player.state.x = data.playerX ?? 200;
  player.state.z = data.playerZ ?? -240;
  player.model.position.set(player.state.x, 0, player.state.z);
}

// --- Mission hooks (missions.js calls these; main.js owns the world).
const missionHooks = {
  toast: (msg) => hud.toast(msg),
  audio,
  onStep: () => {},
  spawnTargetCar(x, z, color, kind) {
    const p = addParked(kind, color, x, z, Math.PI / 2);
    p.target = true;
    targetCar = p;
    return p;
  },
  spawnEnemies(x, z, n) {
    for (let i = 0; i < n; i++) {
      combat.spawnEnemy(x + (i % 2 === 0 ? -1 : 1) * (4 + i * 3), z + (i < 2 ? -4 : 5));
    }
  },
  raiseWanted(n) {
    police.addCrime(n, state.time);
    audio.sirenBlip();
  },
  onMissionComplete(m) {
    state.cash += m.reward;
    state.totalEarned += m.reward;
    state.bestCash = Math.max(state.bestCash, state.cash);
    state.completed.push(m.id);
    hud.flashMissionComplete(m.name, m.reward);
    audio.missionDone();
    saveNow();
  },
  onStoryComplete() {
    state.storyDone = true;
    hud.toast('Story complete — Solmar Bay is yours. Free roam, collect cash, cause chaos.');
    saveNow();
  },
  stillPlaying() {
    return state.screen === 'play';
  },
};

// --- HUD.
const hud = createHud({
  onNewGame() {
    clearSave();
    state.cash = ECONOMY.startCash;
    state.health = PLAYER.maxHealth;
    state.totalEarned = 0;
    state.completed = [];
    state.storyDone = false;
    player.state.x = 200;
    player.state.z = -240;
    player.model.position.set(200, 0, -240);
    startPlay(0);
  },
  onContinue() {
    const data = loadSave();
    if (data) applySave(data);
    startPlay(data ? data.missionIndex ?? 0 : 0);
  },
  onResume() {
    state.screen = 'play';
    hud.showScreen('play');
  },
  onSave() {
    saveNow();
    hud.toast('Game saved.');
  },
  onQuitToTitle() {
    saveNow();
    state.screen = 'title';
    hud.showScreen('title');
    hud.setContinueVisible(!!loadSave());
  },
  onRetry() {
    respawn();
  },
  onMute() {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
    hud.toast(state.muted ? 'Sound off.' : 'Sound on.');
  },
});

function startPlay(missionIndex) {
  state.screen = 'play';
  state.health = PLAYER.maxHealth;
  hud.showScreen('play');
  audio.unlock();
  hud.toast(STORY_INTRO, 6000);
  if (missionIndex < MISSIONS.length) missions.startMission(missionIndex, missionHooks);
}

// --- Entering / exiting cars.
function nearestParked(maxDist) {
  let best = null;
  let bd = maxDist * maxDist;
  for (const p of parked) {
    if (p.taken) continue;
    const d = (p.x - player.state.x) ** 2 + (p.z - player.state.z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function enterCar(p, silent) {
  driving.setCar(p.model, p.kind, p.color, p.x, p.z, p.heading);
  driving.car.inCar = true;
  p.taken = true;
  player.model.visible = false;
  state.carHealth = 100;
  if (!silent) {
    const watched = police.activeCruisers().some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 50)
      || peds.nearest(p.x, p.z, 22);
    if (watched) {
      addCrime(1);
      hud.toast('Someone saw you jack that car — the cops are coming!');
    } else {
      hud.toast(`You took the ${p.kind}. Drive!`);
    }
    audio.click();
  }
}

function exitCar() {
  const pos = driving.exitPosition();
  player.state.x = pos.x;
  player.state.z = pos.z;
  player.state.camYaw = driving.car.heading;
  player.model.visible = true;
  player.model.position.set(pos.x, 0, pos.z);
  const c = driving.car;
  driving.car.inCar = false;
  const p = { model: c.model, kind: c.kind, color: c.color, x: c.x, z: c.z, heading: c.heading, taken: false, target: targetCar?.model === c.model };
  parked.push(p);
  audio.click();
}

function teleportCar(x, z, heading, speed) {
  const c = driving.car;
  c.x = x;
  c.z = z;
  c.heading = heading;
  c.speed = speed;
  c.vx = Math.sin(heading) * speed;
  c.vz = Math.cos(heading) * speed;
  c.model.position.set(x, 0, z);
  c.model.rotation.y = heading;
}

function placePlayer(x, z, camYaw) {
  player.state.x = x;
  player.state.z = z;
  player.state.camYaw = camYaw;
  player.state.heading = camYaw;
  player.model.position.set(x, 0, z);
  player.model.rotation.y = camYaw;
}

function placePoliceAhead(n) {
  const c = driving.car;
  for (let i = 0; i < n && i < police.cruisers.length; i++) {
    const cr = police.cruisers[i];
    cr.active = true;
    cr.model.visible = true;
    // Ahead of the player, driving the same way: they look like a roadblock ahead
    // and only turn to chase after the shot is taken.
    const ahead = 50 + i * 20;
    const side = i % 2 === 0 ? -6 : 6;
    cr.x = c.x + Math.sin(c.heading) * ahead - Math.cos(c.heading) * side;
    cr.z = c.z + Math.cos(c.heading) * ahead + Math.sin(c.heading) * side;
    cr.heading = c.heading;
    cr.speed = 12;
    cr.model.position.set(cr.x, 0, cr.z);
    cr.model.rotation.y = cr.heading;
  }
}

// Drive the world a fixed number of steps and paint once: used by screenshot
// staging so a shot is a fully settled render even where rAF is throttled.
function stepFrames(n) {
  for (let i = 0; i < n; i++) update(STEP);
  renderFrame();
}

function addCrime(level) {
  if (state.time - lastCrimeAt < 2.5) return;
  lastCrimeAt = state.time;
  police.addCrime(level, state.time);
}

function respawn() {
  state.health = PLAYER.maxHealth;
  state.carHealth = 100;
  state.screen = 'play';
  hud.showScreen('play');
  if (driving.car.inCar) {
    // The car is impounded; leave it where it is.
    const c = driving.car;
    driving.car.inCar = false;
    parked.push({ model: c.model, kind: c.kind, color: c.color, x: c.x, z: c.z, heading: c.heading, taken: false, target: false });
  }
  placePlayer(236, -240, Math.PI);
  player.model.visible = true;
  hud.toast('Back on the streets. Mama Lou is waiting at the garage.');
}

function endGame(kind) {
  const fine = kind === 'busted' ? ECONOMY.bustedFine : ECONOMY.wastedFine;
  state.cash = Math.max(0, state.cash - fine);
  state.endKind = kind;
  state.endFine = fine;
  state.screen = 'end';
  audio.busted();
  audio.setEngine(0, false);
  hud.showEnd(kind, fine);
  saveNow();
}

// --- The frame.
let last = performance.now();
let accumulator = 0;
const STEP = 1 / 60;
let frameMsEma = 16;
let totalFrames = 0;

function playerPos() {
  return driving.car.inCar
    ? { x: driving.car.x, y: 0, z: driving.car.z }
    : { x: player.state.x, y: player.state.y, z: player.state.z };
}

function update(dt) {
  state.time += dt;
  const inCar = driving.car.inCar;
  const pos = playerPos();
  const speed = inCar ? Math.hypot(driving.car.vx, driving.car.vz) : (player.state.moving ? 6 : 0);

  // Global keys.
  if (input.wasPressed('pause')) {
    if (state.screen === 'play') {
      state.screen = 'pause';
      hud.showScreen('pause');
    } else if (state.screen === 'pause') {
      state.screen = 'play';
      hud.showScreen('play');
    }
  }
  if (input.wasPressed('mute')) {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
    hud.toast(state.muted ? 'Sound off.' : 'Sound on.');
  }
  if (state.screen !== 'play') {
    input.endFrame();
    return;
  }

  // Weapons.
  if (input.wasPressed('weapon1')) player.state.armed = false;
  if (input.wasPressed('weapon2')) player.state.armed = true;
  if (input.wasPressed('reload')) combat.startReload();

  // Enter / exit car.
  if (input.wasPressed('enter')) {
    if (inCar) exitCar();
    else {
      const p = nearestParked(3.6);
      if (p) enterCar(p, false);
      else audio.denied();
    }
  }

  // Shooting (on foot, pistol drawn).
  if (!inCar && player.state.armed && input.isMouseDown()) {
    const result = combat.playerShoot(camera, pos, (enemy, killed) => {
      if (killed) {
        state.cash += 25;
        hud.toast('Shark down — +$25');
        audio.cash();
      }
      addCrime(1);
    });
    if (result === 'hit' || result === 'miss') audio.gunshot();
    else if (result === 'empty') { audio.denied(); hud.toast('Magazine empty — press R to reload.'); }
  }

  // Move the player or the car.
  if (inCar) {
    driving.update(dt, input, city.colliders, traffic.cars, (strength) => {
      audio.crash(strength);
      state.carHealth -= strength * 22;
      if (state.carHealth <= 0) {
        effects.explosion(driving.car.x, 1, driving.car.z);
        audio.crash(1);
        state.health -= 30;
        state.carHealth = 0;
        exitCar();
        hud.toast('Your car is wrecked!');
      }
    });
    // Exhaust puffs from the tailpipe while accelerating; drift dust on handbrake.
    const carSpeed = Math.hypot(driving.car.vx, driving.car.vz);
    exhaustTimer -= dt;
    dustTimer -= dt;
    const rearX = driving.car.x - Math.sin(driving.car.heading) * ((driving.car.model?.userData.bodyLength ?? 4.3) / 2 + 0.3);
    const rearZ = driving.car.z - Math.cos(driving.car.heading) * ((driving.car.model?.userData.bodyLength ?? 4.3) / 2 + 0.3);
    if (input.isDown('forward') && carSpeed > 3 && exhaustTimer <= 0) {
      exhaustTimer = 0.09;
      effects.exhaustSmoke(rearX, 0.45, rearZ);
    }
    if ((input.isDown('handbrake') || input.isDown('jump')) && carSpeed > 8 && dustTimer <= 0) {
      dustTimer = 0.12;
      effects.driftDust(rearX, 0.3, rearZ);
    }
  } else {
    player.update(dt, input, city.colliders);
  }

  // Traffic and pedestrians.
  const others = [...traffic.cars, ...police.cruisers.map((c) => ({ x: c.x, z: c.z, alive: c.active }))];
  if (inCar) others.push({ x: driving.car.x, z: driving.car.z, alive: true });
  traffic.update(dt, pos.x, pos.z, others);
  peds.update(dt, pos.x, pos.z, speed, inCar, () => {
    addCrime(1);
    hud.toast('You hit a pedestrian! The cops were called.');
    audio.crash(0.6);
  });

  // Police.
  ramCooldown = Math.max(0, ramCooldown - dt);
  const policeInfo = police.update(dt, state.time, pos.x, pos.z, inCar, speed, () => endGame('busted'), (dist) => {
    if (ramCooldown > 0) return;
    ramCooldown = 0.5;
    if (inCar) {
      state.carHealth -= 4;
      audio.crash(0.3);
      if (state.carHealth <= 0) {
        effects.explosion(driving.car.x, 1, driving.car.z);
        state.health -= 25;
        exitCar();
        hud.toast('Your car is wrecked!');
      }
    } else {
      state.health -= 4;
      audio.hurt();
    }
  });

  // Combat (enemy AI + tracers).
  combat.update(dt, pos, state.health > 0, (dmg) => {
    state.health -= dmg;
    audio.hurt();
    if (state.health <= 0) endGame('wasted');
  });

  // Missions.
  const ctx = {
    playerX: pos.x,
    playerZ: pos.z,
    inCar,
    inTargetCar: inCar && targetCar !== null && driving.car.model === targetCar.model,
    wanted: police.stars,
    enemiesLeft: combat.aliveEnemies().length,
  };
  missions.update(dt, ctx, missionHooks);

  // Pickups and particles.
  effects.update(dt, pos.x, pos.z, () => {
    state.cash += ECONOMY.pickupCash;
    state.bestCash = Math.max(state.bestCash, state.cash);
    audio.cash();
    hud.toast(`+$${ECONOMY.pickupCash} cash pickup`);
  });

  // Sun shadow follows the player; clouds drift; foam laps the shore; waves scroll.
  const sun = city.sun;
  sun.position.set(pos.x + 170, 130, pos.z + 110);
  sun.target.position.set(pos.x, 0, pos.z);
  sun.target.updateMatrixWorld();
  for (const cloud of city.clouds) {
    cloud.position.x += dt * 1.5;
    if (cloud.position.x > 380) cloud.position.x = -380;
  }
  if (city.oceanMat.map) {
    city.oceanMat.map.offset.x = (state.time * 0.012) % 1;
    city.oceanMat.map.offset.y = (state.time * 0.005) % 1;
  }
  if (city.foam) {
    city.foam.material.opacity = 0.55 + 0.18 * Math.sin(state.time * 1.3);
    city.foam.position.z = WORLD.oceanZ + 2 + Math.sin(state.time * 0.9) * 1.6;
  }

  // Audio: engine and sirens.
  audio.setEngine(inCar ? Math.abs(driving.car.speed) / 50 : 0, inCar);
  audio.setSiren(police.stars > 0, Math.max(0, 1 - policeInfo.nearest / 120));

  // Camera.
  if (inCar) driving.cameraPose(camera, dt);
  else player.cameraPose(camera);

  // HUD.
  const mission = missions.mission();
  hud.update({
    cash: state.cash,
    health: state.health,
    wanted: police.stars,
    missionName: mission ? mission.name : 'Free Roam',
    missionText: missions.currentText(ctx),
    missionDist: missions.distanceToMarker(ctx),
    playerX: pos.x,
    playerZ: pos.z,
    heading: inCar ? driving.car.heading : player.state.heading,
    inCar,
    speedKmh: Math.abs(driving.car.speed) * 3.6,
    armed: player.state.armed,
    ammo: combat.ammo,
    reloading: combat.reloading,
    interactPrompt: !inCar && nearestParked(3.6) ? 'Press E — GET IN THE CAR' : (inCar ? 'Press E — EXIT CAR' : ''),
    bustedProgress: policeInfo.bustedProgress,
    pickups: effects.pickups,
    marker: missions.markerPos,
    enemies: combat.aliveEnemies(),
    traffic: traffic.cars,
    police: police.activeCruisers(),
  }, city, dt);

  input.endFrame();
}

function renderFrame() {
  renderer.render(scene, camera);
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  const rawDt = nowMs - last;
  frameMsEma = frameMsEma * 0.9 + Math.min(rawDt, 2000) * 0.1;
  totalFrames += 1;
  const dtMs = Math.min(250, rawDt);
  last = nowMs;
  fpsTimer += dtMs;
  frames += 1;
  if (fpsTimer >= 1000) {
    fps = frames;
    frames = 0;
    fpsTimer = 0;
  }
  if (state.screen === 'play' || shotName) {
    accumulator += dtMs / 1000;
    let steps = 0;
    while (accumulator >= STEP && steps < 10) {
      update(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 10) accumulator = 0;
  } else {
    // Title screen: slow orbit over the city.
    const t = nowMs * 0.00005;
    camera.position.set(Math.sin(t) * 260, 90, Math.cos(t) * 260);
    camera.lookAt(0, 10, 0);
  }
  renderFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for automated play-testing (never used by the game itself).
window.__game = {
  get screen() { return state.screen; },
  get wanted() { return police.stars; },
  get cash() { return state.cash; },
  get health() { return state.health; },
  get missionIndex() { return missions.missionIndex; },
  get missionName() { return missions.mission()?.name ?? 'Free Roam'; },
  get stepText() { return missions.step()?.text ?? ''; },
  get playerX() { return playerPos().x; },
  get playerZ() { return playerPos().z; },
  get inCar() { return driving.car.inCar; },
  get speed() { return Math.abs(driving.car.speed); },
  get fps() { return fps; },
  get frameMs() { return Math.round(frameMsEma); },
  get frames() { return totalFrames; },
  get drawCalls() { return renderer.info.render.calls; },
  get triangles() { return renderer.info.render.triangles; },
  get time() { return state.time; },
  get errors() { return errors; },
  get seed() { return seed; },
  get title() { return GAME_TITLE; },
  // Test hooks for automated play-testing (the game itself never calls these).
  crime(n) { police.addCrime(n ?? 1, state.time); },
  teleport(x, z) { placePlayer(x, z, player.state.camYaw); },
  teleportCar(x, z, heading) { if (driving.car.inCar) teleportCar(x, z, heading ?? driving.car.heading, 0); },
  enterNearestCar() { const p = nearestParked(30); if (p) enterCar(p, true); return !!p; },
};

// Boot.
hud.setContinueVisible(!!loadSave());
if (shotName) {
  const G = {
    parked, driving, police, combat, missions, hud, state,
    playerState: player.state,
    missionHooks,
    enterCar, teleportCar, placePlayer, placePoliceAhead, stepFrames,
  };
  state.screen = 'play';
  audio.unlock();
  stageShot(shotName, G);
} else {
  hud.showScreen('title');
}
status.textContent = `${GAME_TITLE} loaded.`;
requestAnimationFrame(frame);
