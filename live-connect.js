/**
 * live-connect.js — Real-time bridge between the Trade Guardian backend and the dashboard.
 *
 * Connection URL:  window.TG_BACKEND_URL  (set in backend-config.js)
 * Socket.IO path:  /api/socket.io         (fixed — matches the backend configuration)
 *
 * Behaviour by backend mode:
 *
 *   "waiting"  — No Tradovate credentials are configured yet.
 *                The Socket.IO channel is opened so the dashboard knows the backend
 *                is reachable, but NO initial state is loaded from the REST API and
 *                the dashboard connection status is set to "disconnected".
 *                When Tradovate is later connected the backend will emit live events
 *                and the dashboard will update automatically.
 *
 *   "live"     — Tradovate credentials are active.
 *                Initial state is fetched immediately via REST (account, risk,
 *                positions, alerts) and then kept up to date via Socket.IO events.
 *
 * Dashboard API surface used:
 *   setAccountUpdate(payload)   — balance, equity, dailyPnl, etc.
 *   setRiskUpdate(payload)      — riskPerTrade, dailyLossLimit, etc.
 *   setPositionsUpdate(array)   — open positions list
 *   setAlertsUpdate(array)      — all active guardian alerts
 */

import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOCKET_PATH = "/api/socket.io";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the backend root URL.
 * Priority: window.TG_BACKEND_URL (set in backend-config.js) → window.location.origin.
 */
function resolveBackendUrl() {
  const configured = window.TG_BACKEND_URL;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.replace(/\/$/, "");
  }
  return window.location.origin;
}

/**
 * Wait for window.TradeGuardianDashboard to be defined.
 * The inline script in guardian-dashboard.html runs synchronously before modules,
 * so it is always already defined — this guard is purely defensive.
 */
function waitForDashboard() {
  return new Promise((resolve) => {
    if (window.TradeGuardianDashboard) {
      resolve(window.TradeGuardianDashboard);
      return;
    }
    const poll = setInterval(() => {
      if (window.TradeGuardianDashboard) {
        clearInterval(poll);
        resolve(window.TradeGuardianDashboard);
      }
    }, 50);
  });
}

/**
 * Perform an authenticated fetch against the backend REST API.
 * Attaches Authorization: Bearer <token> when a token is available.
 */
async function apiFetch(backendUrl, path, idToken) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(`${backendUrl}/api${path}`, { headers });
  if (!res.ok) throw new Error(`GET /api${path} → ${res.status}`);
  return res.json();
}

/**
 * Check the backend connector mode.
 * Returns "live", "waiting", or null if the check fails.
 */
async function getConnectorMode(backendUrl, idToken) {
  try {
    const status = await apiFetch(backendUrl, "/connector/status", idToken);
    return status.mode ?? null;
  } catch (err) {
    console.warn("[TradeGuardian] Could not read connector status:", err.message);
    return null;
  }
}

// ─── Local alert buffer ───────────────────────────────────────────────────────

/**
 * liveAlerts accumulates all guardian_alert and account_locked events
 * received during this browser session. Newest alerts appear first.
 */
let liveAlerts = [];

function upsertAlert(alert) {
  liveAlerts = [alert, ...liveAlerts.filter((a) => a.id !== alert.id)];
}

// ─── Event → dashboard mapping ────────────────────────────────────────────────

function handleAccountUpdate(dashboard, data) {
  dashboard.setAccountUpdate({
    balance:          data.balance,
    equity:           data.equity,
    dailyPnl:         data.dailyPnl,
    dailyPnlPercent:  data.dailyPnlPercent,
    tradesToday:      data.tradesToday,
    accountId:        data.accountId,
    brokerName:       data.brokerName,
    connectionStatus: data.connectionStatus ?? "connected",
    mode:             "Live",
    accountSize:      data.balance,
  });
}

