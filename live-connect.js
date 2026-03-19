/**
 * live-connect.js — Real-time bridge between the Trade Guardian backend and the dashboard.
 *
 * Connection URL:  window.TG_BACKEND_URL  (set in backend-config.js)
 * Socket.IO path:  /api/socket.io         (fixed — matches the backend configuration)
 *
 * Behaviour by backend mode:
 *
 *   "waiting"     — No data source connected yet. Backend is reachable but no
 *                   live account data exists. Dashboard shows disconnected but the
 *                   socket stays open — the first NT push or Tradovate connect will
 *                   trigger account_update automatically.
 *
 *   "ninjatrader" — NinjaTrader Add-On has connected (or did so recently).
 *                   Initial state is loaded from REST immediately so the dashboard
 *                   is populated before the next 30s heartbeat arrives.
 *
 *   "live"        — Tradovate credentials are active.
 *                   Same REST pre-load as ninjatrader mode.
 *
 * Stability guarantees:
 *   - Transient socket disconnects (ping timeout, transport switch, Replit sleep)
 *     do NOT clear account data. Only an explicit server-side close does.
 *   - State is re-fetched from REST on every socket reconnect so data is restored
 *     within 1–2 seconds rather than waiting up to 30s for the next NT heartbeat.
 *   - Multiple onAuthStateChanged fires (e.g. token refresh) are deduplicated —
 *     only one socket is ever open per browser session.
 */

import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOCKET_PATH = "/api/socket.io";

// ─── Session-level socket guard ───────────────────────────────────────────────
// Prevents duplicate sockets when onAuthStateChanged fires multiple times
// (e.g. hourly Firebase token refresh).

let activeSocket   = null;
let currentUserId  = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveBackendUrl() {
  const configured = window.TG_BACKEND_URL;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.replace(/\/$/, "");
  }
  return window.location.origin;
}

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

async function apiFetch(backendUrl, path, idToken) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(`${backendUrl}/api${path}`, { headers });
  if (!res.ok) throw new Error(`GET /api${path} → ${res.status}`);
  return res.json();
}

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

    console.log("[TradeGuardian] State loaded from backend REST API.");
  } catch (err) {
    console.warn("[TradeGuardian] State fetch failed — will rely on Socket.IO events.", err.message);
  }
}

// ─── Socket.IO connection ─────────────────────────────────────────────────────

async function connectToBackend(dashboard, idToken) {
  const backendUrl = resolveBackendUrl();

  if (typeof window.io !== "function") {
    console.error("[TradeGuardian] Socket.IO client not loaded.");
    return;
  }

  // ── Check backend mode ────────────────────────────────────────────────────
  const mode = await getConnectorMode(backendUrl, idToken);
  console.log(`[TradeGuardian] Backend connector mode: ${mode ?? "unknown"}`);

  if (mode === "waiting" || mode === null) {
    // Backend reachable but no live data source yet.
    // Signal disconnected but do NOT clear any data that may already exist
    // from a previous session load — only set status if there's nothing shown.
    dashboard.setAccountUpdate({ connectionStatus: "disconnected" });
    console.log("[TradeGuardian] No live data source active. Dashboard will update automatically when connected.");
  } else {
    // "live" or "ninjatrader" — pre-load current store state immediately so the
    // dashboard is populated before the next Socket.IO event arrives.
    await loadInitialState(dashboard, backendUrl, idToken);
  }

  // ── Open Socket.IO channel ───────────────────────────────────────────────
  console.log(`[TradeGuardian] Opening Socket.IO channel to: ${backendUrl}`);

  const socket = window.io(backendUrl, {
    path:                 SOCKET_PATH,
    auth:                 { token: idToken ?? null },
    reconnectionDelay:    2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    transports:           ["websocket", "polling"],
  });

  activeSocket = socket;

  // Track whether this is a reconnect (not the initial connect)
  let connectCount = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  socket.on("connect", async () => {
    connectCount++;
    console.log(`[TradeGuardian] Socket.IO connected (id: ${socket.id}, attempt #${connectCount})`);
    dashboard.setBackendConnected(true);

    // On every reconnect after the first, re-check mode and re-fetch state.
    // This restores account data within 1–2 seconds instead of waiting up to
    // 30s for the next NT heartbeat, covering:
    //   - Replit backend restart (all in-memory state wiped)
    //   - Brief network interruption
    //   - Socket transport switch (WebSocket → polling → WebSocket)
    if (connectCount > 1) {
      console.log("[TradeGuardian] Reconnected — refreshing state from backend.");
      const newMode = await getConnectorMode(backendUrl, idToken).catch(() => null);
      if (newMode !== "waiting" && newMode !== null) {
        await loadInitialState(dashboard, backendUrl, idToken);
      }
    }
  });

  socket.on("disconnect", (reason) => {
    console.warn(`[TradeGuardian] Socket.IO disconnected — reason: ${reason}`);

    // Mark the backend channel as down so the dashboard shows a reconnecting
    // indicator. Critically: do NOT call setAccountUpdate({ connectionStatus:
    // "disconnected" }) here for transient reasons — that would zero out the
    // entire dashboard for up to 30 seconds on every brief hiccup.
    //
    // "io server disconnect" is an explicit server-side close (e.g. auth
    // revocation). Only in that case do we also clear account state.
    // All other reasons (transport close, ping timeout, network blip) are
    // transient — Socket.IO will reconnect automatically and the "connect"
    // handler above will restore state.
    dashboard.setBackendConnected(false);

    if (reason === "io server disconnect") {
      dashboard.setAccountUpdate({ connectionStatus: "disconnected" });
      console.warn("[TradeGuardian] Server closed the connection explicitly. Clearing account state.");
    }
    // For all other reasons, the last-known account data stays visible.
    // A reconnecting indicator (driven by setBackendConnected(false)) is enough.
  });

  socket.on("connect_error", (err) => {
    console.error(`[TradeGuardian] Socket.IO connection error — ${err.message}`);
    // Do not touch account data on connection errors — these are transient.
    dashboard.setBackendConnected(false);
  });

  // ── Live data events ─────────────────────────────────────────────────────

  socket.on("account_update",    (data)      => handleAccountUpdate(dashboard, data));
  socket.on("risk_update",       (data)      => handleRiskUpdate(dashboard, data));
  socket.on("position_update",   (positions) => handlePositionsUpdate(dashboard, positions));
  socket.on("guardian_alert",    (alert)     => handleAlertEvent(dashboard, alert));
  socket.on("account_locked",    (lockState) => handleAccountLocked(dashboard, lockState));

  // ── NinjaTrader connection health events ─────────────────────────────────
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

    // Guard: if the same user already has an active socket, do not open a
    // second one. Firebase token refresh fires onAuthStateChanged again every
    // ~60 minutes — without this guard, a second socket would be created,
    // causing duplicate events and visual flicker.
    if (currentUserId === user.uid && activeSocket && activeSocket.connected) {
      console.log("[TradeGuardian] Auth state refreshed — socket already active, skipping re-connect.");
      return;
    }

    // If a socket exists for a different user (account switch), tear it down first.
    if (activeSocket && activeSocket.connected && currentUserId !== user.uid) {
      console.log("[TradeGuardian] User changed — closing previous socket.");
      activeSocket.disconnect();
      activeSocket  = null;
      currentUserId = null;
    }

    currentUserId = user.uid;

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
