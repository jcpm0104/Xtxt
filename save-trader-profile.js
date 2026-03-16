import { saveUserData } from "./save-data.js";

const KEY = "tradeGuardianTraderProfile";

function trySave(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object") {
      saveUserData("profile", data);
    }
  } catch (err) {
    console.error("[TradeGuardian] save-trader-profile.js parse error:", err);
  }
}

const existing = localStorage.getItem(KEY);
if (existing) trySave(existing);

const _original = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
  _original(key, value);
  if (key === KEY) trySave(value);
};