function handleRiskUpdate(dashboard, data) {
  dashboard.setRiskUpdate({
    riskPerTrade:        data.riskPerTrade,
    riskPerTradePercent: data.riskPerTradePercent,
    riskPerTradeText:    `${Number(data.riskPerTradePercent || 0).toFixed(2)}% of balance`,
    dailyLossLimit:      data.dailyLossLimit,
    dailyLossUsed:       data.dailyLossUsed,
    dailyLossPercent:    data.dailyLossPercent,
    totalOpenRisk:       data.totalOpenRisk,
    openRiskLimit:       Number(data.riskPerTrade || 0) * Number(data.maxPositions || 1),
    maxPositions:        data.maxPositions,
    riskStatus:          data.riskStatus,
  });
}

function handlePositionsUpdate(dashboard, positions) {
  dashboard.setPositionsUpdate(Array.isArray(positions) ? positions : []);
}

function handleAlertEvent(dashboard, alert) {
  upsertAlert(alert);
  dashboard.setAlertsUpdate([...liveAlerts]);
  console.log(`[TradeGuardian] Alert: ${alert.type} (${alert.severity}) — ${alert.message}`);
}

function handleAccountLocked(dashboard, lockState) {
  console.warn(`[TradeGuardian] Account LOCKED — ${lockState.reason ?? ""}`);
  const lockAlert = {
    id:             "account_locked",
    type:           "account_locked",
    severity:       "critical",
    message:        lockState.reason ?? "Account locked by Trade Guardian.",
    triggeredAt:    new Date(),
    acknowledged:   false,
    acknowledgedAt: null,
    metadata:       lockState,
  };
  upsertAlert(lockAlert);
  dashboard.setAlertsUpdate([...liveAlerts]);
}

// ─── Initial state load ───────────────────────────────────────────────────────

/**
 * Fetch the current state from all REST endpoints immediately on connect.
 * Only called when connector mode is "live" — never in "waiting" mode.
 */
async function loadInitialState(dashboard, backendUrl, idToken) {
  try {
    const [account, positions, risk, alerts] = await Promise.all([
      apiFetch(backendUrl, "/account",   idToken),
      apiFetch(backendUrl, "/positions", idToken),
      apiFetch(backendUrl, "/risk",      idToken),
      apiFetch(backendUrl, "/alerts",    idToken),
    ]);

    handleAccountUpdate(dashboard, account);
    handleRiskUpdate(dashboard, risk);
    handlePositionsUpdate(dashboard, positions);

    if (Array.isArray(alerts) && alerts.length > 0) {
      liveAlerts = alerts;
      dashboard.setAlertsUpdate([...liveAlerts]);
    }

    console.log("[TradeGuardian] Initial state loaded from backend REST API.");
  } catch (err) {
    console.warn("[TradeGuardian] Initial state fetch failed — will rely on Socket.IO ticks.", err.message);
  }
}

// ─── Socket.IO connection ─────────────────────────────────────────────────────

