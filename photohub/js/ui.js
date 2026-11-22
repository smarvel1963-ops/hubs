// ui.js - C:\MarvelApps\photohub\www\js\ui.js
// Shared screen helpers: HTML escaping, the bottom sheet, the "Coming in a later phase" sheet and the
// plain-words photo permission explainer shown BEFORE Android's own prompt.

import { icons } from './icons.js';
import { requestAccess, openAppSettings } from './native/media-library.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Bottom sheet. actions: [{ label, primary, onClick }]. Returns close(). */
export function openSheet({ icon = 'info', title, phase = '', body = '', list = [], actions = [{ label: 'OK', primary: true }] }) {
  const back = el(`<div class="sheet-backdrop" role="dialog" aria-modal="true">
    <div class="sheet">
      <div class="grab"></div>
      <div class="sheet-ico">${icons[icon] || icons.info}</div>
      <h2>${esc(title)}</h2>
      ${phase ? `<p class="phase">${esc(phase)}</p>` : ''}
      ${body ? `<p>${esc(body)}</p>` : ''}
      ${list.length ? `<ul>${list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : ''}
      <div class="actions"></div>
    </div>
  </div>`);
  const close = () => back.remove();
  const box = back.querySelector('.actions');
  for (const a of actions) {
    const b = el(`<button class="${a.primary ? 'primary-btn' : 'ghost-btn'}">${esc(a.label)}</button>`);
    b.addEventListener('click', async () => { close(); if (a.onClick) await a.onClick(); });
    box.appendChild(b);
  }
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.appendChild(back);
  return close;
}

// Features that are on the boards but not built in this skeleton. No numbers, no fake data - just what comes later.
export const LATER = {
  duplicates: { icon: 'copies', title: 'Duplicate Cleanup', text: 'Finds duplicate and blurry photos, on your phone, for free. It comes after backup is working.' },
  restore: { icon: 'wand', title: 'Restore & Enhance', text: 'Repairs old, faded or scratched photos. Your original is always kept, and anything the AI adds is labelled.' },
  vault: { icon: 'lock', title: 'Private Vault', text: 'A locked place for your most private photos and videos.' },
  memories: { icon: 'calHeart', title: 'Memories & Highlights', text: '"This week in past years", trip stories and slideshows.' },
  share: { icon: 'share', title: 'Share & Create', text: 'Share a photo or album by private link, then cards, collages and prints.' },
  search: { icon: 'search', title: 'Search', text: 'Search by date, place, person or things like "beach" and "dog" - done on your phone first.' },
  people: { icon: 'people', title: 'People', text: 'Groups photos of the same person. Done on your phone, and only if you turn it on.' },
  places: { icon: 'pin', title: 'Places', text: 'Your photos on a map and by place.' },
  pets: { icon: 'paw', title: 'Pets', text: 'Finds the photos of your pets. Done on your phone, and only if you turn it on.' },
  events: { icon: 'cake', title: 'Events', text: 'Birthdays, holidays and trips, gathered for you.' },
  aiTools: { icon: 'sparkles', title: 'AI Photo Tools', text: 'Organize, clean up, restore and bring old photos back to life.' },
  trips: { icon: 'plane', title: 'Vacation Trips', text: 'Your trips gathered for you - dates, places, people, photos and videos together.' },
  tags: { icon: 'tag', title: 'Tags', text: 'Add your own words to photos and find them by tag.' },
  account: { icon: 'user', title: 'Sign in', text: 'Sign in with Google (like Family Hub) so your backup follows you to a new phone.' },
  alerts: { icon: 'bell', title: 'Notifications', text: 'Backup finished, phone space tips and memories.' },
};

/** A sheet with one text box (album names). Resolves to the text, or null on Cancel. */
export function askText({ title, label = '', value = '', ok = 'Save' }) {
  return new Promise((resolve) => {
    const back = el(`<div class="sheet-backdrop" role="dialog" aria-modal="true"><div class="sheet"><div class="grab"></div>
      <h2>${esc(title)}</h2>${label ? `<p>${esc(label)}</p>` : ''}<input class="text-in" maxlength="40" value="${esc(value)}" aria-label="${esc(title)}">
      <div class="actions"><button class="primary-btn" data-ok>${esc(ok)}</button><button class="ghost-btn" data-no>Cancel</button></div></div></div>`);
    const input = back.querySelector('input');
    const done = (v) => { back.remove(); resolve(v); };
    back.querySelector('[data-ok]').addEventListener('click', () => done(input.value.trim() || null));
    back.querySelector('[data-no]').addEventListener('click', () => done(null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value.trim() || null); });
    back.addEventListener('click', (e) => { if (e.target === back) done(null); });
    document.body.appendChild(back);
    setTimeout(() => input.focus(), 50);
  });
}

export function comingLater(key) {
  const f = LATER[key] || { icon: 'info', title: 'Coming soon', text: '' };
  openSheet({ icon: f.icon, title: f.title, phase: 'Coming in a later phase', body: f.text });
}

/**
 * Explain in plain words, then let Android ask. Returns the new access object (or the old one on "Not now").
 * If access was refused before, Android will not ask again - offer the Settings page instead.
 */
export function askForPhotoAccess(current) {
  return new Promise((resolve) => {
    // WEB VERSION (11/22): the person picks photos with the phone's own picker - they stay on the phone
    if (current && current.web) {
      openSheet({
        icon: 'image',
        title: current.state === 'granted' ? 'Pick more photos' : 'Pick photos to try Photo Hub',
        body: 'Photo Hub shows the photos and videos you pick, newest first, grouped by day and by month.',
        list: [
          'Pick as many as you like - "Select all" works.',
          'They stay on your phone. Nothing is uploaded and nothing is changed.',
          'This web version forgets them when you close it - pick again next time.',
          'The phone app reads your whole library and backs it up - coming to Google Play.',
        ],
        actions: [
          { label: 'Pick photos', primary: true, onClick: async () => { try { resolve(await requestAccess()); } catch (e) { resolve(current); } } },
          { label: 'Not now', onClick: () => resolve(current) },
        ],
      });
      return;
    }
    if (current && current.state === 'denied') {
      openSheet({
        icon: 'image',
        title: 'Photo access is turned off',
        body: 'To see your photos here, turn on "Photos and videos" for Photo Hub in your phone\'s settings.',
        actions: [
          { label: 'Open Settings', primary: true, onClick: async () => { await openAppSettings(); resolve(current); } },
          { label: 'Not now', onClick: () => resolve(current) },
        ],
      });
      return;
    }
    openSheet({
      icon: 'image',
      title: 'Let Photo Hub see your photos',
      body: 'Photo Hub shows your photos and videos here, newest first, grouped by day.',
      list: [
        'It only reads them. It never changes or deletes a photo.',
        'In this test version nothing leaves your phone.',
        'Later, cloud backup will only run if you turn it on.',
        'Android asks next: you can allow all, or pick some photos.',
      ],
      actions: [
        { label: 'Continue', primary: true, onClick: async () => { try { resolve(await requestAccess()); } catch (e) { resolve(current); } } },
        { label: 'Not now', onClick: () => resolve(current) },
      ],
    });
  });
}
