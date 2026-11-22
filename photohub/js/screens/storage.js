// storage.js - C:\MarvelApps\photohub\www\js\screens\storage.js
// SMART STORAGE (plan section 4): backup on/off, Wi-Fi only, keep favorites on this phone, storage meter.
// Real: the three switches (saved on the phone), the connection (Wi-Fi / mobile data), the phone library numbers
// (after photo access), and the backup engine's own answer - which today is "Backblaze B2 is not set up yet".
// Placeholder: cloud usage shows "--" (no cloud yet). "Free Up Phone Space" is a disabled button - it comes
// after the never-lose-a-photo tests. Nothing on this screen can delete anything.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, getLibrarySummary } from '../native/media-library.js';
import { getNetwork, onNetworkChange, describeNetwork } from '../native/network.js';
import { loadSettings, saveSettings } from '../lib/settings.js';
import { formatBytes, formatCount, usedFraction } from '../lib/timeline.js';
import { BackupEngine, SKIP } from '../backup/backup-engine.js';
import { B2Target } from '../backup/b2-target.js';
import { LocalStorageStateStore } from '../backup/state-store.js';

const FREE_PLAN_BYTES = 10 * 1024 ** 3; // plan section 10: free plan 10 GB, photos only

const phoneSource = {
  async read() {
    throw new Error('Reading full photos for upload comes with the cloud step');
  },
};

const SKIP_TEXT = {
  [SKIP.BACKUP_OFF]: 'Auto Backup is off.',
  [SKIP.OFFLINE]: 'The phone is offline - backup waits.',
  [SKIP.WAITING_FOR_WIFI]: 'On mobile data - backup waits for Wi-Fi.',
};

