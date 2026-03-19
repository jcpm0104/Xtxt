import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const BACKEND = (() => {
  const url = typeof window.TG_BACKEND_URL === "string" ? window.TG_BACKEND_URL.trim() : "";
  return url ? url.replace(/\/$/, "") : window.location.origin;
})();

let pendingReveal = null;
let rendering = false;

// ── Auth ─────────────────────────────────────────────────────────────────────

function getIdToken() {
  return new Promise((resolve, reject) => {
    const user = auth.currentUser;
    if (user) { user.getIdToken().then(resolve).catch(reject); return; }
    const timer = setTimeout(() => reject(new Error("Not signed in.")), 5000);
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) { clearTimeout(timer); unsub(); u.getIdToken().then(resolve).catch(reject); }
    });
  });
}

// ── API ───────────────────────────────────────────────────────────────────────

async function ntFetch(path, options = {}) {
  const token = await getIdToken();
  return fetch(`${BACKEND}/api/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

async function fetchTokens() {
  const res = await ntFetch("nt/tokens");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.tokens ?? [];
}

async function generateToken(label) {
  const res = await ntFetch("nt/token", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function deleteToken(tokenId) {
  const res = await ntFetch(`nt/token/${tokenId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchConnectorStatus() {
  try {
    const res = await ntFetch("connector/status");
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoStr) {
  if (!isoStr) return "Never";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtDate(isoStr) {
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Render ────────────────────────────────────────────────────────────────────

async function renderPanel() {
  if (rendering) return;
  rendering = true;

  const inner = document.getElementById("ntPanelInner");
  if (!inner) { rendering = false; return; }

  inner.innerHTML = '<div class="nt-loading">Loading…</div>';

  let tokens = [];
  let status = null;

  try {
    [tokens, status] = await Promise.all([fetchTokens(), fetchConnectorStatus()]);
  } catch (err) {
    inner.innerHTML = `<div class="nt-err">Could not load NinjaTrader settings.<br>${esc(err.message)}</div>`;
    rendering = false;
    return;
  }

  const isConnected = status?.mode === "ninjatrader";
  let html = "";

  // ── Connection status row
  html += `
    <div class="nt-status-row">
      <span class="nt-status-dot${isConnected ? " connected" : ""}"></span>
      <span class="nt-status-label">${isConnected ? "NinjaTrader Connected" : "Not Connected"}</span>
    </div>`;

  // ── Active tokens
  if (tokens.length === 0) {
    html += `<div class="helper">No active tokens. Generate one below to connect your NinjaTrader Add-On.</div>`;
  } else {
    html += `<div class="nt-token-list">`;
    for (const t of tokens) {
      html += `
        <div class="nt-token-card">
          <div class="nt-token-card-top">
            <span class="nt-token-label">${esc(t.label)}</span>
            <button class="nt-revoke-btn" data-id="${esc(t.tokenId)}">Revoke</button>
          </div>
          <div class="nt-token-meta">Last used: ${timeAgo(t.lastUsedAt)}</div>
          <div class="nt-token-meta">Expires: ${fmtDate(t.expiresAt)}</div>
        </div>`;
    }
    html += `</div>`;
  }

  // ── Token reveal (shown immediately after generation)
  if (pendingReveal) {
    html += `
      <div class="nt-reveal">
        <div class="nt-reveal-warning">⚠ Store this now — it cannot be shown again</div>
        <div class="nt-reveal-value" id="ntRevealValue">${esc(pendingReveal.rawToken)}</div>
        <button class="nt-copy-btn" id="ntCopyBtn">Copy Token</button>
        <div class="nt-token-meta" style="text-align:center;margin-top:2px">
          Expires ${fmtDate(pendingReveal.expiresAt)}
        </div>
      </div>`;
  }

  // ── Generate token form
  html += `
    <div class="field">
      <label>Token Label</label>
      <input id="ntTokenLabel" type="text" placeholder="e.g. Home machine" maxlength="64">
    </div>
    <button class="mini-btn primary" id="ntGenerateBtn">
      ${tokens.length === 0 ? "Generate Connection Token" : "Generate New Token"}
    </button>`;

  // ── Setup instructions
  html += `
    <div class="nt-instructions">
      <div class="nt-instructions-title">Setup Instructions</div>
      <div class="nt-step">
        <span class="nt-step-num">1</span>
        <span>Import the Trade Guardian Add-On into NinjaTrader:<br>
          <em>Tools → Import → NinjaScript Add-On</em></span>
      </div>
      <div class="nt-step">
        <span class="nt-step-num">2</span>
        <span>In the Add-On settings, enter this Backend URL:<br>
          <code class="nt-code">${esc(BACKEND)}</code></span>
      </div>
      <div class="nt-step">
        <span class="nt-step-num">3</span>
        <span>Generate a token above, paste it into the Add-On's
          Connection Token field, then restart NinjaTrader.</span>
      </div>
    </div>`;

  inner.innerHTML = html;
  rendering = false;

  // ── Wire: revoke buttons
  inner.querySelectorAll(".nt-revoke-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tokenId = btn.dataset.id;
      btn.textContent = "Revoking…";
      btn.disabled = true;
      try {
        await deleteToken(tokenId);
        pendingReveal = null;
        await renderPanel();
      } catch {
        btn.textContent = "Failed";
        btn.disabled = false;
      }
    });
  });

  // ── Wire: generate button
  const generateBtn = document.getElementById("ntGenerateBtn");
  if (generateBtn) {
    generateBtn.addEventListener("click", async () => {
      const raw = document.getElementById("ntTokenLabel")?.value.trim() ?? "";
      const label = raw || "NinjaTrader";
      generateBtn.textContent = "Generating…";
      generateBtn.disabled = true;
      try {
        const result = await generateToken(label);
        pendingReveal = { rawToken: result.rawToken, expiresAt: result.expiresAt };
        await renderPanel();
      } catch (err) {
        console.error("[NtTokens] Generate failed:", err);
        generateBtn.textContent = "Error — try again";
        generateBtn.disabled = false;
      }
    });
  }

  // ── Wire: copy button
  const copyBtn = document.getElementById("ntCopyBtn");
  if (copyBtn && pendingReveal) {
    const rawToken = pendingReveal.rawToken;
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(rawToken);
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => { if (copyBtn.isConnected) copyBtn.textContent = "Copy Token"; }, 2500);
      } catch {
        copyBtn.textContent = "Select text above and copy manually";
      }
    });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function init() {
  const item = document.getElementById("ntAccordionItem");
  if (!item) return;
  const trigger = item.querySelector(".accordion-trigger");
  if (!trigger) return;

  trigger.addEventListener("click", () => {
    if (item.classList.contains("open")) {
      renderPanel();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
