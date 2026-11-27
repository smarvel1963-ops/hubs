// swipe.js - C:\MarvelApps\photohub\www\js\lib\swipe.js
// SWIPE BETWEEN PHOTOS (11/25, Scott: "photo needs to be able to pan left to right and back when you have a picture open like normal
// galleries work"). One helper for every photo viewer (Photos, Gallery, Memories, Vault):
//   - slide the open photo left -> the next one slides in; right -> the one before. The photo follows your finger; a short or slow drag
//     springs back; at the first / last photo it stretches and springs back.
//   - 11/25 fix (Scott: "slide picks left to right with your fingers not working ... so pans both ways"): a real thumb moves in an arc, and
//     the old version let the browser take any drag that STARTED a little up or down (touch-action pan-y), so the photo never moved.
//     Now the viewer keeps every finger move to itself (touch-action none on the photo): a drag that goes more sideways than about
//     2-to-1 up/down pages, whichever way it started; a straight up / down drag never pages.
//   - like other galleries: pinch with two fingers to zoom the photo (up to 4x), double-tap to zoom in / back out, and drag a zoomed photo
//     around with one finger (a zoomed photo does not page - zoom back out first, or use the arrows). Videos do not zoom.
//   - a PC: the Left / Right arrow keys (Escape closes), < > buttons at the sides when there is a mouse, double-click zooms.
//   - a drag that starts on a video's own play bar never pages.
// opts: { canPrev(), canNext(), prev(), next() (may be async - they redraw the viewer), close() }

const SPRING = 'transform 180ms ease-out';
const MAX_ZOOM = 4, TAP_ZOOM = 2.5;

