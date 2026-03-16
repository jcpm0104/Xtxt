import { auth } from "./firebase-init.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      btn.textContent = "Signing out...";
      btn.disabled = true;
      await signOut(auth);
      window.location.href = "auth.html";
    } catch (err) {
      console.error("[TradeGuardian] logout error:", err);
      btn.textContent = "Sign Out";
      btn.disabled = false;
    }
  });
});
