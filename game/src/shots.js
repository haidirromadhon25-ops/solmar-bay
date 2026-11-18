// shots.js — stages the four screenshot scenes (?shot=chase|drive|mission|onfoot).
// Each one poses the live game — real traffic, police, missions and HUD — and marks
// window.__shotReady once the scene has settled, so the screenshot is a real render.

export function stageShot(name, G) {
  const { police, missions, hud, state } = G;
  state.screen = 'play';
  hud.showScreen('play');
  let finalToast = '';

  if (name === 'chase') {
    // Cover: a 3-star chase — Dash in a sports car, cruisers on his tail, the lot-job
    // mission live, minimap and wanted stars on the HUD.
    G.enterCar(G.parked[0], true);
    G.teleportCar(0, 40, Math.PI, 30);
    police.setStars(3, 0);
    G.placePoliceAhead(3);
    missions.startMission(2, G.missionHooks);
    missions.skipStep(G.missionHooks);
    missions.skipStep(G.missionHooks);
    finalToast = 'The Comet is yours — lose the cops, then park it at the garage.';
  } else if (name === 'drive') {
    // A clean cruise down the beach boulevard in the Comet GT.
    G.enterCar(G.parked[0], true);
    G.teleportCar(-120, 300, Math.PI / 2, 26);
    police.setStars(0, 0);
    missions.startMission(1, G.missionHooks);
    finalToast = 'Package Run — pick up the goods at the Marina.';
  } else if (name === 'mission') {
    // On foot, pistol drawn, the Sharks in the alley, objective beacon overhead.
    G.placePlayer(-84, 96, 0.6);
    G.playerState.armed = true;
    police.setStars(1, 0);
    missions.startMission(3, G.missionHooks);
    missions.skipStep(G.missionHooks);
    finalToast = 'Street Heat — clear out the Sharks. Click to fire.';
  } else {
    // On foot on the beach boulevard: the player, palms, traffic on the shore road
    // and the ocean behind him, minimap and mission marker on the HUD.
    G.placePlayer(20, 296, Math.PI);
    G.playerState.armed = false;
    police.setStars(0, 0);
    missions.startMission(0, G.missionHooks);
    missions.skipStep(G.missionHooks);
    finalToast = 'Wheels Up — steal a car and bring it to the garage on Palm Row.';
  }

  // Drive the world a fixed number of steps and paint once, so the shot is a fully
  // settled render even where requestAnimationFrame is throttled.
  G.stepFrames(50);
  // The car coasts to a stop with no input, so restore its speed for the shot and
  // let the camera settle for a few frames.
  if (G.driving.car.inCar) {
    const c = G.driving.car;
    G.teleportCar(c.x, c.z, c.heading, name === 'chase' ? 30 : 24);
    G.stepFrames(6);
  }
  // Re-show the toast last: module load can take seconds on a slow machine, and the
  // toast's timer starts when it is first shown.
  hud.toast(finalToast, 6000);
  window.__shotReady = true;
}
