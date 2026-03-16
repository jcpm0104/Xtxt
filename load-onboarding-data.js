import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const PAGE = window.location.pathname.split("/").pop() || window.location.pathname;

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();

    if (typeof window.tgSetFormData !== "function") {
      console.warn("[TradeGuardian] load-onboarding-data: window.tgSetFormData not defined on:", PAGE);
      return;
    }

    if (PAGE === "trader-profile.html") {
      if (data.profile && typeof data.profile === "object") {
        window.tgSetFormData(data.profile);
        console.log("[TradeGuardian] Trader profile loaded from Firestore.");
      }
    } else if (PAGE === "account-rules.html") {
      if (data.accountRules && typeof data.accountRules === "object") {
        window.tgSetFormData(data.accountRules);
        console.log("[TradeGuardian] Account rules loaded from Firestore.");
      }
    } else if (PAGE === "recommended-plans.html") {
      window.tgSetFormData({
        profile: (data.profile && typeof data.profile === "object") ? data.profile : {},
        accountRules: (data.accountRules && typeof data.accountRules === "object") ? data.accountRules : {}
      });
      console.log("[TradeGuardian] Recommended plans context loaded from Firestore.");
    } else if (PAGE === "custom-trading-plan.html") {
      window.tgSetFormData({
        customPlan: (data.tradingPlan && typeof data.tradingPlan === "object") ? data.tradingPlan : {},
        selectedPlanMeta: (data.recommendedPlan && typeof data.recommendedPlan === "object") ? data.recommendedPlan
                        : (data.planResult && typeof data.planResult === "object") ? data.planResult
                        : {},
        traderProfile: (data.profile && typeof data.profile === "object") ? data.profile : {},
        accountRules: (data.accountRules && typeof data.accountRules === "object") ? data.accountRules : {}
      });
      console.log("[TradeGuardian] Custom trading plan loaded from Firestore.");
    }
  } catch (err) {
    console.error("[TradeGuardian] load-onboarding-data error:", err);
  }
});
