// swipe.js - C:\MarvelApps\photohub\www\js\lib\swipe.js
// SWIPE BETWEEN PHOTOS (11/25, Scott: "photo needs to be able to pan left to right and back when you have a picture open like normal
// galleries work"). One helper for every photo viewer (Photos, Gallery, Memories, Vault):
//   - drag the open photo left -> the next one slides in; right -> the one before. The photo follows your finger; a short or slow drag
//     springs back; at the first / last photo it stretches and springs back. Up/down drags are left alone.
//   - a PC: the Left / Right arrow keys (Escape closes), and < > buttons at the sides when there is a mouse.
//   - two fingers never page (room for zooming later); a drag that starts on a video's own play bar never pages.
// opts: { canPrev(), canNext(), prev(), next() (may be async - they redraw the viewer), close() }

const SPRING = 'transform 180ms ease-out';

export function attachSwipe(v, opts) {
  let start = null, dx = 0, axis = null, busy = false, fingers = 0;
  const stage = () => v.querySelector('.stage');
  const pic = () => { const s = stage(); return s ? s.firstElementChild : null; };
  const width = () => Math.max(1, v.clientWidth || window.innerWidth || 400);

  // the < > buttons (only shown where there is a mouse - see .vnav in app.css)
  const prevB = document.createElement('button');
  prevB.className = 'vnav prev'; prevB.setAttribute('aria-label', 'Previous photo'); prevB.innerHTML = '&#8249;';
  const nextB = document.createElement('button');
  nextB.className = 'vnav next'; nextB.setAttribute('aria-label', 'Next photo'); nextB.innerHTML = '&#8250;';
  v.append(prevB, nextB);
  const paint = () => { prevB.hidden = !opts.canPrev(); nextB.hidden = !opts.canNext(); };

  async function page(dir) {   // dir -1 = next (content leaves to the left), +1 = previous
    if (busy) return;
    if (dir < 0 ? !opts.canNext() : !opts.canPrev()) { springBack(); return; }
    busy = true;
    const el = pic(), w = width();
    try {
      if (el && el.animate) await el.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${dir * w}px)` }], { duration: 160, easing: 'ease-in' }).finished.catch(() => {});
      await (dir < 0 ? opts.next() : opts.prev());
      const fresh = pic();
      if (fresh && fresh.animate) fresh.animate([{ transform: `translateX(${-dir * w * 0.35}px)`, opacity: 0.25 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'ease-out' });
    } finally {
      dx = 0; busy = false; paint();
    }
  }

  function springBack() {
    const el = pic();
    if (el) { el.style.transition = SPRING; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 200); }
    dx = 0;
  }

  v.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.stage')) return;
    fingers++;
    if (fingers > 1) { if (start) { start = null; springBack(); } return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const vid = e.target.closest('video');
    if (vid && e.clientY > vid.getBoundingClientRect().bottom - 64) return;   // the video's own play bar
    if (e.pointerType === 'mouse') e.preventDefault();   // no "drag the picture out" on a PC
    start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    dx = 0; axis = null;
  });
  v.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id || busy) return;
    const mx = e.clientX - start.x, my = e.clientY - start.y;
    if (!axis && (Math.abs(mx) > 8 || Math.abs(my) > 8)) axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    if (axis !== 'x') return;
    dx = (mx > 0 && !opts.canPrev()) || (mx < 0 && !opts.canNext()) ? mx / 3 : mx;   // stretch at the ends
    const el = pic();
    if (el) { el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`; }
  });
  const end = (e) => {
    fingers = Math.max(0, fingers - 1);
    if (!start || e.pointerId !== start.id) return;
    const quick = Math.abs(dx) > 30 && Date.now() - start.t < 280;
    const far = Math.abs(dx) > width() * 0.18;
    const was = axis;
    start = null;
    if (was === 'x' && (far || quick)) page(dx < 0 ? -1 : 1);
    else if (dx) springBack();
  };
  v.addEventListener('pointerup', end);
  v.addEventListener('pointercancel', end);
  v.addEventListener('dragstart', (e) => { if (e.target.closest('.stage')) e.preventDefault(); });
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
