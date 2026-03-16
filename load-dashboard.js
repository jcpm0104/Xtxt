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

    // Write to UID-scoped localStorage so page-reload also works correctly
    // even when multiple users share the same browser.
    const uid = user.uid;
    if (data.profile)        localStorage.setItem("tradeGuardianTraderProfile_" + uid, JSON.stringify(data.profile));
    if (data.accountRules)   localStorage.setItem("tradeGuardianAccountRules_"  + uid, JSON.stringify(data.accountRules));
    if (data.tradingPlan)    localStorage.setItem("tradeGuardianCustomPlan_"     + uid, JSON.stringify(data.tradingPlan));
    if (data.recommendedPlan)localStorage.setItem("tradeGuardianActivePlan_"     + uid, JSON.stringify(data.recommendedPlan));
    if (data.planResult)     localStorage.setItem("tradeGuardianActivePlan_"     + uid, JSON.stringify(data.planResult));

    if (data.dashboard) {
      const d = data.dashboard;
      if (d.tg_dashboard_settings)         localStorage.setItem("tg_dashboard_settings_"          + uid, JSON.stringify(d.tg_dashboard_settings));
      if (d.tg_draft_accounts)             localStorage.setItem("tg_draft_accounts_"               + uid, JSON.stringify(d.tg_draft_accounts));
      if (d.tradeGuardianSelectedPlatform) localStorage.setItem("tradeGuardianSelectedPlatform_"   + uid, d.tradeGuardianSelectedPlatform);
    }

    if (!window.TradeGuardianDashboard) return;

    const settings         = JSON.parse(localStorage.getItem("tg_dashboard_settings_" + uid) || "{}");
    const hasManualOverrides = settings.userHasAppliedSettings === true;

    // Use the same field resolution order the dashboard itself uses
    const accountRules = data.accountRules || {};
    const plan         = data.planResult || data.tradingPlan || data.recommendedPlan || {};

    // Guard 1: nothing to work from — keep whatever the inline script already rendered.
    const hasAccountRules = Object.keys(accountRules).length > 0;
    const hasPlan         = Object.keys(plan).length > 0;
    if (!hasAccountRules && !hasPlan && !hasManualOverrides) {
      console.log("[TradeGuardian] Firestore has no risk data; preserving dashboard values.");
      return;
    }

    // Compute plan-derived baseline values.
    const rpt       = computeRiskPerTrade(plan, accountRules);
    const dailyLoss = computeDailyLossLimit(plan, accountRules);
    const openRisk  = computeOpenRiskLimit(plan, accountRules);
    const maxPos    = computeMaxPositions(plan, accountRules);
    const maxTrd    = computeMaxTrades(plan, accountRules);

    // Start with plan-derived values. Only include a field when it resolved to
    // something real — sending 0 via ?? would overwrite a correct value with zero.
    const payload = {};
    if (rpt.value > 0) {
      payload.riskPerTrade        = rpt.value;
      payload.riskPerTradePercent = rpt.percent;
    }
    // Always send riskPerTradeText when a plan structure was found, regardless of
    // whether the dollar value is non-zero. This prevents "No plan loaded yet"
    // from persisting when the plan exists but computes to $0 (e.g. percentage
    // mode with accountSize = 0).
    if (rpt.text && rpt.text !== "No plan loaded yet") {
      payload.riskPerTradeText = rpt.text;
    }
    if (dailyLoss > 0) payload.dailyLossLimit = dailyLoss;
    if (openRisk  > 0) payload.openRiskLimit  = openRisk;
    if (maxPos    > 0) payload.maxPositions    = maxPos;
    if (maxTrd    > 0) payload.maxTrades       = maxTrd;

    // If the user has applied manual overrides via the settings form, merge those
    // on top of the plan-derived baseline. This ensures the correct values are
    // always pushed to the dashboard even on a fresh-session load where localStorage
    // was empty when the inline script ran and defaultState was initialised to zero.
    if (hasManualOverrides) {
      const accountSize = getAccountSize(accountRules);

      if (settings.riskPerTrade !== undefined && settings.riskPerTrade !== null && settings.riskPerTrade !== "") {
        const manualRPT = Number(settings.riskPerTrade || 0);
        if (manualRPT > 0) {
          const manualDual = getDualDisplay(manualRPT, "$", accountSize);
          payload.riskPerTrade        = manualRPT;
          payload.riskPerTradePercent = manualDual.percent;
          payload.riskPerTradeText    = `${manualDual.percentText} of balance`;
        }
      }

      if (settings.dailyLossLimit !== undefined && settings.dailyLossLimit !== null && settings.dailyLossLimit !== "") {
        const manualDLL = Number(settings.dailyLossLimit || 0);
        if (manualDLL > 0) payload.dailyLossLimit = manualDLL;
      }

      if (settings.maxPositions !== undefined && settings.maxPositions !== null && settings.maxPositions !== "") {
        const manualMP = Number(settings.maxPositions || 0);
        if (manualMP > 0) payload.maxPositions = manualMP;
      }
    }

    // Guard 2: nothing actionable computed.
    if (Object.keys(payload).length === 0) {
      console.log("[TradeGuardian] Firestore risk data resolved to no actionable values; preserving current dashboard state.");
      return;
    }

    window.TradeGuardianDashboard.setRiskUpdate(payload);
    console.log("[TradeGuardian] Dashboard risk metrics updated from Firestore:", payload);
  } catch (err) {
    console.error("[TradeGuardian] load-dashboard error:", err);
  }
});
