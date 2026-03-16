import { saveUserData } from "./save-data.js";

const WATCHED_KEYS = [
  "tradeGuardianSelectedPlatform",
  "tradeGuardianAccountRules",
  "tg_dashboard_settings",
  "tg_draft_accounts"
];

function buildDashboardState() {
  const state = {};
  for (const key of WATCHED_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { state[key] = JSON.parse(raw); } catch (_) { state[key] = raw; }
    }
  }
  return state;
}

function trySaveDashboard() {
  const state = buildDashboardState();
  if (Object.keys(state).length > 0) {
    saveUserData("dashboard", state);
  }
}

trySaveDashboard();

const _original = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
  _original(key, value);
  if (WATCHED_KEYS.includes(key)) trySaveDashboard();
};
