// gallery.js - C:\MarvelApps\photohub\www\js\screens\gallery.js
// GALLERY & SEARCH, new look 11/22 (Scott's design "Gallery & Search"): a search box, filter chips (All, Photos, Videos, Favorites, Dates,
// Places), picture cards (Places, Calendar, Recently Added) and a timeline - This Week, Last Week, This Month, Earlier. Search looks at
// names, months, years, "video" and "favorite". 11/24 (Scott: "Start with steps 1 + 2"): People and Pets are hidden until they are
// built - no "coming" cards for reviewers to tap (Trips came back the same night, built - lib/trips.js). 11/24 TAGS (plan step 3): the Tags chip is back and real - your tags, each
// opening its photos - and search finds tags too (lib/tags.js).

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { tagsOf, allTags } from '../lib/tags.js';
import { canRead, listMedia, listAlbums, thumbnailUrl } from '../native/media-library.js';
import { formatCount } from '../lib/timeline.js';
import { openViewer } from './photos.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const CARDS = [
  { key: 'places', label: 'Places', icon: 'pin', go: '#places', cls: 'g-ocean' },   // 0.7.0
  { key: 'trips', label: 'Trips', icon: 'plane', go: '#trips', cls: 'g-blue' },      // 11/24 (lib/trips.js)
  { key: 'calendar', label: 'Calendar', icon: 'calendar', go: 'dates', cls: 'g-orange' },
  { key: 'recent', label: 'Recently Added', icon: 'image', go: '#photos?type=all&title=Recently%20Added', cls: 'g-violet' },
];

