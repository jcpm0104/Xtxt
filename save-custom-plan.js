import { saveUserData } from "./save-data.js";

const KEY = "tradeGuardianCustomPlan";

function trySave(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object") {
      saveUserData("tradingPlan", data);
    }
  } catch (err) {
    console.error("[TradeGuardian] save-custom-plan.js parse error:", err);
  }
}

const existing = localStorage.getItem(KEY);
if (existing) trySave(existing);

const _original = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
  _original(key, value);
  if (key === KEY) trySave(value);
};
