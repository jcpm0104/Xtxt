import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const PAGE = window.location.pathname.split("/").pop() || window.location.pathname;

const KEY_MAP = {
  "trader-profile.html":      { section: "profile",       lsKey: "tradeGuardianTraderProfile" },
  "account-rules.html":       { section: "accountRules",  lsKey: "tradeGuardianAccountRules"  },
  "recommended-plans.html":   { section: "recommendedPlan", lsKey: "tradeGuardianActivePlan"  },
  "custom-trading-plan.html": { section: "tradingPlan",   lsKey: "tradeGuardianCustomPlan"    }
};

const config = KEY_MAP[PAGE];
if (!config) {
  console.warn("[TradeGuardian] load-onboarding-data.js: unrecognised page:", PAGE);
}

onAuthStateChanged(auth, async (user) => {
  if (!user || !config) return;

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();
    const sectionData = data[config.section];
    if (!sectionData || typeof sectionData !== "object") return;

    const alreadyInStorage = !!localStorage.getItem(config.lsKey);

    localStorage.setItem(config.lsKey, JSON.stringify(sectionData));

    if (data.profile)      localStorage.setItem("tradeGuardianTraderProfile", JSON.stringify(data.profile));
    if (data.accountRules) localStorage.setItem("tradeGuardianAccountRules",  JSON.stringify(data.accountRules));

    if (!alreadyInStorage) {
      console.log("[TradeGuardian] Prefill: loading saved data from Firestore, reloading page.");
      window.location.reload();
      return;
    }

    if (typeof window.renderStep === "function") {
      window.renderStep();
    }

    console.log("[TradeGuardian] Onboarding page prefilled from Firestore:", PAGE);
  } catch (err) {
    console.error("[TradeGuardian] load-onboarding-data error:", err);
  }
});
