import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();
    const plan = data.tradingPlan || data.planResult || {};

    if (Object.keys(plan).length === 0) return;

    if (typeof window.tgSetPlanData === "function") {
      window.tgSetPlanData(plan);
      console.log("[TradeGuardian] Custom plan result loaded from Firestore.");
    }
  } catch (err) {
    console.error("[TradeGuardian] load-plan-result error:", err);
  }
});
