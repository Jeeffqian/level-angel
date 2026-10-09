import {RIVAL_NAMES} from './config.js';
import {aiDifficulty} from './ai.js';

export const SINGLE_PLAYER_STORAGE_KEY = 'sunlane-sprint-single-player-v1';
export function normalizeRivalSlots(slots, difficulty = 'normal') {
  return RIVAL_NAMES.map((_, index) => ({
    enabled: slots?.[index]?.enabled !== false,
    difficulty: aiDifficulty(slots?.[index]?.difficulty ?? difficulty),
  }));
}
export function loadRivalSlots() {
  try { return normalizeRivalSlots(JSON.parse(localStorage.getItem(SINGLE_PLAYER_STORAGE_KEY))); }
  catch { return normalizeRivalSlots(); }
}
export function saveRivalSlots(slots) {
  const result = normalizeRivalSlots(slots);
  try { localStorage.setItem(SINGLE_PLAYER_STORAGE_KEY, JSON.stringify(result)); } catch { /* In-memory settings still work. */ }
  return result;
}
