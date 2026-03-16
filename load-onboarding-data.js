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

onAuthStateChanged(auth, async (user) => {
  if (!user || !config) return;

  // Session flag scoped to both the user uid and the section name.
  // Using sessionStorage (tab-scoped, cleared on tab close) means:
  // - The same user in the same tab never reloads more than once per section per session.
  // - A different user in the same tab gets a fresh fetch because their uid produces a
  //   different key that has never been set.
  const sessionKey = `tg_fs_loaded_${config.section}_${user.uid}`;
  const alreadyLoadedThisSession = !!sessionStorage.getItem(sessionKey);

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();
    const sectionData = data[config.section];
    if (!sectionData || typeof sectionData !== "object") return;

    // Capture what the inline script already rendered before we overwrite it.
    const prevData = localStorage.getItem(config.lsKey);
    const newData  = JSON.stringify(sectionData);

    // Always write the authoritative Firestore data for this user.
    localStorage.setItem(config.lsKey, newData);
    if (data.profile)      localStorage.setItem("tradeGuardianTraderProfile", JSON.stringify(data.profile));
    if (data.accountRules) localStorage.setItem("tradeGuardianAccountRules",  JSON.stringify(data.accountRules));

    if (!alreadyLoadedThisSession) {
      // Mark before reloading so the post-reload run does not loop.
      sessionStorage.setItem(sessionKey, "1");

      // Only reload if what the inline script displayed differs from Firestore.
      // If localStorage was already correct there is no need to re-render.
      if (prevData !== newData) {
        console.log("[TradeGuardian] Firestore data written; reloading to display correct data for:", PAGE);
        window.location.reload();
        return;
      }
    }

    // Data is already in sync — just refresh the rendered form if the page supports it.
    if (typeof window.renderStep === "function") {
      window.renderStep();
    }

    console.log("[TradeGuardian] Onboarding page prefilled from Firestore:", PAGE);
  } catch (err) {
    console.error("[TradeGuardian] load-onboarding-data error:", err);
  }
});
