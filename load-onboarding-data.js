import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const PAGE = window.location.pathname.split("/").pop() || window.location.pathname;

const KEY_MAP = {
  "trader-profile.html":      { section: "profile",         lsKeyBase: "tradeGuardianTraderProfile" },
  "account-rules.html":       { section: "accountRules",    lsKeyBase: "tradeGuardianAccountRules"  },
  "recommended-plans.html":   { section: "recommendedPlan", lsKeyBase: "tradeGuardianActivePlan"    },
  "custom-trading-plan.html": { section: "tradingPlan",     lsKeyBase: "tradeGuardianCustomPlan"    }
};

const config = KEY_MAP[PAGE];
if (!config) {
  console.warn("[TradeGuardian] load-onboarding-data.js: unrecognised page:", PAGE);
}

// Mutate an existing in-memory state object in place so all existing references
// (the inline script's const variables) immediately reflect the new data.
function mutateObject(target, source) {
  if (!target || typeof target !== "object") return;
  Object.keys(target).forEach(k => delete target[k]);
  Object.assign(target, source || {});
}

onAuthStateChanged(auth, async (user) => {
  if (!user || !config) return;

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));

    if (!snap.exists()) {
      // Brand-new user — no Firestore data yet; the blank form is correct.
      return;
    }

    const data        = snap.data();
    const uid         = user.uid;
    const sectionData = data[config.section];

    // ── 1. Write Firestore data to UID-scoped localStorage keys ────────────────
    if (sectionData && typeof sectionData === "object") {
      localStorage.setItem(config.lsKeyBase + "_" + uid, JSON.stringify(sectionData));
    }
    if (data.profile)      localStorage.setItem("tradeGuardianTraderProfile_" + uid, JSON.stringify(data.profile));
    if (data.accountRules) localStorage.setItem("tradeGuardianAccountRules_"  + uid, JSON.stringify(data.accountRules));

    // ── 2. Update the in-memory state objects exposed on window ────────────────
    if (window._tg_traderProfile && data.profile) {
      mutateObject(window._tg_traderProfile, data.profile);
    }
    if (window._tg_accountRules && data.accountRules) {
      mutateObject(window._tg_accountRules, data.accountRules);
    }
    if (window._tg_customPlan && config.section === "tradingPlan" && sectionData) {
      mutateObject(window._tg_customPlan, sectionData);
    }

    // ── 3. Re-render the form with the correct user's data ─────────────────────
    if (typeof window.renderStep === "function") {
      window.renderStep();
    }

    console.log("[TradeGuardian] Onboarding page hydrated from Firestore for:", PAGE);
  } catch (err) {
    console.error("[TradeGuardian] load-onboarding-data error:", err);
  }
});