export async function render(root, params, ctx) {
  let alive = true;
  const readable = canRead(ctx.access);
  let mode = params.f || 'all';   // all | image | video | fav | dates
  let all = [];
  let shown = [];   // the timeline rows on screen, for tapping a picture

  root.innerHTML = `<div class="screen">
    <div class="subbar"><h1>Gallery</h1><span class="count" id="gcount"></span></div>
    <label class="search2 field">${icons.search}<input id="q" type="search" placeholder="Search your photos..." aria-label="Search your photos" value="${esc(params.q || '')}"></label>
    <div class="chips" id="chips">
      ${[['all', 'All', 'grid'], ['image', 'Photos', 'image'], ['video', 'Videos', 'play'], ['fav', 'Favorites', 'heart'], ['dates', 'Dates', 'calendar'], ['places', 'Places', 'pin'], ['tags', 'Tags', 'tag']]
        .map(([k, l, ic]) => `<button class="chip ichip ${mode === k ? 'on' : ''}" data-f="${k}">${icons[ic]}${l}</button>`).join('')}
    </div>
    <div class="gcards">${CARDS.map((c) => `<button class="gcard ${c.cls}" data-card="${c.key}" data-cgo="${esc(c.go)}">
        <span class="gpic"></span><span class="glbl">${icons[c.icon]}${esc(c.label)}</span>${icons.chevron}</button>`).join('')}</div>
    <div class="tl-head">${icons.clock}<h2 id="tlTitle">Timeline</h2></div>
    <div id="tl">${readable ? '<div class="loading">Loading photos...</div>' : `<div class="empty"><div class="ico">${icons.image}</div><b>Your photos show up here</b>
      ${ctx.access.web ? 'Pick photos and videos from your phone. They stay on your phone - nothing is uploaded.' : 'Allow photo access to see them.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`}</div>
  </div>`;

  const tl = root.querySelector('#tl');
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'ask') { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); return; }
    if (b.dataset.f) {
      if (b.dataset.f === 'places') { ctx.go('#places'); return; }
      mode = b.dataset.f;
      root.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.f === mode));
      draw();
      return;
    }
    if (b.dataset.cgo === 'dates') { mode = 'dates'; root.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.f === 'dates')); draw(); return; }
    if (b.dataset.cgo) { ctx.go(b.dataset.cgo); return; }
    if (b.dataset.seeall) { ctx.go(b.dataset.seeall); return; }
    if (b.dataset.tag) { ctx.go(`#photos?tag=${encodeURIComponent(b.dataset.tag)}&title=${encodeURIComponent('#' + b.dataset.tag)}`); return; }
    if (b.dataset.month) { ctx.go(`#photos?type=all&bucket=${encodeURIComponent(b.dataset.month)}&title=${encodeURIComponent(b.dataset.mname)}`); return; }
    const cell = b.closest('.tl-cell');
    if (cell) { const it = (shown[+cell.dataset.b] || [])[+cell.dataset.i]; if (it) openViewer(it, { items: () => shown.flat() }); }   // 11/25 swipe through what is on screen
  });
  const q = root.querySelector('#q');
  q.addEventListener('input', () => draw());

  if (!readable) return () => { alive = false; };

  const r = await listMedia({ type: 'all', limit: 5000, offset: 0 }).catch(() => ({ items: [] }));
  if (!alive) return null;
  all = r.items || [];
  root.querySelector('#gcount').textContent = `${formatCount(all.length)} items`;
  // card pictures: Calendar = an older photo, Recently Added = the newest
  const setCard = async (key, item) => { if (!item) return; const url = await thumbnailUrl(item); const el = root.querySelector(`[data-card="${key}"] .gpic`); if (alive && url && el) el.style.backgroundImage = `url("${url}")`; };
  const imgs = all.filter((i) => i.type === 'image');
  setCard('recent', imgs[0]); setCard('calendar', imgs[imgs.length - 1]);

  function matches(it, text) {
    if (!text) return true;
    const d = new Date(it.date);
    const hay = `${it.name || ''} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${it.type === 'video' ? 'video videos' : 'photo photos picture'} ${it.favorite ? 'favorite favorites heart' : ''} ${it.bucketName || ''} ${tagsOf(it).join(' ')}`.toLowerCase();
    return text.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }

  async function draw() {
    const text = q.value.trim();
    if (mode === 'dates' && !text) return drawMonths();
    if (mode === 'tags' && !text) return drawTags();
    const list = all.filter((it) => (mode === 'all' || mode === 'dates' || mode === 'tags' || (mode === 'fav' ? it.favorite : it.type === mode)) && matches(it, text));
    root.querySelector('#tlTitle').textContent = text ? `Results for "${text}"` : 'Timeline';
    if (!list.length) { tl.innerHTML = `<div class="empty"><div class="ico">${icons.search}</div><b>Nothing found</b>${text ? 'Try a month, a year, a tag, "video" or "favorite".' : 'No photos here yet.'}</div>`; return; }
    const now = Date.now(), startOfDay = new Date(new Date().toDateString()).getTime();
    const weekStart = startOfDay - ((new Date().getDay() + 6) % 7) * 86400000;
    const lastWeek = weekStart - 7 * 86400000;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const buckets = text ? [['Matches', list]] : [
      ['This Week', list.filter((i) => i.date >= weekStart && i.date <= now + 86400000)],
      ['Last Week', list.filter((i) => i.date >= lastWeek && i.date < weekStart)],
      ['This Month', list.filter((i) => i.date >= monthStart && i.date < lastWeek)],
      ['Earlier', list.filter((i) => i.date < Math.min(monthStart, lastWeek))],
    ].filter(([, l]) => l.length);
    shown = buckets.map(([, l]) => l);
    tl.innerHTML = buckets.map(([name, l], bi) => `<div class="tl-row"><div class="tl-label"><i></i><span>${esc(name)}</span><small>${formatCount(l.length)}</small></div>
      <div class="tl-pics">${l.slice(0, text ? 60 : 10).map((it, i) => `<button class="tl-cell" data-b="${bi}" data-i="${i}"><img alt="">${it.type === 'video' ? `<span class="dur">${icons.play}</span>` : ''}${it.favorite ? `<span class="fav">${icons.heart}</span>` : ''}</button>`).join('')}
      ${!text && l.length > 10 ? `<button class="tl-more" data-seeall="#photos?type=${mode === 'video' ? 'video' : mode === 'image' ? 'image' : 'all'}${mode === 'fav' ? '&fav=1' : ''}&title=All%20Photos">See all ${formatCount(l.length)}</button>` : ''}</div></div>`).join('');
    for (const [bi, [, l]] of buckets.entries()) {
      l.slice(0, text ? 60 : 10).forEach((it, i) => thumbnailUrl(it).then((url) => {
        const img = tl.querySelector(`[data-b="${bi}"][data-i="${i}"] img`);
        if (alive && url && img) { img.src = url; img.classList.add('ready'); }
      }));
    }
  }

  function drawTags() {
    root.querySelector('#tlTitle').textContent = 'Your tags';
    const ts = allTags();
    if (!ts.length) { tl.innerHTML = `<div class="empty"><div class="ico">${icons.tag}</div><b>No tags yet</b>Open a photo and tap Tags to add your own words - like "beach" or "grandkids". Then find them here.</div>`; return; }
    tl.innerHTML = `<div class="album-grid">${ts.map((x) => `<button class="album-card" data-tag="${esc(x.tag)}"><span class="ph">${icons.tag}</span><span class="meta"><b>#${esc(x.tag)}</b><span>${formatCount(x.n)} ${x.n === 1 ? 'photo' : 'photos'}</span></span></button>`).join('')}</div>`;
  }

  async function drawMonths() {
    root.querySelector('#tlTitle').textContent = 'By month';
    const { albums } = await listAlbums().catch(() => ({ albums: [] }));
    if (!alive) return;
    if (!albums.length) { tl.innerHTML = '<div class="empty"><b>No dates yet</b></div>'; return; }
    tl.innerHTML = `<div class="album-grid">${albums.map((a) => `<button class="album-card" data-month="${esc(a.bucketId)}" data-mname="${esc(a.name)}"><span class="ph">${icons.calendar}</span><span class="meta"><b>${esc(a.name)}</b><span>${formatCount(a.count)} ${a.count === 1 ? 'item' : 'items'}</span></span></button>`).join('')}</div>`;
    for (const a of albums) {
      if (!a.cover) continue;
      thumbnailUrl(a.cover).then((url) => { const c = tl.querySelector(`[data-month="${CSS.escape(a.bucketId)}"]`); if (alive && url && c) c.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`); });
    }
  }

  draw();
  return () => { alive = false; };
}
