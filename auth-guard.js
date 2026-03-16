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
    // A different user is now signed in.
    // Wipe every onboarding localStorage key so the inline scripts on the next
    // page load read empty objects rather than the previous user's answers.
    ONBOARDING_KEYS.forEach(key => localStorage.removeItem(key));

    // Also clear any sessionStorage flags that load-onboarding-data.js set for
    // the previous user, so it will re-fetch Firestore for the new user.
    Object.keys(sessionStorage)
      .filter(k => k.startsWith("tg_fs_loaded_"))
      .forEach(k => sessionStorage.removeItem(k));

    console.log("[TradeGuardian] User changed; stale onboarding data cleared for uid:", lastUid);
  }

  localStorage.setItem("tg_last_user", user.uid);
});
