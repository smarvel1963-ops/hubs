// cleanup.js - C:\MarvelApps\photohub\www\js\native\cleanup.js
// JS side of CLEAN UP + DUPLICATES (android/.../CleanupPlugin.java, rules in CleanupCore.java) - 11/25, plan steps 5 + 6
// (Scott 11/24 via Desktop: "he will finish photo app"). Phone app only: a browser can't remove photos from a phone, so the web version
// never shows these. Photos you hearted or tagged always stay on the phone; album photos may go once safe in the cloud (11/25, below).

import { isNative } from './media-library.js';
import { cloudBase } from '../backup/cloud-target.js';
import * as mine from '../lib/mine.js';
import * as tags from '../lib/tags.js';

const cap = () => globalThis.Capacitor;
function plugin() {
  const c = cap();
  return isNative() && c && typeof c.isPluginAvailable === 'function' && c.isPluginAvailable('Cleanup') ? c.registerPlugin('Cleanup') : null;
}

/** true when this phone app has Clean Up (0.7.6+). */
export const available = () => !!plugin();

// 11/25 (Scott: albums "availbe for easy access but not all stored in phone" -> "yes" to "Should Clean Up free album photos from the phone
// once they're safe in the cloud?"): FREE UP PHONE SPACE now keeps only HEARTED ("Keep on phone") and TAGGED photos (tags live on this
// phone only). An album photo may go once its backup is checked like any other - the album then shows it from the cloud (media-library
// listMedia albumId checks what is still on the phone). DUPLICATE CLEANUP still prefers to keep the album copy (keptIds below).
const keys = (list, pre) => { const out = new Set(); for (const k of list) if (String(k).startsWith(pre)) out.add(String(k).slice(pre.length)); return [...out]; };

/** Phone ids you keep on purpose: hearts, album photos, tagged photos (Duplicate Cleanup: which copy stays). */
export function keptIds() { return keys([...mine.keptKeys(), ...tags.taggedKeys()], 'n:'); }
/** Cloud photos you hearted, tagged or put in an album (their SHA-256, e.g. added on another phone): a phone photo with that backup stays. */
export function keptShas() { return keys([...mine.keptKeys(), ...tags.taggedKeys()], 'c:'); }
/** Free Up Phone Space: only hearted ("Keep on phone") and tagged photos stay - and an album photo whose cloud copy the album doesn't know yet. */
export function keepOnPhoneIds() { return keys([...mine.heartKeys(), ...tags.taggedKeys(), ...mine.albumKeysWithoutCloud()], 'n:'); }
export function keepOnPhoneShas() { return keys([...mine.heartKeys(), ...tags.taggedKeys()], 'c:'); }

export const KEEP_DAYS = 30;
export const CHECK_BATCH = 20;
export const RECHECK_AFTER_MS = 45 * 60 * 1000;   // the plugin trusts a check 60 minutes; re-check before that runs out

export async function candidates() { return plugin().candidates({ keepDays: KEEP_DAYS, keptIds: keepOnPhoneIds(), keptShas: keepOnPhoneShas() }); }

/** Checks the ids in batches (the file read now + the cloud asked now). onProgress(done, total). -> [{ id, ok, why, size }] */
export async function verify(ids, onProgress = () => {}, isAlive = () => true) {
  const out = [];
  for (let i = 0; i < ids.length && isAlive(); i += CHECK_BATCH) {
    const r = await plugin().verify({ ids: ids.slice(i, i + CHECK_BATCH), keepDays: KEEP_DAYS, keptIds: keepOnPhoneIds(), keptShas: keepOnPhoneShas(), cloudUrl: cloudBase() });
    out.push(...(r.verdicts || []));
    onProgress(Math.min(ids.length, i + CHECK_BATCH), ids.length);
  }
  return out;
}

export async function findCopies() { return plugin().findCopies({ keptIds: keptIds(), keptShas: keptShas() }); }

/** -> { moved: true|false, count } once Android has asked; throws with the reason otherwise (e.code NOT_CHECKED / CHANGED = check again).
 *  The plugin reads every photo again right before Android asks (review 11/25). */
export async function trash(ids, reason) { return plugin().trash({ ids: ids.map(String), reason }); }
export async function restore(ids) { return plugin().restore({ ids: ids.map(String) }); }
export async function listTrashed() { return plugin().listTrashed(); }
