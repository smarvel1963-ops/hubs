// storage.js - C:\MarvelApps\photohub\www\js\screens\storage.js
// SMART STORAGE (plan section 4): backup on/off, Wi-Fi only, keep favorites on this phone, storage meter.
// Real: the three switches (saved on the phone), the connection (Wi-Fi / mobile data), the phone library numbers
// (after photo access), and the backup engine's own answer - which today is "Backblaze B2 is not set up yet".
// Placeholder: cloud usage shows "--" (no cloud yet). "Free Up Phone Space" is a disabled button - it comes
// after the never-lose-a-photo tests. Nothing on this screen can delete anything.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, getLibrarySummary, listMedia, thumbnailUrl } from '../native/media-library.js';
import * as vs from '../lib/vault-store.js';
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

  // 11/22 new look (Scott's "Smart Cloud Storage" design): backup status, storage, device cleanup, favorites kept offline, vault.
  // Honest numbers only - "Complete" and the cloud meter appear once real backup exists; until then it says it is not set up.
  root.innerHTML = `<div class="screen cloud2">
    <div class="subbar"><h1>Cloud</h1></div>

    <section class="card c2-backup">
      <div class="c2-orb ${target.ready ? 'ok' : ''}">${icons.cloud}</div>
      <div class="c2-txt"><b>Backup</b>
        <span class="c2-pill ${target.ready ? 'ok' : ''}">${target.ready ? `${icons.check} Connected` : 'Not set up yet'}</span>
        <p>${target.ready ? '' : ctx.access.web ? 'Cloud backup comes with the Photo Hub app and your storage plan. Right now your photos stay on your phone.' : 'Cloud storage is not set up yet, so nothing is uploaded. Your photos stay on this phone, exactly as they are.'}</p>
        <p id="why"></p></div>
    </section>

    <section class="card">
      <div class="card-head">${icons.database}<h2>Storage</h2><span class="c2-amt" id="cloudLine">Cloud: not set up</span></div>
      <div class="c2-bar"><i id="cloudBar" style="width:0"></i></div>
      <div class="stats" style="margin-top:12px">
          <div class="stat"><span>Photos ${ctx.access.web ? 'picked' : 'on phone'}</span><b id="phPhotos">--</b></div>
          <div class="stat"><span>Videos ${ctx.access.web ? 'picked' : 'on phone'}</span><b id="phVideos">--</b></div>
          <div class="stat"><span>Favorites (stay on phone)</span><b id="phFav">--</b></div>
      </div>
      <p class="note" id="libNote">${canRead(ctx.access) ? '' : 'Phone numbers show once you allow photo access.'}</p>
      ${canRead(ctx.access) || ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}
    </section>



    <section class="card c2-clean">
      <span class="c2-ico">${icons.broom}</span><div class="c2-txt"><b>Device Cleanup</b><span>Free up phone space - after backup</span></div>
      <button class="pill-btn" disabled>Clean Up ${icons.chevron}</button>
    </section>
    <p class="note">Clean Up only removes phone copies that have a checked cloud copy - never your favorites, never the vault - and asks you
      first. "Delete everywhere" is always a separate button.</p>

    <div class="c2-two">
      <button class="card c2-fav" data-go="#photos?type=all&fav=1&title=Favorites"><span class="c2-ico rose">${icons.heart}</span><b>Favorites</b><span>Saved on your phone</span><span class="c2-pics" id="favPics"></span></button>
      <button class="card c2-vault" data-go="#vault"><span class="c2-ico violet">${icons.lock}</span><b>Private Vault</b><span id="vaultLine">Locked &amp; private</span><span class="c2-lockart">${icons.lock}</span></button>
    </div>

    <section class="card">
      <div class="card-head">${icons.settings}<h2>Backup settings</h2></div>
      ${toggle('backupEnabled', 'cloudUp', 'Auto Backup', 'Back up new photos and videos once the cloud is set up')}
      ${toggle('wifiOnly', 'wifi', 'Backup over Wi-Fi only', 'Never uses your mobile data')}
      ${toggle('keepFavoritesOnDevice', 'heart', 'Keep favorites on this phone', 'Hearted photos are backed up AND always stay on the phone')}
      <div class="row"><span class="ico">${icons.wifi}</span><span class="txt"><b>Right now</b><span id="netLine">${esc(describeNetwork(network))}</span></span></div>
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

  root.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) ctx.go(b.dataset.go); });
  vs.hasCode().then((h) => { const n = root.querySelector('#vaultLine'); if (alive && n) n.textContent = h ? 'Locked & private' : 'Set your code'; }).catch(() => {});
  if (canRead(ctx.access)) listMedia({ type: 'all', favoritesOnly: true, limit: 3, offset: 0 }).then(async (f) => {
    const box = root.querySelector('#favPics');
    for (const it of f.items) { const url = await thumbnailUrl(it); if (alive && url && box) box.insertAdjacentHTML('beforeend', `<img alt="" src="${esc(url)}">`); }
  }).catch(() => {});
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

  // Cloud meter: empty until the cloud is real. (usedFraction(null) is null by design.)
  const frac = usedFraction(target.ready ? engine.summary().backedUpBytes : null, FREE_PLAN_BYTES);
  if (frac !== null) {
    root.querySelector('#cloudBar').style.width = `${Math.round(frac * 100)}%`;
    root.querySelector('#cloudLine').textContent = `${formatBytes(engine.summary().backedUpBytes)} of ${formatBytes(FREE_PLAN_BYTES)}`;
  }

  if (canRead(ctx.access)) {
    getLibrarySummary().then((s) => {
      if (!alive) return;
      root.querySelector('#phPhotos').textContent = `${formatCount(s.photos.count)} · ${formatBytes(s.photos.bytes)}`;
      root.querySelector('#phVideos').textContent = `${formatCount(s.videos.count)} · ${formatBytes(s.videos.bytes)}`;
      root.querySelector('#phFav').textContent = s.favorites === null || s.favorites === undefined ? '-- (Android 11+)' : formatCount(s.favorites);
      root.querySelector('#libNote').textContent = s.access === 'limited' || s.access === 'web' ? 'Counting only the photos you picked for Photo Hub.' : '';
    }).catch((e) => {
      if (alive) root.querySelector('#libNote').textContent = `Could not read the phone library: ${e.message || e}`;
    });
  }

  refreshWhy();
  const stopNet = await onNetworkChange((n) => { network = n; if (alive) refreshWhy(); });
  return () => { alive = false; stopNet(); };
}
