import { auth, db } from "./firebase-init.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const PENDING_KEY  = "tg_pending_firestore_writes";
const CREATED_FLAG = "tg_firestore_doc_created";

function getPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"); }
  catch (_) { return {}; }
}

async function flushToFirestore(user) {
  const pending = getPending();
  const sections = Object.keys(pending);
  if (sections.length === 0) return;

  const ref = doc(db, "traders", user.uid);
  const payload = { updatedAt: serverTimestamp() };

  if (!localStorage.getItem(CREATED_FLAG)) {
    payload.createdAt = serverTimestamp();
  }

  for (const [section, data] of Object.entries(pending)) {
    payload[section] = data;
  }

  try {
    await setDoc(ref, payload, { merge: true });
    localStorage.setItem(CREATED_FLAG, "1");
    localStorage.removeItem(PENDING_KEY);
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
  const pending = getPending();
  pending[sectionName] = dataObject;
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch (err) {
    console.error("[TradeGuardian] Failed to queue pending write:", err);
    return;
  }

  const user = auth.currentUser;
  if (user) {
    flushToFirestore(user).catch(err => console.error("[TradeGuardian] immediate flush error:", err));
  }
}
