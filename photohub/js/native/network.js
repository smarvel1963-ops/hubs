// network.js - C:\MarvelApps\photohub\www\js\native\network.js
// Wi-Fi vs mobile data, from the official @capacitor/network plugin (6.0.4). Used by Smart Storage and the
// backup engine's Wi-Fi-only rule. In a desktop browser it reports "unknown" (no fake Wi-Fi).

import { isNative } from './media-library.js';

let net = null;
function plugin() {
  if (!net) net = globalThis.Capacitor.registerPlugin('Network');
  return net;
}

/** -> { connected: boolean, type: 'wifi' | 'cellular' | 'none' | 'unknown' } */
export async function getNetwork() {
  if (!isNative()) {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    return { connected: online, type: online ? 'unknown' : 'none' };
  }
  try {
    const s = await plugin().getStatus();
    return { connected: !!s.connected, type: s.connectionType || 'unknown' };
  } catch (e) {
    return { connected: false, type: 'unknown' };
  }
}

export async function onNetworkChange(cb) {
  if (!isNative()) return () => {};
  const handle = await plugin().addListener('networkStatusChange', (s) => cb({ connected: !!s.connected, type: s.connectionType || 'unknown' }));
  return () => handle.remove();
}

export function describeNetwork(n) {
  if (!n || !n.connected) return 'Offline';
  if (n.type === 'wifi') return 'Wi-Fi';
  if (n.type === 'cellular') return 'Mobile data';
  return 'Connected';
}