async function connectToBackend(dashboard, idToken) {
  const backendUrl = resolveBackendUrl();

  if (typeof window.io !== "function") {
    console.error("[TradeGuardian] Socket.IO client not loaded. Ensure the Socket.IO CDN script is included before live-connect.js.");
    return;
  }

  // ── Check backend mode before doing anything else ────────────────────────
  const mode = await getConnectorMode(backendUrl, idToken);
  console.log(`[TradeGuardian] Backend connector mode: ${mode ?? "unknown"}`);

  if (mode === "waiting" || mode === null) {
    // No live trading connection — do NOT load data from the REST API.
    // Signal the dashboard that the trading connection is not yet established.
    dashboard.setAccountUpdate({ connectionStatus: "disconnected" });
    console.log("[TradeGuardian] Backend is waiting for Tradovate credentials. Dashboard will update automatically when live data starts.");
  } else {
    // Live mode — fetch current state immediately so the dashboard is
    // populated before the first Socket.IO tick arrives.
    loadInitialState(dashboard, backendUrl, idToken);
  }

  // ── Open Socket.IO channel (always, regardless of mode) ─────────────────
  // The channel stays open so that as soon as Tradovate connects and the
  // backend starts emitting events, the dashboard receives them without
  // requiring a page reload.
  console.log(`[TradeGuardian] Opening Socket.IO channel to: ${backendUrl}`);

  const socket = window.io(backendUrl, {
    path:                 SOCKET_PATH,
    auth:                 { token: idToken ?? null },
    reconnectionDelay:    3000,
    reconnectionAttempts: Infinity,
    transports:           ["websocket", "polling"],
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  socket.on("connect", () => {
    console.log(`[TradeGuardian] Socket.IO channel open (id: ${socket.id})`);
    // Signal that the backend is reachable — this drives the Live Feed pill.
    // We do NOT set brokerConnectionStatus: "connected" here because the
    // socket being open only means the backend is reachable, NOT that a real
    // Tradovate account has authenticated.  Broker status is set only when
    // an "account_update" event carrying real account data arrives.
    dashboard.setBackendConnected(true);
  });

  socket.on("disconnect", (reason) => {
    console.warn(`[TradeGuardian] Socket.IO disconnected — ${reason}`);
    // Backend is no longer reachable — mark both backend and broker as down.
    // If the socket reconnects, the backend will re-emit account_update and
    // the broker status will be restored without a page reload.
    dashboard.setBackendConnected(false);
    dashboard.setAccountUpdate({ connectionStatus: "disconnected" });
  });

  socket.on("connect_error", (err) => {
    console.error(`[TradeGuardian] Socket.IO connection error — ${err.message}`);
    // Connection failed — mark backend as unreachable.
    // Do not touch broker connectionStatus on transient errors; Socket.IO
    // will retry automatically and the "connect" event will restore it.
    dashboard.setBackendConnected(false);
  });

  // ── Live data events ─────────────────────────────────────────────────────

  socket.on("account_update",    (data)      => handleAccountUpdate(dashboard, data));
  socket.on("risk_update",       (data)      => handleRiskUpdate(dashboard, data));
  socket.on("position_update",   (positions) => handlePositionsUpdate(dashboard, positions));
  socket.on("guardian_alert",    (alert)     => handleAlertEvent(dashboard, alert));
  socket.on("account_locked",    (lockState) => handleAccountLocked(dashboard, lockState));

  // ── NinjaTrader connection health events ─────────────────────────────────
  // "nt_stale"    — backend detected no push for >90s. Show a warning banner.
  // "nt_connected"— the Add-On has recovered and sent fresh data. Clear banner.
  socket.on("nt_stale", (data) => {
    const secs = typeof data?.secondsAgo === "number" ? data.secondsAgo : null;
    console.warn(
      `[TradeGuardian] NinjaTrader connection stale — last push ${secs !== null ? secs + "s ago" : "(unknown)"}`
    );
    if (typeof dashboard.setNtStale === "function") {
      dashboard.setNtStale(true, secs);
    }
  });

  socket.on("nt_connected", (data) => {
    console.log(
      `[TradeGuardian] NinjaTrader connection recovered — reconnectedAt: ${data?.reconnectedAt ?? "unknown"}`
    );
    if (typeof dashboard.setNtStale === "function") {
      dashboard.setNtStale(false);
    }
  });

  // trading_day_update is consumed for future session-aware features.
  socket.on("trading_day_update", (data) => {
    console.debug("[TradeGuardian] trading_day_update:", data);
  });

  return socket;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap() {
  const dashboard = await waitForDashboard();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    let idToken = null;
    try {
      idToken = await user.getIdToken();
    } catch (err) {
      console.warn("[TradeGuardian] Could not obtain ID token — connecting without auth.", err.message);
    }

    await connectToBackend(dashboard, idToken);
  });
}

bootstrap().catch((err) => {
  console.error("[TradeGuardian] live-connect bootstrap error:", err);
});
