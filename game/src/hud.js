// hud.js — the DOM HUD: cash, health, wanted stars, mission tracker, street name,
// speed, ammo, toasts, the minimap canvas, and the title / pause / busted screens.
// The 3D world never touches the DOM; main.js feeds this module a state snapshot.

import { STREETS, WORLD, streetNameAt } from './config.js';

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    cash: $('cash'),
    healthFill: $('health-fill'),
    healthNum: $('health-num'),
    wanted: $('wanted'),
    missionName: $('mission-name'),
    missionText: $('mission-text'),
    missionDist: $('mission-dist'),
    street: $('street'),
    speed: $('speed'),
    ammo: $('ammo'),
    toast: $('toast'),
    busted: $('busted-bar'),
    bustedFill: $('busted-fill'),
    crosshair: $('crosshair'),
    interact: $('interact'),
    title: $('screen-title'),
    pause: $('screen-pause'),
    end: $('screen-end'),
    endTitle: $('end-title'),
    endText: $('end-text'),
    help: $('screen-help'),
    complete: $('mission-complete'),
    completeText: $('complete-text'),
    minimap: $('minimap'),
  };
  const mm = el.minimap.getContext('2d');
  let toastTimer = null;
  let toastHideTimer = null;
  let completeTimer = null;
  let mapTimer = 0;

  // Buttons.
  $('btn-new').addEventListener('click', () => callbacks.onNewGame());
  $('btn-continue').addEventListener('click', () => callbacks.onContinue());
  $('btn-help').addEventListener('click', () => showScreen('help'));
  $('btn-help-close').addEventListener('click', () => showScreen('title'));
  $('btn-resume').addEventListener('click', () => callbacks.onResume());
  $('btn-save').addEventListener('click', () => callbacks.onSave());
  $('btn-quit').addEventListener('click', () => callbacks.onQuitToTitle());
  $('btn-retry').addEventListener('click', () => callbacks.onRetry());
  $('btn-mute').addEventListener('click', () => callbacks.onMute());

  function showScreen(name) {
    for (const s of [el.title, el.pause, el.end, el.help]) s.classList.add('hidden');
    el.complete.classList.add('hidden');
    if (name === 'title') el.title.classList.remove('hidden');
    if (name === 'pause') el.pause.classList.remove('hidden');
    if (name === 'end') el.end.classList.remove('hidden');
    if (name === 'help') el.help.classList.remove('hidden');
    el.hud.classList.toggle('hidden', name === 'title' || name === 'help');
  }

  function toast(msg, ms = 4200) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    el.toast.classList.remove('fade');
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.add('fade');
      toastHideTimer = setTimeout(() => el.toast.classList.add('hidden'), 700);
    }, ms);
  }

  function flashMissionComplete(name, reward) {
    el.completeText.textContent = `${name} — complete! +$${reward}`;
    el.complete.classList.remove('hidden');
    clearTimeout(completeTimer);
    completeTimer = setTimeout(() => el.complete.classList.add('hidden'), 3000);
  }

  function stars(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function drawMinimap(state, city) {
    const S = el.minimap.width;
    const toMap = (v) => ((v + WORLD.half) / (WORLD.half * 2)) * S;
    mm.clearRect(0, 0, S, S);
    mm.fillStyle = '#10151c';
    mm.fillRect(0, 0, S, S);
    // Beach and ocean at the bottom (south).
    mm.fillStyle = '#d8c08a';
    mm.fillRect(0, toMap(WORLD.beachZ), S, S - toMap(WORLD.beachZ));
    mm.fillStyle = '#1e7fa8';
    mm.fillRect(0, toMap(WORLD.oceanZ), S, S - toMap(WORLD.oceanZ));
    // Buildings.
    mm.fillStyle = '#4a5058';
    for (const c of city.colliders) {
      mm.fillRect(toMap(c.minX), toMap(c.minZ), toMap(c.maxX) - toMap(c.minX), toMap(c.maxZ) - toMap(c.minZ));
    }
    // Roads.
    mm.strokeStyle = '#7a7f88';
    mm.lineWidth = 2;
    for (const s of STREETS) {
      mm.beginPath();
      mm.moveTo(toMap(s), 0);
      mm.lineTo(toMap(s), S);
      mm.stroke();
      mm.beginPath();
      mm.moveTo(0, toMap(s));
      mm.lineTo(S, toMap(s));
      mm.stroke();
    }
    // Pickups.
    mm.fillStyle = '#ffd23e';
    for (const p of state.pickups) {
      if (p.taken) continue;
      mm.fillRect(toMap(p.x) - 1.5, toMap(p.z) - 1.5, 3, 3);
    }
    // Mission marker (pulsing gold ring).
    if (state.marker) {
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 2;
      mm.fillStyle = '#ffd23e';
      mm.beginPath();
      mm.arc(toMap(state.marker.x), toMap(state.marker.z), pulse, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#fff';
      mm.lineWidth = 1.5;
      mm.stroke();
    }
    // Enemies.
    mm.fillStyle = '#ff3020';
    for (const e of state.enemies) mm.fillRect(toMap(e.x) - 2, toMap(e.z) - 2, 4, 4);
    // Traffic.
    mm.fillStyle = '#e8e8e8';
    for (const t of state.traffic) {
      if (!t.alive) continue;
      mm.fillRect(toMap(t.x) - 1.5, toMap(t.z) - 1.5, 3, 3);
    }
    // Police (flashing blue).
    const blue = Math.sin(performance.now() * 0.01) > 0;
    mm.fillStyle = blue ? '#3050ff' : '#ff2020';
    for (const c of state.police) {
      mm.beginPath();
      mm.arc(toMap(c.x), toMap(c.z), 3.5, 0, Math.PI * 2);
      mm.fill();
    }
    // Player arrow (rotates with heading).
    const px = toMap(state.playerX);
    const pz = toMap(state.playerZ);
    mm.save();
    mm.translate(px, pz);
    mm.rotate(Math.atan2(Math.sin(state.heading), Math.cos(state.heading)));
    mm.fillStyle = '#ffffff';
    mm.strokeStyle = '#111';
    mm.lineWidth = 1.5;
    mm.beginPath();
    mm.moveTo(0, -7);
    mm.lineTo(5, 5);
    mm.lineTo(0, 2.5);
    mm.lineTo(-5, 5);
    mm.closePath();
    mm.fill();
    mm.stroke();
    mm.restore();
  }

  function update(state, city, dt) {
    el.cash.textContent = `$${state.cash.toLocaleString('en-US')}`;
    el.healthFill.style.width = `${Math.max(0, state.health)}%`;
    el.healthFill.style.background = state.health > 50 ? '#37d67a' : state.health > 25 ? '#f5a623' : '#e5484d';
    el.healthNum.textContent = `${Math.ceil(Math.max(0, state.health))}`;
    el.wanted.textContent = stars(state.wanted);
    el.wanted.style.color = state.wanted > 0 ? '#ffd23e' : '#888';
    el.missionName.textContent = state.missionName;
    el.missionText.textContent = state.missionText;
    el.missionDist.textContent = state.missionDist != null ? `${state.missionDist}m` : '';
    el.street.textContent = streetNameAt(state.playerX, state.playerZ);
    el.speed.textContent = state.inCar ? `${Math.round(Math.abs(state.speedKmh))} km/h` : '';
    el.ammo.textContent = state.armed ? (state.reloading ? 'RELOADING…' : `◉ ${state.ammo}/12`) : '';
    el.crosshair.classList.toggle('hidden', !state.armed || state.inCar);
    el.interact.classList.toggle('hidden', !state.interactPrompt);
    if (state.interactPrompt) el.interact.textContent = state.interactPrompt;
    if (state.bustedProgress > 0.02) {
      el.busted.classList.remove('hidden');
      el.bustedFill.style.width = `${state.bustedProgress * 100}%`;
    } else {
      el.busted.classList.add('hidden');
    }
    mapTimer -= dt;
    if (mapTimer <= 0) {
      mapTimer = 0.12;
      drawMinimap(state, city);
    }
  }

  return {
    showScreen,
    toast,
    flashMissionComplete,
    update,
    showEnd(kind, fine) {
      el.endTitle.textContent = kind === 'busted' ? 'BUSTED!' : 'WASTED!';
      el.endText.textContent = kind === 'busted'
        ? `The Solmar PD took you in. Fine: $${fine}. Your car is impounded — on foot again.`
        : `You got taken out on the streets of Solmar Bay. Hospital bill: $${fine}.`;
      showScreen('end');
    },
    setContinueVisible(visible) {
      $('btn-continue').classList.toggle('hidden', !visible);
    },
  };
}
