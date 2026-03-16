import { saveUserData } from "./save-data.js";

const _UID       = localStorage.getItem("tg_last_user") || "";
const PLAN_KEY   = "tradeGuardianCustomPlan_"   + _UID;
const ACTIVE_KEY = "tradeGuardianActivePlan_"   + _UID;

function trySavePlanResult(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object") {
      saveUserData("planResult", data);
    }
  } catch (err) {
    console.error("[TradeGuardian] save-plan-result.js parse error:", err);
  }
}

const existingPlan = localStorage.getItem(PLAN_KEY);
if (existingPlan) trySavePlanResult(existingPlan);

const existingActive = localStorage.getItem(ACTIVE_KEY);
if (existingActive) trySavePlanResult(existingActive);

const _original = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
  _original(key, value);
  if (key === ACTIVE_KEY) trySavePlanResult(value);
};
