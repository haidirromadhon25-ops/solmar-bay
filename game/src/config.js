// SOLMAR BAY — an original open-world crime game. All names, characters, places and
// story are invented for this game. Nothing here comes from any commercial game.
// config.js — every tunable number and the story text, in one place.

export const GAME_TITLE = 'SOLMAR BAY';
export const SAVE_KEY = 'solmar-bay-save-v1';

// World layout: a grid city on a sunny coast. Streets run on a grid of step BLOCK,
// the beach and ocean sit at the south edge (high +z).
export const WORLD = {
  half: 360, // city spans -360..360 on x and z
  block: 80, // distance between street centre-lines
  streetHalf: 7, // half-width of a road
  beachZ: 300, // sand starts here
  oceanZ: 336, // water starts here
  avenueCount: 9, // avenues at -320, -240, ... 320
};

export const STREETS = [];
for (let i = 0; i < WORLD.avenueCount; i++) STREETS.push(-320 + i * WORLD.block);

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 11,
  radius: 0.55,
  maxHealth: 100,
  jumpSpeed: 7.5,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 38,
  sportsMaxSpeed: 50,
  maxReverse: 12,
  steerMax: 0.55,
  grip: 5.5, // how fast velocity aligns with heading (lower = driftier)
  radius: 2.3,
};

export const WANTED = {
  maxStars: 5,
  decaySeconds: 26, // seconds with no crime before one star fades
  bustedRange: 2.6,
  bustedHoldSeconds: 1.6,
};

export const ECONOMY = {
  startCash: 120,
  bustedFine: 200,
  wastedFine: 150,
  pickupCash: 50,
};

// Mission catalogue. Each mission is a list of steps; a step is done when the player
// reaches its marker, steals its car, or defeats its enemies. Rewards are paid in cash.
export const MISSIONS = [
  {
    id: 'wheels-up',
    name: '1 · Wheels Up',
    giver: 'Mama Lou',
    brief: 'Mama Lou needs wheels. Jack any parked car on the street and bring it to the garage on Palm Row.',
    reward: 300,
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E', radius: 4 },
      { type: 'goto', text: 'Drive the car to the garage on Palm Row', pos: [240, -240], radius: 7 },
    ],
  },
  {
    id: 'package-run',
    name: '2 · Package Run',
    giver: 'Vince',
    brief: 'Vince has a package for the docks. Pick it up at the Marina, then deliver it to the east docks. Ninety seconds — the buyer does not wait.',
    reward: 500,
    steps: [
      { type: 'goto', text: 'Pick up the package at the Marina', pos: [-240, 240], radius: 7 },
      { type: 'goto', text: 'Deliver the package to the east docks — 90 seconds!', pos: [320, 160], radius: 7, timer: 90 },
    ],
  },
  {
    id: 'lot-job',
    name: '3 · The Lot Job',
    giver: 'Mama Lou',
    brief: 'A Comet GT is sitting in the dealer lot on Coral Avenue. Take it. The lot is watched — expect the Solmar PD to notice. Lose them, then park it at the garage.',
    reward: 900,
    steps: [
      { type: 'steal-target', text: 'Steal the orange Comet GT from the dealer lot', pos: [80, -80], radius: 5, carColor: 0xff6a00, carKind: 'sports' },
      { type: 'escape', text: 'Lose the cops — get your wanted level to zero', radius: 0 },
      { type: 'goto', text: 'Park the Comet at the garage on Palm Row', pos: [240, -240], radius: 7 },
    ],
  },
  {
    id: 'street-heat',
    name: '4 · Street Heat',
    giver: 'Vince',
    brief: 'The Sharks are muscling in on Vince’s corner on 5th and Coral. Go to the alley, show them the door, and make it stick. Bring a pistol — press 2 to draw it, click to fire.',
    reward: 1200,
    steps: [
      { type: 'goto', text: 'Go to the alley on 5th and Coral', pos: [-80, 80], radius: 8 },
      { type: 'defeat', text: 'Clear out the Sharks — 4 of them', pos: [-80, 80], radius: 26, enemies: 4 },
    ],
  },
  {
    id: 'big-score',
    name: '5 · The Big Score',
    giver: 'Mama Lou',
    brief: 'The big one. Hit the Solmar Trust vault on Bayfront, grab the cash, and get to the safehouse on the north edge with the whole city on your tail. Finish this and you own Solmar Bay.',
    reward: 2500,
    steps: [
      { type: 'goto', text: 'Reach the Solmar Trust vault on Bayfront', pos: [0, -320], radius: 8 },
      { type: 'holdout', text: 'Grab the cash — hold the vault for 20 seconds', pos: [0, -320], radius: 14, timer: 20 },
      { type: 'escape', text: 'Escape to the safehouse on the north edge', pos: [0, -320], radius: 0 },
      { type: 'goto', text: 'Reach the safehouse — do not get busted', pos: [-320, -320], radius: 9 },
    ],
  },
];

export const STORY_INTRO =
  'Solmar Bay. Sun, salt, and everybody owes somebody. Danny “Dash” Cole is back after ' +
  'three years away, broke and wanted by the wrong people. Mama Lou runs the garage on ' +
  'Palm Row and still believes in him. Vince moves packages. The Sharks run the streets. ' +
  'Five jobs stand between Dash and owning this city.';

// Street names for the HUD (avenues run north-south, streets east-west).
export const AVENUE_NAMES = ['Harbor', 'Coral', 'Palm', 'Bayfront', '5th', 'Marina', 'Sunset', 'Cielo', 'North'];
export const STREET_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function streetNameAt(x, z) {
  const ax = STREETS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  const az = STREETS.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
  const ai = STREETS.indexOf(ax);
  const zi = STREETS.indexOf(az);
  return `${AVENUE_NAMES[ai] ?? 'Bay'} Ave & ${STREET_NAMES[zi] ?? '1st'} St`;
}
