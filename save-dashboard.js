import { saveUserData } from "./save-data.js";

const UID = localStorage.getItem("tg_last_user") || "";

// Base key names are what Firestore stores (under dashboard.*).
// localStorage keys are the base names plus the UID suffix.
const BASE_KEYS = [
  "tradeGuardianSelectedPlatform",
  "tg_dashboard_settings",
  "tg_draft_accounts"
];

const WATCHED_KEYS = BASE_KEYS.map(k => UID ? k + "_" + UID : k);

function buildDashboardState() {
  const state = {};
  BASE_KEYS.forEach((base, i) => {
    const raw = localStorage.getItem(WATCHED_KEYS[i]);
    if (raw) {
      try { state[base] = JSON.parse(raw); } catch (_) { state[base] = raw; }
    }
  });
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