export function attachSwipe(v, opts) {
  const stage = () => v.querySelector('.stage');
  const pic = () => { const s = stage(); return s ? s.firstElementChild : null; };
  const width = () => Math.max(1, v.clientWidth || window.innerWidth || 400);
  const canZoom = () => { const el = pic(); return !!el && el.tagName === 'IMG'; };

  const pts = new Map();                 // fingers on the photo now: pointerId -> { x, y }
  let start = null, dx = 0, axis = null, busy = false, multi = false;
  let z = 1, tx = 0, ty = 0;             // zoom: scale + how far a zoomed photo is moved
  let pinch = null, pan = null, lastTap = null;

  // the < > buttons (only shown where there is a mouse - see .vnav in app.css)
  const prevB = document.createElement('button');
  prevB.className = 'vnav prev'; prevB.setAttribute('aria-label', 'Previous photo'); prevB.innerHTML = '&#8249;';
  const nextB = document.createElement('button');
  nextB.className = 'vnav next'; nextB.setAttribute('aria-label', 'Next photo'); nextB.innerHTML = '&#8250;';
  v.append(prevB, nextB);
  const paint = () => { prevB.hidden = !opts.canPrev(); nextB.hidden = !opts.canNext(); };

  // ------------------------------------------------------------------ zoom
  function center() {
    const r = stage().getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function clampPan() {
    const el = pic(), s = stage();
    if (!el || !s) return;
    const mx = Math.max(0, (el.offsetWidth * z - s.clientWidth) / 2), my = Math.max(0, (el.offsetHeight * z - s.clientHeight) / 2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  }
  function showZoom(animate) {
    const el = pic();
    if (!el) return;
    el.style.transition = animate ? SPRING : 'none';
    el.style.transform = z === 1 && !tx && !ty ? '' : `translate(${tx}px, ${ty}px) scale(${z})`;
    if (animate) setTimeout(() => { if (el.isConnected) el.style.transition = ''; }, 200);
    v.classList.toggle('zoomed', z > 1);
  }
  function zoomTo(px, py, to) {        // keep the point under (px, py) where it is
    const c = center(), qx = (px - c.x - tx) / z, qy = (py - c.y - ty) / z;
    z = Math.min(MAX_ZOOM, Math.max(1, to));
    tx = px - c.x - z * qx; ty = py - c.y - z * qy;
    if (z === 1) { tx = 0; ty = 0; }
    clampPan(); showZoom(true);
  }
  function unzoom(animate) { z = 1; tx = 0; ty = 0; showZoom(animate); }

  // ------------------------------------------------------------------ paging
  async function page(dir) {   // dir -1 = next (content leaves to the left), +1 = previous
    if (busy) return;
    if (dir < 0 ? !opts.canNext() : !opts.canPrev()) { springBack(); return; }
    busy = true;
    if (z !== 1) unzoom(false);
    const el = pic(), w = width();
    try {
      if (el && el.animate) await el.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${dir * w}px)` }], { duration: 160, easing: 'ease-in' }).finished.catch(() => {});
      await (dir < 0 ? opts.next() : opts.prev());
      const fresh = pic();
      if (fresh && fresh.animate) fresh.animate([{ transform: `translateX(${-dir * w * 0.35}px)`, opacity: 0.25 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'ease-out' });
    } finally {
      dx = 0; busy = false; z = 1; tx = 0; ty = 0; v.classList.remove('zoomed'); paint();
    }
  }

  function springBack() {
    const el = pic();
    if (el && z === 1) { el.style.transition = SPRING; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 200); }
    dx = 0;
  }

  // ------------------------------------------------------------------ fingers / mouse
  const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

  v.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.stage')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const vid = e.target.closest('video');
    if (vid && e.clientY > vid.getBoundingClientRect().bottom - 64) return;   // the video's own play bar
    if (e.pointerType === 'mouse') e.preventDefault();   // no "drag the picture out" on a PC
    if (e.isPrimary) pts.clear();   // a first finger starts fresh (a lost "finger up" can never leave the viewer stuck)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {            // a second finger: no paging - pinch to zoom
      if (dx) springBack();
      start = null; axis = null; pan = null; multi = true;
      if (pts.size === 2 && canZoom()) { const t = two(); const c = center(); pinch = { d: t.d, z, qx: (t.x - c.x - tx) / z, qy: (t.y - c.y - ty) / z }; }
      return;
    }
    multi = false; pinch = null;
    start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    dx = 0; axis = null;
    pan = z > 1 ? { x: e.clientX, y: e.clientY, tx, ty } : null;
  });

  v.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (busy) return;
    if (pinch && pts.size >= 2) {
      const t = two(), c = center();
      z = Math.min(MAX_ZOOM, Math.max(1, pinch.z * (t.d / pinch.d)));
      tx = t.x - c.x - z * pinch.qx; ty = t.y - c.y - z * pinch.qy;
      clampPan(); showZoom(false);
      return;
    }
    if (pan && pts.size === 1) {
      tx = pan.tx + (e.clientX - pan.x); ty = pan.ty + (e.clientY - pan.y);
      clampPan(); showZoom(false);
      return;
    }
    if (!start || e.pointerId !== start.id || multi) return;
    const mx = e.clientX - start.x, my = e.clientY - start.y;
    if (!axis && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 0.5) axis = 'x';   // sideways enough, whichever way it started
    if (axis !== 'x') return;
    dx = (mx > 0 && !opts.canPrev()) || (mx < 0 && !opts.canNext()) ? mx / 3 : mx;   // stretch at the ends
    const el = pic();
    if (el) { el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`; }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    const cancelled = e.type === 'pointercancel';
    pts.delete(e.pointerId);
    if (multi) {                     // the end of a pinch
      if (pts.size === 1 && z > 1) { const [p] = [...pts.values()]; pan = { x: p.x, y: p.y, tx, ty }; } else pan = null;
      if (pts.size < 2) pinch = null;
      if (!pts.size) { multi = false; if (z < 1.05) unzoom(true); }
      start = null;
      return;
    }
    if (pts.size) return;
    const s = start, wasPan = pan;
    start = null; pan = null;
    if (!s || e.pointerId !== s.id) return;
    // a double tap zooms in, or back out
    if (!cancelled && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 12 && Date.now() - s.t < 300) {
      const now = Date.now();
      if (lastTap && now - lastTap.t < 330 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40 && canZoom()) {
        lastTap = null;
        if (z > 1) unzoom(true); else zoomTo(e.clientX, e.clientY, TAP_ZOOM);
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    if (wasPan) return;
    const quick = Math.abs(dx) > 30 && Date.now() - s.t < 280;
    const far = Math.abs(dx) > width() * 0.18;
    const was = axis;
    axis = null;
    if (!cancelled && was === 'x' && (far || quick)) page(dx < 0 ? -1 : 1);
    else if (dx) springBack();
  };
  v.addEventListener('pointerup', end);
  v.addEventListener('pointercancel', end);
  v.addEventListener('dragstart', (e) => { if (e.target.closest('.stage')) e.preventDefault(); });
  // 11/27 fix: after a FAST flick, the browser's own touch handling took the next tap anywhere in the viewer as "stop that fling" and
  // never made it a click - so the first tap on Send to / Add to album / Close after a quick swipe did nothing (proven with real touch
  // input: a slow swipe never lost the tap, a fast one lost it even 6 seconds later). The swipe already runs on pointer events, so the
  // photo's own finger moves are kept from the browser here and it never starts a fling. Taps, pinch and video controls are unchanged.
  v.addEventListener('touchmove', (e) => { if (e.cancelable && e.target.closest && e.target.closest('.stage')) e.preventDefault(); }, { passive: false });
  prevB.addEventListener('click', () => page(1));
  nextB.addEventListener('click', () => page(-1));

  const onKey = (e) => {
    if (!v.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (document.querySelector('.sheet-backdrop') || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); page(-1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); page(1); }
    else if (e.key === 'Escape' && opts.close) { e.preventDefault(); opts.close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
  paint();
  return { paint };
}
