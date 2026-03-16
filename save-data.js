import { auth, db } from "./firebase-init.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

function getPendingKey() {
  const uid = (auth.currentUser && auth.currentUser.uid) || "anon";
  return "tg_pending_firestore_writes_" + uid;
}

function getCreatedFlag() {
  const uid = (auth.currentUser && auth.currentUser.uid) || "anon";
  return "tg_firestore_doc_created_" + uid;
}

function getPending() {
  try { return JSON.parse(localStorage.getItem(getPendingKey()) || "{}"); }
  catch (_) { return {}; }
}

async function flushToFirestore(user) {
  const pendingKey = getPendingKey();
  const pending    = getPending();
  const sections   = Object.keys(pending);
  if (sections.length === 0) return;

  const ref     = doc(db, "traders", user.uid);
  const payload = { updatedAt: serverTimestamp() };

  if (!localStorage.getItem(getCreatedFlag())) {
    payload.createdAt = serverTimestamp();
  }

  for (const [section, data] of Object.entries(pending)) {
    payload[section] = data;
  }

  try {
    await setDoc(ref, payload, { merge: true });
    localStorage.setItem(getCreatedFlag(), "1");
    localStorage.removeItem(pendingKey);
    console.log("[TradeGuardian] Firestore write OK — sections:", sections.join(", "));
  } catch (err) {
    console.error("[TradeGuardian] Firestore write FAILED:", err);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  flushToFirestore(user).catch(err => console.error("[TradeGuardian] auth flush error:", err));
});

export function saveUserData(sectionName, dataObject) {
  const pendingKey = getPendingKey();
  const pending    = getPending();
  pending[sectionName] = dataObject;
  try {
    localStorage.setItem(pendingKey, JSON.stringify(pending));
  } catch (err) {
    console.error("[TradeGuardian] Failed to queue pending write:", err);
    return;
  }

  const user = auth.currentUser;
  if (user) {
    flushToFirestore(user).catch(err => console.error("[TradeGuardian] immediate flush error:", err));
  }
}
