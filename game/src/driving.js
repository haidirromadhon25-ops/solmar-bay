// driving.js — arcade car handling for the player's car: acceleration, braking,
// reverse, steering that tightens at low speed, a handbrake drift, building and
// traffic collisions, and the chase camera. Also owns enter/exit and car theft.

import * as THREE from 'three';
import { CAR } from './config.js';
import { makeCarModel } from './vehicles.js';
import { resolveCircleColliders } from './city.js';
import { clamp, angleLerp } from './random.js';

export function createDriving(scene, rng) {
  const car = {
    model: null,
    kind: 'sedan',
    color: 0xc0392b,
    x: 0, z: 0,
    heading: 0,
    speed: 0, // signed forward speed
    vx: 0, vz: 0, // velocity vector (drifts off heading under handbrake)
    steer: 0,
    inCar: false,
    health: 100,
  };
  let cameraYaw = 0;

  function setCar(model, kind, color, x, z, heading) {
    // The old car stays in the world as a parked car; main.js owns scene membership.
    car.model = model;
    car.kind = kind;
    car.color = color;
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    car.health = 100;
    model.position.set(x, 0, z);
    model.rotation.y = heading;
    scene.add(model);
    cameraYaw = heading;
  }

  function spawnParked(kind, color, x, z, heading) {
    const model = makeCarModel(kind, color);
    setCar(model, kind, color, x, z, heading);
    return car;
  }

  function update(dt, input, colliders, trafficCars, onCrash) {
    if (!car.inCar || !car.model) return;
    const maxSpeed = car.kind === 'sports' ? CAR.sportsMaxSpeed : CAR.maxSpeed;
    const fwd = input.isDown('forward') ? 1 : 0;
    const back = input.isDown('back') ? 1 : 0;
    const handbrake = input.isDown('handbrake') || input.isDown('jump');

    if (fwd) {
      car.speed += (car.speed < 0 ? CAR.brake : CAR.accel) * dt;
    } else if (back) {
      car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    } else {
      // Coast: gentle rolling drag, so the car keeps its speed for a while.
      car.speed -= car.speed * 0.5 * dt;
      if (Math.abs(car.speed) < 0.2) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CAR.maxReverse, maxSpeed);

    // Steering: less at speed, more when slow; handbrake loosens the grip.
    const steerTarget = ((input.isDown('left') ? 1 : 0) - (input.isDown('right') ? 1 : 0))
      * CAR.steerMax * clamp(1 - Math.abs(car.speed) / (maxSpeed * 1.4), 0.35, 1);
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 10);
    const dir = car.speed >= 0 ? 1 : -1;
    car.heading += car.steer * (car.speed / maxSpeed) * 2.4 * dt * dir;

    // Velocity follows the heading with a grip factor; handbrake slides.
    const grip = handbrake ? 1.6 : CAR.grip;
    const wantVx = Math.sin(car.heading) * car.speed;
    const wantVz = Math.cos(car.heading) * car.speed;
    car.vx += (wantVx - car.vx) * Math.min(1, dt * grip);
    car.vz += (wantVz - car.vz) * Math.min(1, dt * grip);
    const prevX = car.x;
    const prevZ = car.z;
    car.x += car.vx * dt;
    car.z += car.vz * dt;

    // Buildings.
    const res = resolveCircleColliders(car.x, car.z, CAR.radius, colliders);
    if (res.hit) {
      const impact = Math.hypot(car.vx, car.vz);
      car.x = res.x;
      car.z = res.z;
      // Kill the velocity component into the wall, keep the slide along it.
      const nx = car.x - prevX;
      const nz = car.z - prevZ;
      const nl = Math.hypot(nx, nz) || 1;
      const dot = (car.vx * nx + car.vz * nz) / nl;
      if (dot < 0) {
        car.vx -= (nx / nl) * dot;
        car.vz -= (nz / nl) * dot;
      }
      car.speed *= 0.55;
      if (impact > 9 && onCrash) onCrash(Math.min(1, impact / 30));
    }
    car.x = clamp(car.x, -350, 350);
    car.z = clamp(car.z, -350, 350);

    // Traffic cars: soft circle push, both slow down.
    for (const t of trafficCars) {
      if (!t.alive) continue;
      const dx = car.x - t.x;
      const dz = car.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / d;
        car.x += dx * push * 0.6;
        car.z += dz * push * 0.6;
        t.x -= dx * push * 0.4;
        t.z -= dz * push * 0.4;
        const impact = Math.abs(car.speed);
        car.speed *= 0.7;
        if (impact > 8 && onCrash) onCrash(Math.min(1, impact / 28));
      }
    }

    car.model.position.set(car.x, 0, car.z);
    car.model.rotation.y = car.heading;
    for (const w of car.model.userData.wheels) {
      w.rotation.x += car.speed * dt * 2.4;
    }
    // Front wheels steer visually.
    car.model.userData.wheels[0].rotation.y = car.steer * 0.7;
    car.model.userData.wheels[1].rotation.y = car.steer * 0.7;
  }

  function cameraPose(camera, dt) {
    const dist = 11;
    const height = 4.2;
    cameraYaw = angleLerp(cameraYaw, car.heading, Math.min(1, dt * 3.2));
    const cx = car.x - Math.sin(cameraYaw) * dist;
    const cz = car.z - Math.cos(cameraYaw) * dist;
    camera.position.set(cx, height, cz);
    camera.lookAt(car.x + Math.sin(car.heading) * 6, 1.4, car.z + Math.cos(car.heading) * 6);
  }

  function exitPosition() {
    // Step out on the driver's side.
    return {
      x: car.x - Math.cos(car.heading) * 2.2,
      z: car.z + Math.sin(car.heading) * 2.2,
    };
  }

  return { car, setCar, spawnParked, update, cameraPose, exitPosition };
}
