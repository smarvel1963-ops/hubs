// tools.js - C:\MarvelApps\photohub\www\js\screens\tools.js
// Tools: Smart Storage is real; Free Up Phone Space is shown disabled (comes after the never-lose-a-photo tests);
// the AI / cleanup tools from the boards open the "Coming in a later phase" sheet.

import { icons } from '../icons.js';
import { comingLater } from '../ui.js';

const ROWS = [
  { icon: 'cloudUp', title: 'Smart Storage', sub: 'Backup, Wi-Fi only, favorites on phone', go: '#storage', badge: '' },
  { icon: 'broom', title: 'Free Up Phone Space', sub: 'Comes after the never-lose-a-photo tests', disabled: true, badge: 'Not yet' },
  { icon: 'copies', title: 'Duplicate Cleanup', sub: 'Duplicates and blurry photos', later: 'duplicates', badge: 'Later' },
  { icon: 'wand', title: 'Restore & Enhance', sub: 'Old and damaged photos', later: 'restore', badge: 'Later' },
  { icon: 'lock', title: 'Private Vault', sub: 'A locked album', later: 'vault', badge: 'Later' },
  { icon: 'calHeart', title: 'Memories & Highlights', sub: 'This week in past years', later: 'memories', badge: 'Later' },
  { icon: 'share', title: 'Share & Create', sub: 'Private links, cards, collages', later: 'share', badge: 'Later' },
];

export async function render(root, params, ctx) {
  root.innerHTML = `<div class="screen">
    <div class="subbar"><h1>Tools</h1></div>
    ${ROWS.map((r, i) => `<button class="row" data-i="${i}" ${r.disabled ? 'disabled' : ''}>
      <span class="ico">${icons[r.icon]}</span>
      <span class="txt"><b>${r.title}</b><span>${r.sub}</span></span>
      ${r.badge ? `<span class="badge">${r.badge}</span>` : icons.chevron}
    </button>`).join('')}
  </div>`;
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b || b.disabled) return;
    const r = ROWS[Number(b.dataset.i)];
    if (r.go) ctx.go(r.go);
    else if (r.later) comingLater(r.later);
  });
  return null;
}
