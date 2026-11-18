// missions.js — the story job chain. One mission active at a time, steps in order,
// a pulsing 3D beacon over the current objective, timers for the timed jobs, and
// rewards paid in cash. The game (main.js) supplies the world facts through ctx.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

export function createMissions(scene) {
  // Beacon: a glowing pillar plus a floating diamond over the objective.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 30;
  beacon.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xaa7700, emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  diamond.position.y = 9;
  beacon.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.25, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  let missionIndex = 0;
  let stepIndex = 0;
  let active = false;
  let stepTimer = 0;
  let holdTimer = 0;
  let enemiesSpawned = false;
  let targetCarInfo = null;
  let markerPos = null;

  function mission() {
    return MISSIONS[missionIndex] ?? null;
  }
  function step() {
    const m = mission();
    return m ? m.steps[stepIndex] : null;
  }

  function showMarker(x, z) {
    markerPos = { x, z };
    beacon.position.set(x, 0, z);
    beacon.visible = true;
  }
  function hideMarker() {
    markerPos = null;
    beacon.visible = false;
  }

  function startMission(index, hooks) {
    missionIndex = index;
    stepIndex = 0;
    active = true;
    enemiesSpawned = false;
    targetCarInfo = null;
    const m = mission();
    if (!m) { active = false; hideMarker(); return null; }
    hooks.toast(`${m.name} — ${m.giver}: ${m.brief}`);
    hooks.audio.missionStart();
    beginStep(hooks);
    return m;
  }

  function beginStep(hooks) {
    const s = step();
    if (!s) return;
    stepTimer = s.timer ?? 0;
    holdTimer = 0;
    enemiesSpawned = false;
    if (s.type === 'goto' || s.type === 'holdout' || s.type === 'defeat' || s.type === 'steal-target') {
      showMarker(s.pos[0], s.pos[1]);
    } else if (s.type === 'steal') {
      hideMarker();
    } else if (s.type === 'escape') {
      hideMarker();
    }
    if (s.type === 'steal-target') {
      targetCarInfo = hooks.spawnTargetCar(s.pos[0], s.pos[1], s.carColor, s.carKind);
    }
    if (s.type === 'defeat') {
      hooks.spawnEnemies(s.pos[0], s.pos[1], s.enemies);
      enemiesSpawned = true;
    }
    if (s.type === 'holdout') {
      hooks.raiseWanted(4);
    }
    hooks.onStep(s);
  }

  function completeStep(hooks) {
    stepIndex += 1;
    const m = mission();
    if (stepIndex >= m.steps.length) {
      completeMission(hooks);
    } else {
      hooks.toast(step().text);
      beginStep(hooks);
    }
  }

  function completeMission(hooks) {
    const m = mission();
    active = false;
    hideMarker();
    // Advance first, so the autosave in onMissionComplete records the next job.
    missionIndex += 1;
    hooks.onMissionComplete(m);
    if (missionIndex < MISSIONS.length) {
      setTimeout(() => {
        if (hooks.stillPlaying()) startMission(missionIndex, hooks);
      }, 2500);
    } else {
      hooks.onStoryComplete();
    }
  }

  function failStep(hooks, reason) {
    hooks.toast(reason);
    // Restart the mission from its first step.
    stepIndex = 0;
    beginStep(hooks);
  }

  // Called every frame while playing. ctx carries live world facts.
  function update(dt, ctx, hooks) {
    if (!active) return;
    const s = step();
    if (!s) return;
    beacon.rotation.y += dt * 1.2;
    diamond.position.y = 9 + Math.sin(performance.now() * 0.003) * 0.8;
    const px = ctx.playerX;
    const pz = ctx.playerZ;

    if (s.type === 'goto' || s.type === 'holdout' || s.type === 'defeat') {
      const d = Math.hypot(px - s.pos[0], pz - s.pos[1]);
      if (s.type === 'goto' && d < s.radius) {
        completeStep(hooks);
        return;
      }
      if (s.type === 'holdout') {
        if (d < s.radius) {
          holdTimer += dt;
          if (holdTimer >= s.timer) {
            completeStep(hooks);
            return;
          }
        } else {
          holdTimer = Math.max(0, holdTimer - dt);
        }
      }
      if (s.type === 'defeat' && ctx.enemiesLeft === 0 && enemiesSpawned) {
        completeStep(hooks);
        return;
      }
    }
    if (s.type === 'steal' && ctx.inCar) {
      completeStep(hooks);
      return;
    }
    if (s.type === 'steal-target' && ctx.inTargetCar) {
      hooks.raiseWanted(2);
      completeStep(hooks);
      return;
    }
    if (s.type === 'escape' && ctx.wanted === 0) {
      completeStep(hooks);
      return;
    }
    // Timers: package run counts down; holdout is handled above.
    if (s.timer && s.type === 'goto') {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        failStep(hooks, 'Too slow — the buyer walked. The job restarts.');
        return;
      }
    }
  }

  function currentText(ctx) {
    if (!active) {
      if (missionIndex >= MISSIONS.length) return 'Story complete — Solmar Bay is yours. Free roam!';
      return 'Head to the garage to start the next job.';
    }
    const s = step();
    if (!s) return '';
    let text = s.text;
    if (s.type === 'goto' && s.timer) text += ` — ${Math.ceil(stepTimer)}s`;
    if (s.type === 'holdout') text += ` — ${Math.ceil(s.timer - holdTimer)}s`;
    if (s.type === 'defeat') text += ` — ${ctx.enemiesLeft} left`;
    if (s.type === 'escape') text += ` — wanted ${ctx.wanted}★`;
    return text;
  }

  function distanceToMarker(ctx) {
    if (!markerPos) return null;
    return Math.round(Math.hypot(ctx.playerX - markerPos.x, ctx.playerZ - markerPos.z));
  }

  return {
    startMission,
    update,
    currentText,
    distanceToMarker,
    skipStep(hooks) { if (active) completeStep(hooks); }, // used by screenshot staging only
    get missionIndex() { return missionIndex; },
    get active() { return active; },
    get markerPos() { return markerPos; },
    get stepTimer() { return stepTimer; },
    mission,
    step,
  };
}
