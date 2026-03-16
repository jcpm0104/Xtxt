import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── Helpers (mirror guardian-dashboard.html logic exactly) ───────────────────

function getAccountSize(accountRules) {
  return Number(accountRules.accountSize || 0);
}

function resolveDollarValue(rawValue, unit, accountRules) {
  const n = Number(rawValue || 0);
  const accountSize = getAccountSize(accountRules);
  if (unit === "%" && accountSize > 0) return (accountSize * n) / 100;
  return n;
}

function getDualDisplay(value, unit, accountSize) {
  const rawValue = Number(value || 0);
  const size = Number(accountSize || 0);
  const dollars = unit === "%" ? size * (rawValue / 100) : rawValue;
  const percent = !size ? 0 : unit === "$" ? (rawValue / size) * 100 : rawValue;
  const moneyText = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(dollars);
  const percentText = `${percent.toFixed(2)}%`;
  return { dollars, percent, moneyText, percentText, display: `${moneyText} (${percentText})` };
}

// Priority: plan.riskPerTrade → plan.riskPerTradeValue{obj} → accountRules.riskPerTradeValue
function computeRiskPerTrade(plan, accountRules) {
  const accountSize = getAccountSize(accountRules);

  if (plan.riskPerTrade !== undefined && plan.riskPerTrade !== null && plan.riskPerTrade !== "") {
    const unit = plan.riskPerTradeMode === "Percentage of account" ? "%" : "$";
    const dual = getDualDisplay(plan.riskPerTrade, unit, accountSize);
    return { value: dual.dollars, percent: dual.percent, text: `${dual.percentText} of balance` };
  }

  if (plan.riskPerTradeValue && typeof plan.riskPerTradeValue === "object") {
    const unit = plan.riskPerTradeValue.unit || "$";
    const raw = Number(plan.riskPerTradeValue.value || 0);
    const dual = getDualDisplay(raw, unit, accountSize);
    return { value: dual.dollars, percent: dual.percent, text: `${dual.percentText} of balance` };
  }

  if (
    accountRules.riskPerTradeValue !== undefined &&
    accountRules.riskPerTradeValue !== null &&
    accountRules.riskPerTradeValue !== ""
  ) {
    const unit = accountRules.riskPerTradeMode === "Percentage of account" ? "%" : "$";
    const dual = getDualDisplay(accountRules.riskPerTradeValue, unit, accountSize);
    return { value: dual.dollars, percent: dual.percent, text: `${dual.percentText} of balance` };
  }

  return { value: 0, percent: 0, text: "No plan loaded yet" };
}

// Priority: accountRules.dailyLossLimit → plan.dailyLossLimit →
//           plan.personalDailyRiskLimit{obj} → plan.maxDailyAccountRiskPercent%
function computeDailyLossLimit(plan, accountRules) {
  if (
    accountRules.dailyLossLimit !== undefined &&
    accountRules.dailyLossLimit !== null &&
    accountRules.dailyLossLimit !== ""
  ) {
    return Number(accountRules.dailyLossLimit || 0);
  }

  if (
    plan.dailyLossLimit !== undefined &&
    plan.dailyLossLimit !== null &&
    plan.dailyLossLimit !== ""
  ) {
    return Number(plan.dailyLossLimit || 0);
  }

  if (
    plan.personalDailyRiskLimit &&
    plan.personalDailyRiskLimit.value !== undefined &&
    plan.personalDailyRiskLimit.value !== null &&
    plan.personalDailyRiskLimit.value !== ""
  ) {
    return resolveDollarValue(
      plan.personalDailyRiskLimit.value,
      plan.personalDailyRiskLimit.unit || "$",
      accountRules
    );
  }

  if (
    plan.maxDailyAccountRiskPercent !== undefined &&
    plan.maxDailyAccountRiskPercent !== null &&
    plan.maxDailyAccountRiskPercent !== "" &&
    getAccountSize(accountRules) > 0
  ) {
    return resolveDollarValue(plan.maxDailyAccountRiskPercent, "%", accountRules);
  }

  return 0;
}

