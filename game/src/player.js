// player.js — Danny "Dash" Cole on foot: a low-poly walker with a walk/run cycle,
// a jump, and a pistol draw. The camera orbits him with the mouse; driving is in
// driving.js and takes over when he is in a car.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { resolveCircleColliders } from './city.js';
import { clamp } from './random.js';

export function makePlayerModel() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1f6f4a, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36), jacket);
  body.position.y = 1.08;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
  cap.position.y = 1.74;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
  brim.position.set(0, 1.76, 0.3);
  g.add(brim);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants);
  legL.position.set(-0.16, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.2), jacket);
  armL.position.set(-0.41, 1.08, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.41;
  g.add(armR);
  // Pistol, hidden until drawn.
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.7 }));
  gun.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.7 }));
  grip.position.set(0, -0.12, -0.12);
  gun.add(grip);
  gun.position.set(0.41, 0.82, 0.3);
  gun.visible = false;
  g.add(gun);
  g.userData = { legL, legR, armL, armR, gun, body };
  return g;
}

export function createPlayer(scene, x, z) {
  const model = makePlayerModel();
  scene.add(model);
  const state = {
    model,
    x, z, y: 0,
    vy: 0,
    heading: 0, // where the body faces
    camYaw: 0, // camera orbit
    camPitch: 0.32,
    walkPhase: 0,
    moving: false,
    armed: false,
    onGround: true,
  };

  function update(dt, input, colliders) {
    const mouse = input.consumeMouse();
    state.camYaw -= mouse.dx * 0.0032;
    state.camPitch = clamp(state.camPitch + mouse.dy * 0.0022, -0.15, 0.9);

    const f = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    const s = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const running = input.isDown('run');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    state.moving = f !== 0 || s !== 0;

    if (state.moving) {
      // Move relative to the camera yaw: forward is away from the camera.
      const sin = Math.sin(state.camYaw);
      const cos = Math.cos(state.camYaw);
      let mx = -sin * f + cos * s;
      let mz = -cos * f - sin * s;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      state.x += mx * speed * dt;
      state.z += mz * speed * dt;
      const wantHeading = Math.atan2(mx, mz);
      let dh = wantHeading - state.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      state.heading += dh * Math.min(1, dt * 12);
      state.walkPhase += dt * (running ? 13 : 9);
    }
    // Jump with simple gravity.
    if (input.wasPressed('jump') && state.onGround) {
      state.vy = PLAYER.jumpSpeed;
      state.onGround = false;
    }
    if (!state.onGround) {
      state.vy -= 22 * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) { state.y = 0; state.vy = 0; state.onGround = true; }
    }
    // Building collision (circle push-out).
    const res = resolveCircleColliders(state.x, state.z, PLAYER.radius, colliders);
    state.x = res.x;
    state.z = res.z;
    state.x = clamp(state.x, -350, 350);
    state.z = clamp(state.z, -350, 350);

    const swing = state.moving ? Math.sin(state.walkPhase) * 0.6 : 0;
    const u = model.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = state.armed ? -1.35 : -swing * 0.7;
    u.armR.rotation.x = state.armed ? -1.35 : swing * 0.7;
    u.gun.visible = state.armed;
    model.position.set(state.x, state.y, state.z);
    model.rotation.y = state.heading;
  }

  // Third-person camera: behind and above the player, looking at his head.
  function cameraPose(camera) {
    const dist = 7.5;
    const cx = state.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist;
    const cz = state.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist;
    const cy = state.y + 2 + Math.sin(state.camPitch) * dist;
    camera.position.set(cx, Math.max(1.2, cy), cz);
    camera.lookAt(state.x, state.y + 1.6, state.z);
  }

  return { state, update, cameraPose, model };
}
