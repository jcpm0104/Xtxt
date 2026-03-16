import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBz0NnKwT50FJdE7E2qp8D6xvnRI9tLrq8",
  authDomain: "trade-guardian-system.firebaseapp.com",
  projectId: "trade-guardian-system",
  storageBucket: "trade-guardian-system.firebasestorage.app",
  messagingSenderId: "1034103501739",
  appId: "1:1034103501739:web:55b971e5d4c7a416d658ee"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
