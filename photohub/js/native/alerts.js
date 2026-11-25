// alerts.js - C:\MarvelApps\photohub\www\js\native\alerts.js
// JS side of NOTIFICATIONS (android/.../AlertsPlugin.java + Alerts.java + MemoryWorker.java) - 11/25, plan step 4 (Scott 11/24 via
// Desktop: "he will finish photo app"). The phone app posts "Backup finished" and "On this day"; the web version has no phone
// notifications (it says so) but still shows today's memory and the last backup on the Notifications screen.

import { isNative } from './media-library.js';

const cap = () => globalThis.Capacitor;
function plugin() {
  const c = cap();
  return isNative() && c && typeof c.isPluginAvailable === 'function' && c.isPluginAvailable('Alerts') ? c.registerPlugin('Alerts') : null;
}

/** true when this phone app can post notifications (0.7.6+). */
export const available = () => !!plugin();

const NONE = { permission: 'unavailable', backup: true, memories: true, history: [] };
export async function status() { const p = plugin(); if (!p) return NONE; try { return await p.status(); } catch (e) { return NONE; } }
export async function request() { const p = plugin(); return p ? p.request() : NONE; }
export async function configure(o) { const p = plugin(); return p ? p.configure(o) : NONE; }
export async function openSettings() { const p = plugin(); if (p) await p.openSettings(); }
/** The screen a tapped notification asked for ('' when none). */
export async function takeGo() { const p = plugin(); if (!p) return ''; try { return (await p.takeGo()).go || ''; } catch (e) { return ''; } }

// The bell's dot: something newer than the last visit to the Notifications screen
const SEEN = 'photohub.alertsSeen';
export function lastSeen() { try { return Number(localStorage.getItem(SEEN)) || 0; } catch (e) { return 0; } }
export function markSeen() { try { localStorage.setItem(SEEN, String(Date.now())); } catch (e) { /* private mode */ } }
