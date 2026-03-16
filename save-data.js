import { auth, db } from "./firebase-init.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Resolves with the current user as soon as auth state is known.
// Uses auth.currentUser directly if already available (synchronous),
// otherwise waits for onAuthStateChanged to fire once.
function getAuthUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      resolve(user);
    });
  });
}

window.addEventListener("tg:save", async (e) => {
  const { section, data, markComplete, onSuccess } = e.detail || {};
  if (!section || data === undefined) return;

  const user = await getAuthUser();

  if (!user) {
    console.error("[TradeGuardian] tg:save: no authenticated user — cannot write to Firestore.");
    return;
  }

  try {
    const ref = doc(db, "traders", user.uid);
    const payload = {
      [section]: data,
      updatedAt: serverTimestamp()
    };
    if (markComplete) {
      payload.onboardingComplete = true;
    }
    await setDoc(ref, payload, { merge: true });
    console.log("[TradeGuardian] Firestore save OK — section:", section, markComplete ? "(onboardingComplete)" : "");
    if (typeof onSuccess === "function") onSuccess();
  } catch (err) {
    console.error("[TradeGuardian] Firestore save error:", err);
  }
});
