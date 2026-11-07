import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  updateProfile,
  getIdTokenResult,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyBfKm93Kih28h3cU3g1dlGCRPRcnnY2OFg",
    authDomain: "examportal-752db.firebaseapp.com",
    databaseURL: "https://examportal-752db-default-rtdb.firebaseio.com",
    projectId: "examportal-752db",
    storageBucket: "examportal-752db.firebasestorage.app",
    messagingSenderId: "99218612397",
    appId: "1:99218612397:web:9604206fde3a5e86e8e624",
    measurementId: "G-DDE771PZDB"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let persistencePromise;

export async function configureAuthPersistence() {
  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence);
  }
  await persistencePromise;
}

export function watchConnectionStatus(element) {
  if (!element) return () => {};
  const updateStatus = () => {
    const connected = navigator.onLine;
    element.textContent = connected ? 'Online' : 'Offline';
    element.classList.toggle('is-online', connected);
    element.classList.toggle('is-offline', !connected);
  };
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
  return () => {
    window.removeEventListener('online', updateStatus);
    window.removeEventListener('offline', updateStatus);
  };
}

export {
  app,
  auth,
  db,
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  getIdTokenResult,
  browserLocalPersistence,
};