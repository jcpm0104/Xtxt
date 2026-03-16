import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Clear the stored UID on sign-out so that the next page load does not
    // read a stale UID in its inline scripts before auth resolves.
    localStorage.removeItem("tg_last_user");
    window.location.href = "auth.html";
    return;
  }

  const lastUid = localStorage.getItem("tg_last_user");

  if (lastUid && lastUid !== user.uid) {
    // A different user signed in. Remove every localStorage key that was
    // scoped to the previous user (pattern: "<key>_<lastUid>") so that this
    // page's inline scripts, which already ran with the stale lastUid, cannot
    // persist or display the old user's data going forward.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.endsWith("_" + lastUid)) {
        localStorage.removeItem(k);
      }
    }

    // Clear any session-scoped Firestore-fetch flags.
    Object.keys(sessionStorage)
      .filter(k => k.startsWith("tg_fs_loaded_"))
      .forEach(k => sessionStorage.removeItem(k));

    console.log("[TradeGuardian] User changed from", lastUid, "to", user.uid, "— previous user's localStorage data cleared.");
  }

  localStorage.setItem("tg_last_user", user.uid);
});