// Priority: accountRules.maxTotalRiskAcrossOpenTrades → plan.maxTotalRiskAcrossOpenTrades{obj}
function computeOpenRiskLimit(plan, accountRules) {
  if (
    accountRules.maxTotalRiskAcrossOpenTrades !== undefined &&
    accountRules.maxTotalRiskAcrossOpenTrades !== null &&
    accountRules.maxTotalRiskAcrossOpenTrades !== ""
  ) {
    return Number(accountRules.maxTotalRiskAcrossOpenTrades || 0);
  }

  if (
    plan.maxTotalRiskAcrossOpenTrades &&
    typeof plan.maxTotalRiskAcrossOpenTrades === "object" &&
    plan.maxTotalRiskAcrossOpenTrades.value !== undefined &&
    plan.maxTotalRiskAcrossOpenTrades.value !== null &&
    plan.maxTotalRiskAcrossOpenTrades.value !== ""
  ) {
    return resolveDollarValue(
      plan.maxTotalRiskAcrossOpenTrades.value,
      plan.maxTotalRiskAcrossOpenTrades.unit || "$",
      accountRules
    );
  }

  return 0;
}

function computeMaxPositions(plan, accountRules) {
  return Number(accountRules.maxOpenTradesAtSameTime || plan.maxOpenPositions || 0);
}

function computeMaxTrades(plan, accountRules) {
  return Number(accountRules.maxTradesPerDay || plan.maxTradesPerDay || 0);
}

// ─── Main: load Firestore → localStorage, then push computed values to dashboard ─

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();

    // Write to localStorage so page-reload also works
    if (data.profile)        localStorage.setItem("tradeGuardianTraderProfile", JSON.stringify(data.profile));
    if (data.accountRules)   localStorage.setItem("tradeGuardianAccountRules",  JSON.stringify(data.accountRules));
    if (data.tradingPlan)    localStorage.setItem("tradeGuardianCustomPlan",     JSON.stringify(data.tradingPlan));
    if (data.recommendedPlan)localStorage.setItem("tradeGuardianActivePlan",     JSON.stringify(data.recommendedPlan));
    if (data.planResult)     localStorage.setItem("tradeGuardianActivePlan",     JSON.stringify(data.planResult));

    if (data.dashboard) {
      const d = data.dashboard;
      if (d.tg_dashboard_settings)         localStorage.setItem("tg_dashboard_settings",          JSON.stringify(d.tg_dashboard_settings));
      if (d.tg_draft_accounts)             localStorage.setItem("tg_draft_accounts",               JSON.stringify(d.tg_draft_accounts));
      if (d.tradeGuardianSelectedPlatform) localStorage.setItem("tradeGuardianSelectedPlatform",   d.tradeGuardianSelectedPlatform);
    }

    // Don't override if the user has manually applied custom settings
    if (!window.TradeGuardianDashboard) return;
    const settings = JSON.parse(localStorage.getItem("tg_dashboard_settings") || "{}");
    if (settings.userHasAppliedSettings) return;

    // Use the same field resolution order the dashboard itself uses
    const accountRules = data.accountRules || {};
    const plan = data.planResult || data.tradingPlan || data.recommendedPlan || {};

    const rpt = computeRiskPerTrade(plan, accountRules);

    window.TradeGuardianDashboard.setRiskUpdate({
      riskPerTrade:        rpt.value,
      riskPerTradePercent: rpt.percent,
      riskPerTradeText:    rpt.text,
      dailyLossLimit:      computeDailyLossLimit(plan, accountRules),
      openRiskLimit:       computeOpenRiskLimit(plan, accountRules),
      maxPositions:        computeMaxPositions(plan, accountRules),
      maxTrades:           computeMaxTrades(plan, accountRules)
    });

    console.log("[TradeGuardian] Dashboard risk metrics loaded from Firestore.");
  } catch (err) {
    console.error("[TradeGuardian] load-dashboard error:", err);
  }
});
