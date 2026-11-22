// account.js - C:\MarvelApps\photohub\www\js\lib\account.js
// SIGN-IN FOR CLOUD BACKUP (11/22, Scott: "Yes, build it"). Google sign-in through Firebase Auth - the same sign-in the Hub apps use
// (project day-hub-510322; these IDs are public client IDs, the same ones Family Hub ships). The backup service checks the sign-in
// itself, so nothing here is trusted on its own.
//   Web version (PC, Android Chrome, iPhone Safari): Google's sign-in window (popup; a full-page sign-in when popups are blocked).
//   Phone app: the native Google sign-in plugin (FirebaseAuthentication) when the app build has it - older builds say "comes with
//   the next app update" instead of showing a sign-in that cannot work inside the app.
// Tests put a stand-in in window.PH_AUTH_FAKE = { user: {uid, email, name} | null, token, signInAs }.

import { isNative } from '../native/media-library.js';

const CONFIG = { apiKey: 'AIzaSyCnLXutctuOrDHc2fKuy6c0rdOmUR62e7Y', authDomain: 'day-hub-510322.firebaseapp.com', projectId: 'day-hub-510322',
  storageBucket: 'day-hub-510322.firebasestorage.app', messagingSenderId: '750311262064', appId: '1:750311262064:web:d3119089f8c4249f77f1b5' };
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const WAS_IN = 'photohub.signedIn';   // only so a person who never signs in never loads Google's sign-in code

let user = null;
let started = null;
let webAuth = null;
const listeners = new Set();

const fake = () => globalThis.PH_AUTH_FAKE || null;
const cap = () => globalThis.Capacitor;
const nativeAvailable = () => { const c = cap(); return !!(c && typeof c.isPluginAvailable === 'function' && c.isPluginAvailable('FirebaseAuthentication')); };
let nativePlugin = null;
const plug = () => (nativePlugin || (nativePlugin = cap().registerPlugin('FirebaseAuthentication')));
const remember = (on) => { try { if (on) localStorage.setItem(WAS_IN, '1'); else localStorage.removeItem(WAS_IN); } catch (e) { /* private mode */ } };
const wasIn = () => { try { return localStorage.getItem(WAS_IN) === '1'; } catch (e) { return false; } };
const pick = (u) => (u ? { uid: u.uid, email: u.email || '', name: u.displayName || u.name || '' } : null);

function set(u) {
  const before = user && user.uid;
  user = u;
  if ((u && u.uid) !== before) for (const cb of listeners) { try { cb(user); } catch (e) { /* a screen must not break sign-in */ } }
}

/** true when this copy of Photo Hub can sign in at all. */
export function available() {
  if (fake()) return true;
  return isNative() ? nativeAvailable() : true;
}

/** Who is signed in (null = nobody). */
export function current() { return user; }

/** Call once at start; resolves when we know whether someone is signed in. Never shows anything. */
export function init() {
  if (!started) started = (async () => {
    const f = fake();
    if (f) { set(f.user ? pick(f.user) : null); return user; }
    if (isNative()) {
      if (!nativeAvailable()) return null;
      try {
        const r = await plug().getCurrentUser();
        set(pick(r && r.user));
        plug().addListener('authStateChange', (c) => set(pick(c && c.user))).catch(() => null);
      } catch (e) { set(null); }
      return user;
    }
    if (!wasIn()) return null;           // nobody ever signed in here: don't load Google's code
    try { await web(); } catch (e) { /* offline: stays signed out for now */ }
    return user;
  })();
  return started;
}

async function web() {
  if (webAuth) return webAuth;
  const load = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = SDK + src; s.onload = ok; s.onerror = () => no(new Error('offline')); document.head.appendChild(s); });
  if (!globalThis.firebase || !globalThis.firebase.auth) { await load('firebase-app-compat.js'); await load('firebase-auth-compat.js'); }
  const fb = globalThis.firebase;
  const app = fb.apps.find((a) => a.name === 'photohub') || fb.initializeApp(CONFIG, 'photohub');
  webAuth = app.auth();
  await new Promise((r) => { const un = webAuth.onAuthStateChanged(() => { un(); r(); }); });
  set(pick(webAuth.currentUser));
  webAuth.onAuthStateChanged((u) => { set(pick(u)); remember(!!u); });
  return webAuth;
}

/** Opens Google sign-in. Call straight from a tap (popups need it). Resolves to the user, or throws with a plain message. */
export async function signIn() {
  const f = fake();
  if (f) { f.user = f.signInAs || f.user || { uid: 'fake-user', email: 'tester@example.com', name: 'Tester' }; set(pick(f.user)); return user; }
  if (isNative()) {
    if (!nativeAvailable()) throw new Error('Sign-in comes with the next Photo Hub app update.');
    const r = await plug().signInWithGoogle();
    set(pick(r && r.user));
    return user;
  }
  const auth = await web().catch(() => { throw new Error('Could not reach Google sign-in - check the connection and try again.'); });
  const fb = globalThis.firebase;
  const provider = new fb.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const r = await auth.signInWithPopup(provider);
    remember(true);
    set(pick(r.user));
    return user;
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      remember(true);
      await auth.signInWithRedirect(provider);   // the page leaves and comes back signed in
      return null;
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new Error('Sign-in was closed before it finished.');
    throw new Error('Google sign-in did not finish - please try again.');
  }
}

export async function signOut() {
  const f = fake();
  if (f) { f.user = null; set(null); return; }
  if (isNative()) { if (nativeAvailable()) await plug().signOut().catch(() => null); set(null); return; }
  if (webAuth) await webAuth.signOut().catch(() => null);
  remember(false);
  set(null);
}

/** A fresh sign-in token for the backup service ('' when nobody is signed in). */
export async function token(forceRefresh = false) {
  const f = fake();
  if (f) return f.user ? (typeof f.token === 'function' ? f.token(f.user) : f.token || '') : '';
  if (!user) return '';
  if (isNative()) { const r = await plug().getIdToken({ forceRefresh }); return (r && r.token) || ''; }
  const auth = await web();
  return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : '';
}

/** Calls cb(user|null) whenever someone signs in or out; returns a function that stops it. */
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
