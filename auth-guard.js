import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  const lastUid = localStorage.getItem("tg_last_user");

  if (lastUid && lastUid !== user.uid) {
    // A different user signed in. Clear session-scoped Firestore-fetch flags so
    // load-onboarding-data.js always fetches fresh data for the new user.
    // No localStorage onboarding data needs clearing because every onboarding key
    // is now UID-scoped (e.g. "tradeGuardianTraderProfile_uid123"), so each user
    // naturally reads only their own keys.
    Object.keys(sessionStorage)
      .filter(k => k.startsWith("tg_fs_loaded_"))
      .forEach(k => sessionStorage.removeItem(k));

    console.log("[TradeGuardian] User changed from", lastUid, "to", user.uid);
  }

  localStorage.setItem("tg_last_user", user.uid);
});
