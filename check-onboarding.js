import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const ref = doc(db, "traders", user.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      window.location.href = "guardian-dashboard.html";
    }

  } catch (err) {
    console.error("[TradeGuardian] onboarding check error:", err);
  }
});
