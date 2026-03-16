import { auth, db } from "./firebase-init.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, () => {});

export async function saveUserData(sectionName, dataObject) {
  const user = auth.currentUser;
  if (!user) return;

  const ref = doc(db, "traders", user.uid);
  const existing = await getDoc(ref);

  const payload = {
    [sectionName]: dataObject,
    updatedAt: serverTimestamp()
  };

  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
}
