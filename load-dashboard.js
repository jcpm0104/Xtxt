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

// ─── Main: load Firestore → push computed values to dashboard ─────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, "traders", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();

    const accountRules = data.accountRules || {};
    const plan = data.planResult || data.tradingPlan || data.recommendedPlan || {};
    const dashboardData = data.dashboard || {};
    const settingsStore = dashboardData.settings || {};
    const draftAccounts = Array.isArray(dashboardData.draftAccounts) ? dashboardData.draftAccounts : [];
    const selectedPlatform = dashboardData.selectedPlatform || null;

    if (!window.TradeGuardianDashboard) return;

    // Push account context, draft accounts, settings, and platform into the inline script scope
    const dashboardUpdate = { accountRules, plan, draftAccounts, settingsStore };
    if (selectedPlatform) dashboardUpdate.selectedPlatform = selectedPlatform;
    window.TradeGuardianDashboard.setDashboardUpdate(dashboardUpdate);

    // If the user has manually applied custom settings, use those values for risk metrics
    if (settingsStore.userHasAppliedSettings === true) {
      const accountSize = getAccountSize(accountRules);
      const manualRisk = Number(settingsStore.riskPerTrade || 0);
      const manualPercent = accountSize > 0 ? (manualRisk / accountSize) * 100 : 0;

      window.TradeGuardianDashboard.setRiskUpdate({
        riskPerTrade: manualRisk,
        riskPerTradePercent: manualPercent,
        riskPerTradeText: manualRisk > 0 ? `${manualPercent.toFixed(2)}% of balance` : "No plan loaded yet",
        dailyLossLimit: Number(settingsStore.dailyLossLimit || 0),
        maxPositions: Number(settingsStore.maxPositions || 0),
        openRiskLimit: computeOpenRiskLimit(plan, accountRules),
        maxTrades: computeMaxTrades(plan, accountRules)
      });

      console.log("[TradeGuardian] Dashboard loaded from Firestore (user settings applied).");
      return;
    }

    // Normal flow: compute all risk metrics from plan + accountRules
    const hasAccountRules = Object.keys(accountRules).length > 0;
    const hasPlan = Object.keys(plan).length > 0;
    if (!hasAccountRules && !hasPlan) {
      console.log("[TradeGuardian] Firestore has no risk data for this user.");
      return;
    }

    const rpt = computeRiskPerTrade(plan, accountRules);
    const dailyLoss = computeDailyLossLimit(plan, accountRules);
    const openRisk = computeOpenRiskLimit(plan, accountRules);
    const maxPos = computeMaxPositions(plan, accountRules);
    const maxTrd = computeMaxTrades(plan, accountRules);

    window.TradeGuardianDashboard.setRiskUpdate({
      riskPerTrade: rpt.value,
      riskPerTradePercent: rpt.percent,
      riskPerTradeText: rpt.text,
      dailyLossLimit: dailyLoss,
      openRiskLimit: openRisk,
      maxPositions: maxPos,
      maxTrades: maxTrd
    });

    console.log("[TradeGuardian] Dashboard risk metrics loaded from Firestore:", {
      riskPerTrade: rpt.value,
      dailyLossLimit: dailyLoss,
      openRiskLimit: openRisk,
      maxPositions: maxPos,
      maxTrades: maxTrd
    });
  } catch (err) {
    console.error("[TradeGuardian] load-dashboard error:", err);
  }
});
