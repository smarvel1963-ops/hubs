// icons.js - C:\MarvelApps\photohub\www\js\icons.js
// Inline SVG icons (stroke style, currentColor) so the app needs no icon font or network.

const s = (paths, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

export const icons = {
  menu: s('<path d="M4 7h16M4 12h16M4 17h11"/>'),
  bell: s('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  user: s('<circle cx="12" cy="9" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  search: s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  scan: s('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/>'),
  image: s('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
  copies: s('<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2"/>'),
  wand: s('<path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6zM8 3l.5 1.5L10 5l-1.5.5L8 7l-.5-1.5L6 5l1.5-.5z"/>'),
  play: s('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z" fill="currentColor"/>'),
  lock: s('<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4" fill="currentColor"/>'),
  calHeart: s('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M12 18.5s-3.5-2-3.5-4.2a1.8 1.8 0 0 1 3.5-.6 1.8 1.8 0 0 1 3.5.6c0 2.2-3.5 4.2-3.5 4.2z" fill="currentColor" stroke="none"/>'),
  cloudUp: s('<path d="M7 18a5 5 0 0 1-.8-9.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 17 18"/><path d="M12 12v8M9 15l3-3 3 3"/>'),
  cloud: s('<path d="M7 19a5 5 0 0 1-.8-9.9A6 6 0 0 1 17.7 10 4.5 4.5 0 0 1 17 19z"/>'),
  share: s('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>'),
  home: s('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>', 'fill="none"'),
  grid: s('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
  back: s('<path d="m15 5-7 7 7 7"/>'),
  chevron: s('<path d="m9 5 7 7-7 7"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  heart: s('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/>'),
  check: s('<path d="m5 12 4.5 4.5L19 7"/>'),
  wifi: s('<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/>'),
  phone: s('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
  shield: s('<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  folder: s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  people: s('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.8"/>'),
  pin: s('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  paw: s('<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M8 17a4 4 0 0 1 8 0c0 2-2 3-4 3s-4-1-4-3z"/>'),
  cake: s('<path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM4 15c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 11V7M12 4.5v-.1"/>'),
  sparkles: s('<path d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  broom: s('<path d="M14 4 9.5 13M6 13h8l2 7H4z"/><path d="M8 20l.7-3M12 20v-3"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>'),
  settings: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  video: s('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>'),
};

/** The Photo Hub camera logo (colored, not currentColor). */
export const logoSvg = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="lg-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5aa9ff"/><stop offset="1" stop-color="#7b4df0"/></linearGradient>
    <radialGradient id="lg-lens" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#7ef3ff"/><stop offset="0.45" stop-color="#3d6bff"/><stop offset="1" stop-color="#1a1050"/></radialGradient>
  </defs>
  <path d="M22 12h20l4 6H18z" fill="#4c86ff"/>
  <rect x="6" y="16" width="52" height="38" rx="12" fill="url(#lg-body)"/>
  <rect x="11" y="21" width="8" height="5" rx="2" fill="#ffffff" opacity="0.85"/>
  <circle cx="32" cy="35" r="14" fill="#0d1440"/>
  <circle cx="32" cy="35" r="11" fill="url(#lg-lens)"/>
  <circle cx="28" cy="31" r="3" fill="#ffffff" opacity="0.8"/>
  <circle cx="50" cy="23" r="2.4" fill="#ffd36b"/>
</svg>`;
