import { saveUserData } from "./save-data.js";

const SELECTED_KEY = "tradeGuardianSelectedPlan";
const ACTIVE_KEY   = "tradeGuardianActivePlan";

function trySave(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object") {
      saveUserData("recommendedPlan", data);
    }
  } catch (_) {}
}

const existingSelected = localStorage.getItem(SELECTED_KEY);
if (existingSelected) trySave(existingSelected);

const existingActive = localStorage.getItem(ACTIVE_KEY);
if (existingActive) trySave(existingActive);

const _original = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
  _original(key, value);
  if (key === SELECTED_KEY || key === ACTIVE_KEY) trySave(value);
};
