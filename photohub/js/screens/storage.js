// storage.js - C:\MarvelApps\photohub\www\js\screens\storage.js
// CLOUD (plan section 4 + 19): Google sign-in, Auto Backup, Wi-Fi only, keep favorites on this phone, storage numbers.
// 11/22 cloud is REAL (Scott: "Yes, build it"): backups go to Photo Hub's service on Cloudflare -> Backblaze B2 (US East), each person in
// their own folder. Every number here is real: the backup engine's own counts and what the cloud says it holds. Nothing on this screen
// deletes anything. 11/24 (Scott: "Start with steps 1 + 2"): the greyed-out Device Cleanup card is hidden until Clean Up is built, after
// the never-lose-a-photo checks (docs/UNFINISHED_PAGES_2026-11-24.md). 11/25 (plan steps 5 + 6): built - the phone app (0.7.6+) shows
// Device Cleanup (#cleanup, every photo checked against the cloud first) and Duplicate Cleanup (#copies, exact copies only). The web
// version never shows them: a browser can't remove photos from a phone.
//   Phone app: Auto Backup reads the phone library and backs up what is not in the cloud yet - while Photo Hub is open, and since
//   0.4.0 also in the background about every hour on Wi-Fi (android BackupWorker), with the last background run shown here.
//   Web version (PC / iPhone / Android browser): backs up the photos picked this visit (automatically, or "Back up now").

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, getLibrarySummary, listMedia, thumbnailUrl } from '../native/media-library.js';
import * as vs from '../lib/vault-store.js';
import { rememberedStats, forgetAll } from '../native/web-library.js';
import { getNetwork, onNetworkChange, describeNetwork } from '../native/network.js';
import { loadSettings, saveSettings } from '../lib/settings.js';
import { formatBytes, formatCount } from '../lib/timeline.js';
import * as account from '../lib/account.js';
import * as runner from '../backup/runner.js';
import { cloudCall } from '../backup/cloud-target.js';
import * as albumSync from '../lib/album-sync.js';
import { PRIVACY_URL } from './more.js';
import * as cleanup from '../native/cleanup.js';

