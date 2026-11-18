// save.js — localStorage save: cash, mission progress, best score and where the
// player was standing. The game also autosaves when a mission is completed.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      completed: state.completed,
      bestCash: state.bestCash,
      playerX: state.playerX,
      playerZ: state.playerZ,
      totalEarned: state.totalEarned,
      savedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* storage can be off; the game still plays */ }
}
