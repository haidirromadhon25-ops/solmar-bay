// input.js — keyboard and mouse state, plus the click-to-lock pointer for the camera.
// Keys are read by action name so the rest of the game never touches key codes.

export const ACTION_FORWARD = 'forward';
export const ACTION_BACK = 'back';
export const ACTION_LEFT = 'left';
export const ACTION_RIGHT = 'right';
export const ACTION_RUN = 'run';
export const ACTION_JUMP = 'jump';
export const ACTION_ENTER = 'enter';
export const ACTION_HANDBRAKE = 'handbrake';
export const ACTION_RELOAD = 'reload';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_WEAPON1 = 'weapon1';
export const ACTION_WEAPON2 = 'weapon2';
export const ACTION_INTERACT = 'interact';

const KEY_MAP = {
  KeyW: ACTION_FORWARD, ArrowUp: ACTION_FORWARD,
  KeyS: ACTION_BACK, ArrowDown: ACTION_BACK,
  KeyA: ACTION_LEFT, ArrowLeft: ACTION_LEFT,
  KeyD: ACTION_RIGHT, ArrowRight: ACTION_RIGHT,
  ShiftLeft: ACTION_RUN, ShiftRight: ACTION_RUN,
  Space: ACTION_JUMP, KeyE: ACTION_ENTER,
  KeyF: ACTION_INTERACT, KeyR: ACTION_RELOAD,
  Escape: ACTION_PAUSE, KeyP: ACTION_PAUSE,
  KeyM: ACTION_MUTE, Digit1: ACTION_WEAPON1, Digit2: ACTION_WEAPON2,
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set(); // consumed once per frame by the game
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let mousePressed = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pointerLocked = false;

  function onKeyDown(e) {
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) pressed.add(action);
    held.add(action);
  }
  function onKeyUp(e) {
    const action = KEY_MAP[e.code];
    if (action) held.delete(action);
  }
  function onMouseMove(e) {
    if (pointerLocked) {
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    } else if (dragging) {
      mouseDX += e.clientX - lastX;
      mouseDY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      mouseDown = true;
      mousePressed = true;
      if (!pointerLocked && document.pointerLockElement !== canvas) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) {
      mouseDown = false;
      dragging = false;
    }
  }
  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  canvas.addEventListener('click', () => {
    try {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    } catch { /* pointer lock is optional; drag-look still works */ }
  });

  return {
    isDown(action) {
      return held.has(action);
    },
    wasPressed(action) {
      return pressed.has(action);
    },
    consumeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    isMouseDown() {
      return mouseDown;
    },
    wasMousePressed() {
      return mousePressed;
    },
    endFrame() {
      pressed.clear();
      mousePressed = false;
    },
    get pointerLocked() {
      return pointerLocked;
    },
  };
}