export async function render(root, params, ctx) {
  let alive = true;
  let settings = loadSettings();
  let network = await getNetwork();
  const engine = new BackupEngine({
    source: phoneSource,
    target: new B2Target(),
    store: new LocalStorageStateStore(),
    getSettings: () => settings,
    getNetwork: () => network,
  });
  await engine.init();
  const target = await engine.checkTarget();

  root.innerHTML = `<div class="screen">
    <div class="subbar">
      <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
      <h1>Smart Storage</h1>
    </div>

    <section class="card status-card">
      <div class="big ${target.ready ? 'ok' : ''}">${icons.cloud}</div>
      <div>
        <b>${target.ready ? 'Cloud backup is connected' : 'Cloud backup isn\'t connected yet'}</b>
        <p>${target.ready ? '' : 'Backblaze B2 is not set up yet, so nothing is uploaded. Your photos stay on this phone, exactly as they are.'}</p>
        <p id="why"></p>
      </div>
    </section>

    <section class="card">
      <div class="card-head">${icons.cloud}<h2>Storage</h2><span class="badge">Free plan 10 GB</span></div>
      <div class="meter">
        <div class="ring">
          <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" stroke="rgba(255,255,255,0.12)" stroke-width="12" fill="none"/>
            <circle id="arc" cx="60" cy="60" r="50" stroke="url(#ringGrad)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="0 400" visibility="hidden"/>
            <defs><linearGradient id="ringGrad"><stop offset="0" stop-color="#3d8bff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs></svg>
          <div class="center"><b id="cloudUsed">--</b><span>cloud used</span></div>
        </div>
        <div class="stats">
          <div class="stat"><span>Cloud</span><b id="cloudLine">-- of 10 GB</b></div>
          <div class="stat"><span>Photos on phone</span><b id="phPhotos">--</b></div>
          <div class="stat"><span>Videos on phone</span><b id="phVideos">--</b></div>
          <div class="stat"><span>Favorites</span><b id="phFav">--</b></div>
        </div>
      </div>
      <p class="note" id="libNote">${canRead(ctx.access) ? '' : 'Phone numbers show once you allow photo access.'}</p>
      ${canRead(ctx.access) || ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}
    </section>

    <section class="card">
      <div class="card-head">${icons.settings}<h2>Backup settings</h2></div>
      ${toggle('backupEnabled', 'cloudUp', 'Auto Backup', 'Back up new photos and videos once the cloud is set up')}
      ${toggle('wifiOnly', 'wifi', 'Backup over Wi-Fi only', 'Never uses your mobile data')}
      ${toggle('keepFavoritesOnDevice', 'heart', 'Keep favorites on this phone', 'Hearted photos are backed up AND always stay on the phone')}
      <div class="row"><span class="ico">${icons.wifi}</span><span class="txt"><b>Right now</b><span id="netLine">${esc(describeNetwork(network))}</span></span></div>
    </section>

    <section class="card">
      <div class="card-head">${icons.phone}<h2>Phone space</h2></div>
      <button class="big-btn" disabled>${icons.broom} Free Up Phone Space</button>
      <p class="note">Comes after the never-lose-a-photo tests. When it arrives it will only offer photos with a checked
        cloud copy, never your favorites, and Android will ask you first. "Delete Everywhere" will always be a separate button.</p>
    </section>
  </div>`;

  function toggle(key, icon, title, sub) {
    return `<label class="row"><span class="ico">${icons[icon]}</span><span class="txt"><b>${esc(title)}</b><span>${esc(sub)}</span></span>
      <span class="switch"><input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}><i></i></span></label>`;
  }

  function refreshWhy() {
    const why = engine.whyNotRunning();
    const s = engine.summary();
    let text;
    if (!target.ready) text = settings.backupEnabled ? 'Auto Backup is on and will start once the cloud is set up.' : 'Auto Backup is off.';
    else text = why ? SKIP_TEXT[why] || why : 'Backup can run now.';
    if (s.total) text += ` Backup list: ${formatCount(s.backedUp)} backed up, ${formatCount(s.queued + s.failed)} waiting.`;
    root.querySelector('#why').textContent = text;
    root.querySelector('#netLine').textContent = `${describeNetwork(network)}${settings.wifiOnly && network.type !== 'wifi' ? ' - backup would wait for Wi-Fi' : ''}`;
  }

  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#tools')));
  root.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-key]');
    if (!input) return;
    settings = saveSettings({ [input.dataset.key]: input.checked });
    refreshWhy();
  });
  const ask = root.querySelector('#ask');
  if (ask) ask.addEventListener('click', async () => {
    const a = await askForPhotoAccess(ctx.access);
    ctx.setAccess(a);
    if (canRead(a)) ctx.rerender();
  });

  // Cloud meter: no cloud yet, so "--" and an empty ring. (usedFraction(null) is null by design.)
  const frac = usedFraction(target.ready ? engine.summary().backedUpBytes : null, FREE_PLAN_BYTES);
  if (frac !== null) {
    root.querySelector('#arc').setAttribute('stroke-dasharray', `${(frac * 314).toFixed(1)} 400`);
    root.querySelector('#arc').setAttribute('visibility', 'visible');
    root.querySelector('#cloudUsed').textContent = `${Math.round(frac * 100)}%`;
    root.querySelector('#cloudLine').textContent = `${formatBytes(engine.summary().backedUpBytes)} of 10 GB`;
  }

  if (canRead(ctx.access)) {
    getLibrarySummary().then((s) => {
      if (!alive) return;
      root.querySelector('#phPhotos').textContent = `${formatCount(s.photos.count)} · ${formatBytes(s.photos.bytes)}`;
      root.querySelector('#phVideos').textContent = `${formatCount(s.videos.count)} · ${formatBytes(s.videos.bytes)}`;
      root.querySelector('#phFav').textContent = s.access === 'web' ? 'In the phone app' : s.favorites === null || s.favorites === undefined ? '-- (Android 11+)' : formatCount(s.favorites);
      root.querySelector('#libNote').textContent = s.access === 'limited' || s.access === 'web' ? 'Counting only the photos you picked for Photo Hub.' : '';
    }).catch((e) => {
      if (alive) root.querySelector('#libNote').textContent = `Could not read the phone library: ${e.message || e}`;
    });
  }

  refreshWhy();
  const stopNet = await onNetworkChange((n) => { network = n; if (alive) refreshWhy(); });
  return () => { alive = false; stopNet(); };
}
