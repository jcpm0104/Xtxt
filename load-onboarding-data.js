import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const PAGE = window.location.pathname.split("/").pop() || window.location.pathname;

const KEY_MAP = {
  "trader-profile.html":      { section: "profile",         lsKey: "tradeGuardianTraderProfile" },
  "account-rules.html":       { section: "accountRules",    lsKey: "tradeGuardianAccountRules"  },
  "recommended-plans.html":   { section: "recommendedPlan", lsKey: "tradeGuardianActivePlan"    },
  "custom-trading-plan.html": { section: "tradingPlan",     lsKey: "tradeGuardianCustomPlan"    }
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
      // This user has no Firestore document. The inline script already initialised
      // the state objects from localStorage (which auth-guard may have cleared).
      // Nothing to do — the form is correctly blank for a brand-new user.
      return;
    }

    const data = snap.data();
    const sectionData = data[config.section];

    // ── 1. Write authoritative Firestore data to localStorage ──────────────────
    // This ensures a future page reload also shows the correct user's data.
    if (sectionData && typeof sectionData === "object") {
      localStorage.setItem(config.lsKey, JSON.stringify(sectionData));
    }
    if (data.profile)      localStorage.setItem("tradeGuardianTraderProfile", JSON.stringify(data.profile));
    if (data.accountRules) localStorage.setItem("tradeGuardianAccountRules",  JSON.stringify(data.accountRules));

    // ── 2. Update in-memory state objects that the inline scripts already created ─
    // Each page exposes its state object(s) on window so we can mutate them here.
    // Mutating in place means the inline script's const references still work.

    // traderProfile is used on trader-profile.html, recommended-plans.html,
    // and custom-trading-plan.html.
    if (window._tg_traderProfile && data.profile) {
      mutateObject(window._tg_traderProfile, data.profile);
    }

    // accountRules is used on account-rules.html, recommended-plans.html,
    // and custom-trading-plan.html.
    if (window._tg_accountRules && data.accountRules) {
      mutateObject(window._tg_accountRules, data.accountRules);
    }

    // customPlan is used on custom-trading-plan.html only.
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
