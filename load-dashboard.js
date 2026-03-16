import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();

    if (data.profile)        localStorage.setItem("tradeGuardianTraderProfile", JSON.stringify(data.profile));
    if (data.accountRules)   localStorage.setItem("tradeGuardianAccountRules",  JSON.stringify(data.accountRules));
    if (data.tradingPlan)    localStorage.setItem("tradeGuardianCustomPlan",     JSON.stringify(data.tradingPlan));
    if (data.recommendedPlan)localStorage.setItem("tradeGuardianActivePlan",     JSON.stringify(data.recommendedPlan));
    if (data.planResult)     localStorage.setItem("tradeGuardianActivePlan",     JSON.stringify(data.planResult));

    if (data.dashboard) {
      const d = data.dashboard;
      if (d.tg_dashboard_settings)          localStorage.setItem("tg_dashboard_settings",            JSON.stringify(d.tg_dashboard_settings));
      if (d.tg_draft_accounts)              localStorage.setItem("tg_draft_accounts",                JSON.stringify(d.tg_draft_accounts));
      if (d.tradeGuardianSelectedPlatform)  localStorage.setItem("tradeGuardianSelectedPlatform",    d.tradeGuardianSelectedPlatform);
    }

    if (!window.TradeGuardianDashboard) return;

    const settings = JSON.parse(localStorage.getItem("tg_dashboard_settings") || "{}");
    if (settings.userHasAppliedSettings) return;

    const accountRules = data.accountRules || {};
    const plan = data.planResult || data.tradingPlan || data.recommendedPlan || {};
    const accountSize = Number(accountRules.accountSize || 0);

    let riskPerTrade = 0;
    let riskPerTradePercent = 0;

    if (accountRules.riskPerTradeValue !== undefined && accountRules.riskPerTradeValue !== null && accountRules.riskPerTradeValue !== "") {
      const isPercent = accountRules.riskPerTradeMode === "Percentage of account";
      const raw = Number(accountRules.riskPerTradeValue || 0);
      riskPerTrade = isPercent && accountSize > 0 ? (accountSize * raw) / 100 : raw;
      riskPerTradePercent = accountSize > 0 ? (riskPerTrade / accountSize) * 100 : 0;
    } else if (plan.riskPerTrade !== undefined) {
      riskPerTrade = Number(plan.riskPerTrade || 0);
      riskPerTradePercent = accountSize > 0 ? (riskPerTrade / accountSize) * 100 : 0;
    }

    const dailyLossLimit = Number(
      accountRules.dailyLossLimit ??
      plan.dailyLossLimit ??
      0
    );

    const maxPositions = Number(
      accountRules.maxOpenTradesAtSameTime ??
      plan.maxOpenPositions ??
      0
    );

    window.TradeGuardianDashboard.setRiskUpdate({
      riskPerTrade,
      riskPerTradePercent,
      dailyLossLimit,
      maxPositions
    });

    console.log("[TradeGuardian] Dashboard data loaded from Firestore.");
  } catch (err) {
    console.error("[TradeGuardian] load-dashboard error:", err);
  }
});
