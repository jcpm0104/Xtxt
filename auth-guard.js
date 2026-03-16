import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const ONBOARDING_KEYS = [
  "tradeGuardianTraderProfile",
  "tradeGuardianAccountRules",
  "tradeGuardianCustomPlan",
  "tradeGuardianActivePlan",
  "tradeGuardianSelectedPlan"
];

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  const lastUid = localStorage.getItem("tg_last_user");

  if (lastUid && lastUid !== user.uid) {
    ONBOARDING_KEYS.forEach(key => localStorage.removeItem(key));
    console.log("[TradeGuardian] User changed; stale onboarding data cleared for previous uid:", lastUid);
  }

  localStorage.setItem("tg_last_user", user.uid);
});