export async function render(root, params, ctx) {
  let alive = true;
  let settings = loadSettings();
  let network = await getNetwork();
  let bgInfo = null;                       // 0.4.0: the last background run (null = this app build has no background backup)
  const web = !!ctx.access.web || !(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());
  await account.init();

  root.innerHTML = `<div class="screen cloud2">
    <div class="subbar"><h1>Cloud</h1></div>

    <section class="card c2-backup">
      <div class="c2-orb" id="orb">${icons.cloud}</div>
      <div class="c2-txt"><b>Backup</b>
        <span class="c2-pill" id="pill">Not set up yet</span>
        <p id="why"></p>
        <div class="c2-acct" id="acct"></div>
        ${web ? `<button class="primary-btn" id="now" hidden>${icons.cloudUp || icons.cloud} Back up now</button>` : ''}
        <p class="note" id="extra"></p></div>
    </section>
    ${web ? `<p class="note">On an iPhone or any phone's browser: tap <b>Pick photos</b>, choose your photos (on iPhone you can drag
      across them to choose many), then <b>Back up now</b>. The Photo Hub app backs up the whole phone by itself.</p>` : ''}

    <section class="card">
      <div class="card-head">${icons.database}<h2>Storage</h2><span class="c2-amt" id="cloudLine">Cloud: not signed in</span></div>
      <div class="stats" style="margin-top:12px">
          <div class="stat"><span>Photos ${web ? 'picked' : 'on phone'}</span><b id="phPhotos">--</b></div>
          <div class="stat"><span>Videos ${web ? 'picked' : 'on phone'}</span><b id="phVideos">--</b></div>
          <div class="stat"><span>Favorites (stay on phone)</span><b id="phFav">--</b></div>
      </div>
      ${web ? '<p class="note" id="remLine"></p><button class="ghost-btn" id="forget" hidden>Forget my photos</button>' : ''}
      <p class="note" id="libNote">${canRead(ctx.access) ? '' : 'Phone numbers show once you allow photo access.'}</p>
      ${canRead(ctx.access) || ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${web ? 'Pick photos' : 'Allow photo access'}</button>`}
    </section>

    <section class="card" id="pcCard" hidden>
      <div class="card-head">${icons.database}<h2>Keep a copy on my PC</h2></div>
      <p class="note">Your cloud backups can also be copied to your own computer's drive, automatically, by the Photo Hub PC helper.
        Link the PC once with a code - the code can only read your backups, never change or delete them.</p>
      <div id="pcList"></div>
      <button class="primary-btn" id="pcLink">Link a PC</button>
      <!-- 11/25 (Scott: bring Dropbox / Google / OneDrive in "so we can close them"): an IMPORT code lets the PC import tool ADD the photos
           and videos copied from other clouds - it can never delete anything -->
      <button class="ghost-btn" id="pcImport">Link a PC for importing</button>
      <div id="pcCode" hidden>
        <p class="note"><b id="pcCodeTitle">Your PC code</b> - copy it now (it is shown only once):</p>
        <input class="text-in" id="pcCodeBox" readonly style="width:100%;font-family:monospace;font-size:13px">
        <button class="ghost-btn" id="pcCopy">Copy code</button>
        <p class="note" id="pcCodeNote">On the PC: open the Photo Hub PC helper, open its page, and paste the code under <b>Copy from the cloud</b>.
          New photos then land in your PC's photo folder every 10 minutes while the helper is open.</p>
      </div>
      <p class="note" id="pcMsg"></p>
    </section>

    ${cleanup.available() ? `<section class="card c2-clean">
      <span class="c2-ico">${icons.broom}</span><div class="c2-txt"><b>Device Cleanup</b><span>Free up phone space - only photos checked in your cloud</span></div>
      <button class="pill-btn" data-go="#cleanup">Clean Up ${icons.chevron}</button>
    </section>
    <section class="card c2-clean">
      <span class="c2-ico">${icons.copies}</span><div class="c2-txt"><b>Duplicate Cleanup</b><span>The same photo saved twice</span></div>
      <button class="pill-btn" data-go="#copies">Find ${icons.chevron}</button>
    </section>
    <p class="note">Clean Up never touches favorites, photos you hearted, put in an album or tagged, or the last 30 days - and Android asks
      you first. Removed photos sit in the phone's trash about 30 days.</p>` : ''}

    <div class="c2-two">
      <button class="card c2-fav" data-go="#photos?type=all&fav=1&title=Favorites"><span class="c2-ico rose">${icons.heart}</span><b>Favorites</b><span>Saved on your phone</span><span class="c2-pics" id="favPics"></span></button>
      <button class="card c2-vault" data-go="#vault"><span class="c2-ico violet">${icons.lock}</span><b>Private Vault</b><span id="vaultLine">Locked &amp; private</span><span class="c2-lockart">${icons.lock}</span></button>
    </div>

    <section class="card">
      <div class="card-head">${icons.settings}<h2>Backup settings</h2></div>
      ${toggle('backupEnabled', 'cloudUp', 'Auto Backup', web ? 'Backs up the photos you pick, as soon as you pick them' : runner.hasBackground() ? 'Backs up new photos and videos - in the background too, about every hour' : 'Backs up new photos and videos while Photo Hub is open')}
      ${web ? '' : toggle('wifiOnly', 'wifi', 'Backup over Wi-Fi only', 'Never uses your mobile data')}
      ${toggle('keepFavoritesOnDevice', 'heart', 'Keep favorites on this phone', 'Hearted photos are backed up AND always stay on the phone')}
      <div class="row"><span class="ico">${icons.wifi}</span><span class="txt"><b>Right now</b><span id="netLine">${esc(describeNetwork(network))}</span></span></div>
    </section>
    <p class="note">Your backups go to Photo Hub's own cloud storage in the USA (Virginia), in a folder only your sign-in can open. Deleted
      backups are kept 30 days in case of a mistake, then removed.</p>
  </div>`;

  function toggle(key, icon, title, sub) {
    return `<label class="row"><span class="ico">${icons[icon] || icons.cloud}</span><span class="txt"><b>${esc(title)}</b><span>${esc(sub)}</span></span>
      <span class="switch"><input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}><i></i></span></label>`;
  }

  // ---------- backup card: sign-in + live status ----------
  function statusText(s) {
    const sum = s.summary || { total: 0, backedUp: 0, queued: 0, failed: 0, needsAttention: 0, uploading: 0 };
    const left = sum.queued + sum.failed + sum.uploading;
    switch (s.phase) {
      case 'off': return web ? 'Auto Backup is off - tap Back up now, or turn Auto Backup on below.' : 'Auto Backup is off. Turn it on below to back up this phone.';
      case 'no_signin': return 'Sign-in comes with the next Photo Hub app update. Your photos stay on this phone until then.';
      case 'signed_out': return 'Sign in with Google to back up your photos.';
      case 'waiting': return s.reason === 'waiting_for_wifi' ? 'On mobile data - backup waits for Wi-Fi.' : 'Offline - backup waits for a connection.';
      case 'not_allowed': return s.reason || 'Cloud backup is not open to this account yet.';
      case 'unreachable': return 'Could not reach the cloud right now - Photo Hub will try again.';
      case 'scanning': return 'Checking which photos still need a backup...';
      case 'uploading': return `Backing up... ${formatCount(sum.backedUp)} of ${formatCount(sum.total)} done.`;
      case 'done':
        if (!sum.total) return web ? 'Pick photos to back them up.' : 'Nothing to back up yet.';
        if (!left) return `All ${formatCount(sum.backedUp)} ${web ? 'picked ' : ''}photos are backed up and checked.`;
        return `${formatCount(sum.backedUp)} backed up and checked. ${formatCount(left)} will be tried again${sum.needsAttention ? ` (${formatCount(sum.needsAttention)} need a look)` : ''}.`;
      default: return settings.backupEnabled ? 'Starting backup...' : '';
    }
  }

  function paint(s = runner.status()) {
    if (!alive) return;
    const u = account.current();
    const okPhases = ['scanning', 'uploading', 'done', 'waiting'];
    const connected = !!u && okPhases.includes(s.phase);
    root.querySelector('#orb').classList.toggle('ok', connected);
    const pill = root.querySelector('#pill');
    pill.classList.toggle('ok', connected);
    pill.innerHTML = connected ? `${icons.check} Connected` : u ? 'Signed in' : 'Not set up yet';
    root.querySelector('#why').textContent = statusText(s);
    const acct = root.querySelector('#acct');
    if (!account.available()) acct.innerHTML = '';
    else if (u) acct.innerHTML = `<span class="note">Signed in as <b>${esc(u.email || u.name || 'you')}</b></span> <button class="ghost-btn" id="out">Sign out</button>
      <button class="ghost-btn" id="delacct">Delete my account and backups</button>`;
    else acct.innerHTML = `<button class="primary-btn" id="in">Sign in with Google</button>`;
    const extra = [];
    if (s.tooBig) extra.push(`${formatCount(s.tooBig)} video${s.tooBig === 1 ? '' : 's'} over 95 MB wait for a later update.`);
    if (!web && settings.backupEnabled && u) {
      if (!runner.hasBackground()) extra.push('Backs up while Photo Hub is open.');
      else {
        let t = `Also backs up in the background about every hour${settings.wifiOnly ? ' on Wi-Fi' : ''}, even with Photo Hub closed.`;
        const b = bgInfo;
        if (b && b.lastRun) {
          const when = new Date(b.lastRun).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          const why = { 'signed out': 'it needs you signed in', 'no photo access': 'it needs photo access', 'not allowed': 'this account is not open for backup' }[b.lastStop] || (b.lastStop ? b.lastStop : '');
          t += ` Last background run ${when}: ${formatCount(b.lastUploaded)} backed up${b.lastLeft ? `, ${formatCount(b.lastLeft)} still to go` : ''}${b.lastFailed ? `, ${formatCount(b.lastFailed)} to retry` : ''}${why ? ' - ' + why : ''}.`;
        } else t += ' First background run within the hour.';
        extra.push(t);
      }
    }
    if (s.summary && s.summary.rechecking) extra.push(`Keeping where your photos were taken: checking ${formatCount(s.summary.rechecking)} backed-up photos once more - only the ones that had a location go up again, as the true original.`);
    if (u) {   // 11/22 album sync
      const al = albumSync.status();
      if (al.error) extra.push(`Albums: not saved to the cloud yet - ${al.error}.`);
      else if (al.last) extra.push(`Your albums are kept in the cloud too (saved ${new Date(al.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}) - they show on the web version, a new phone and your PC copy.`);
    }
    root.querySelector('#extra').textContent = extra.join(' ');
    const now = root.querySelector('#now');
    if (now) { now.hidden = !u; now.disabled = s.phase === 'uploading' || s.phase === 'scanning'; }
    const line = root.querySelector('#cloudLine');
    if (s.me && u) line.textContent = `Cloud: ${formatCount(s.me.photos)} photo${s.me.photos === 1 ? '' : 's'} · ${formatBytes(s.me.bytes)}`;
    else line.textContent = u ? 'Cloud: checking...' : 'Cloud: not signed in';
    root.querySelector('#netLine').textContent = `${describeNetwork(network)}${!web && settings.wifiOnly && network.type !== 'wifi' ? ' - backup waits for Wi-Fi' : ''}`;
    // 11/22 Keep a copy on my PC: only for someone signed in whose cloud backup is open
    const pcOk = !!u && !['not_allowed', 'no_signin', 'signed_out', 'unreachable'].includes(s.phase);
    const pc = root.querySelector('#pcCard');
    if (pc.hidden === pcOk) { pc.hidden = !pcOk; if (pcOk) loadPcs(); }
  }

  // ---------- Keep a copy on my PC (PC links) ----------
  async function loadPcs() {
    const box = root.querySelector('#pcList');
    try {
      const { devices } = await cloudCall(account, '/v1/devices');
      if (!alive) return;
      box.innerHTML = devices.length ? devices.map((d) => `<div class="row"><span class="ico">${icons.database}</span><span class="txt"><b>${esc(d.name)}</b>
        <span>${d.can === 'import' ? 'Import - adds photos, never deletes · ' : ''}Linked ${esc(new Date(d.created).toLocaleDateString())}${d.last ? ' · last used ' + esc(new Date(d.last).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : ' · not used yet'}</span></span>
        <button class="ghost-btn" data-pcrm="${esc(d.id)}">Remove</button></div>`).join('') : '';
    } catch (e) { if (alive) box.innerHTML = `<p class="note">${esc(e.message || String(e))}</p>`; }
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { ctx.go(b.dataset.go); return; }
    if (e.target.closest('#in')) {
      const btn = e.target.closest('#in');
      btn.disabled = true;
      try { await account.signIn(); runner.kick(); } catch (err) { root.querySelector('#why').textContent = err.message || String(err); }
      btn.disabled = false;
      paint();
      return;
    }
    if (e.target.closest('#delacct')) {   // 11/23 Play: account deletion must be reachable in the app - opens the privacy page's steps
      window.open(web ? './privacy.html#delete' : PRIVACY_URL + '#delete', '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#out')) {
      if (!confirm('Sign out of cloud backup on this ' + (web ? 'browser' : 'phone') + '? Nothing is deleted - your backups stay in the cloud.')) return;
      await account.signOut();
      runner.reset();
      paint();
      return;
    }
    if (e.target.closest('#now')) { runner.kick({ now: true }); paint(); }
    if (e.target.closest('#pcLink')) {
      const btn = e.target.closest('#pcLink'), msg = root.querySelector('#pcMsg');
      btn.disabled = true; msg.textContent = '';
      try {
        const name = (prompt('A name for this PC (so you can tell it apart later):', 'My PC') || 'My PC').slice(0, 40);
        const r = await cloudCall(account, '/v1/devices', { method: 'POST', body: JSON.stringify({ name }) });
        root.querySelector('#pcCodeBox').value = r.code;
        root.querySelector('#pcCode').hidden = false;
        loadPcs();
      } catch (err) { msg.textContent = err.message || String(err); }
      btn.disabled = false;
      return;
    }
    if (e.target.closest('#pcImport')) {   // 11/25 an add-only code for the PC import tool (pc-helper/photohub_import.py)
      const btn = e.target.closest('#pcImport'), msg = root.querySelector('#pcMsg');
      btn.disabled = true; msg.textContent = '';
      try {
        const r = await cloudCall(account, '/v1/devices', { method: 'POST', body: JSON.stringify({ name: 'My PC (import)', import: true }) });
        root.querySelector('#pcCodeBox').value = r.code;
        root.querySelector('#pcCodeTitle').textContent = 'Your import code';
        root.querySelector('#pcCodeNote').textContent = 'Paste it when the Photo Hub import on your PC asks for it. It can only ADD photos and videos to your cloud - never delete or change anything. Remove it here when the import is done.';
        root.querySelector('#pcCode').hidden = false;
        loadPcs();
      } catch (err) { msg.textContent = err.message || String(err); }
      btn.disabled = false;
      return;
    }
    if (e.target.closest('#pcCopy')) {
      const box = root.querySelector('#pcCodeBox');
      try { await navigator.clipboard.writeText(box.value); } catch (err) { box.select(); document.execCommand('copy'); }
      root.querySelector('#pcMsg').textContent = 'Code copied - paste it into the PC helper.';
      return;
    }
    const rm = e.target.closest('[data-pcrm]');
    if (rm) {
      if (!confirm('Remove this PC link? The PC stops copying new photos. Photos already on it stay there.')) return;
      try { await cloudCall(account, '/v1/devices/' + rm.dataset.pcrm, { method: 'DELETE' }); root.querySelector('#pcCode').hidden = true; loadPcs(); }
      catch (err) { root.querySelector('#pcMsg').textContent = err.message || String(err); }
    }
  });

  // 11/22 remembered picks: how many small copies this phone keeps, and Forget my photos
  if (web) rememberedStats().then((r) => {
    const line = root.querySelector('#remLine'), btn = root.querySelector('#forget');
    if (!alive || !line) return;
    line.textContent = r.count ? `Remembered on this phone: ${formatCount(r.count)} small ${r.count === 1 ? 'copy' : 'copies'} · ${formatBytes(r.bytes)}. Full size comes back when you pick a photo again.` : 'Photos you pick are remembered here as small copies, so they are waiting next time.';
    if (r.count) { btn.hidden = false; btn.onclick = async () => { if (!confirm('Forget the photos Photo Hub remembers on this phone? Your hearts, albums, vault and cloud backups stay.')) return; await forgetAll(); ctx.setAccess(await ctx.refreshAccess()); ctx.rerender(); }; }
  }).catch(() => {});
  vs.hasCode().then((h) => { const n = root.querySelector('#vaultLine'); if (alive && n) n.textContent = !h ? 'Set your code' : vs.isOpen() ? 'Open now - Lock is inside' : 'Locked & private'; }).catch(() => {});   // 11/26 once a session
  if (canRead(ctx.access)) listMedia({ type: 'all', favoritesOnly: true, limit: 3, offset: 0 }).then(async (f) => {
    const box = root.querySelector('#favPics');
    for (const it of f.items) { const url = await thumbnailUrl(it); if (alive && url && box) box.insertAdjacentHTML('beforeend', `<img alt="" src="${esc(url)}">`); }
  }).catch(() => {});
  root.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-key]');
    if (!input) return;
    settings = saveSettings({ [input.dataset.key]: input.checked });
    if (input.dataset.key === 'backupEnabled' || input.dataset.key === 'wifiOnly') runner.kick();
    paint();
  });
  const ask = root.querySelector('#ask');
  if (ask) ask.addEventListener('click', async () => {
    const a = await askForPhotoAccess(ctx.access);
    ctx.setAccess(a);
    if (canRead(a)) { runner.kick(); ctx.rerender(); }
  });

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

  paint();
  const loadBg = () => runner.backgroundStatus().then((b) => { bgInfo = b; if (alive) paint(); }).catch(() => {});
  loadBg();
  const bgTimer = setInterval(loadBg, 60000);
  const stopStatus = runner.onStatus((st2) => { paint(st2); });
  const stopAcct = account.onChange(() => paint());
  const stopNet = await onNetworkChange((n) => { network = n; paint(); });
  runner.kick();
  return () => { alive = false; clearInterval(bgTimer); stopStatus(); stopAcct(); stopNet(); };
}
