// settings.js - C:\MarvelApps\photohub\www\js\lib\settings.js
// Smart Storage settings, kept on the phone (localStorage in Phase 1).
// Defaults (plan section 3/4): backup OFF until the cloud is set up, Wi-Fi only ON, keep favorites on phone ON.

export const SETTINGS_KEY = 'photohub.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  backupEnabled: false,
  wifiOnly: true,
  keepFavoritesOnDevice: true,
});

const BOOL_KEYS = Object.keys(DEFAULT_SETTINGS);

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}

export function loadSettings(storage = defaultStorage()) {
  const out = { ...DEFAULT_SETTINGS };
  if (!storage) return out;
  let saved = null;
  try {
    saved = JSON.parse(storage.getItem(SETTINGS_KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (saved && typeof saved === 'object') {
    for (const k of BOOL_KEYS) if (typeof saved[k] === 'boolean') out[k] = saved[k];
  }
  return out;
}

/** Save only known keys with real booleans; returns the settings now in force. */
export function saveSettings(patch, storage = defaultStorage()) {
  const next = loadSettings(storage);
  for (const k of BOOL_KEYS) if (patch && typeof patch[k] === 'boolean') next[k] = patch[k];
  if (storage) {
    try {
      storage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {
      /* storage full / blocked: settings still apply for this session */
    }
  }
  return next;
}
