// timeline.js - C:\MarvelApps\photohub\www\js\lib\timeline.js
// Pure helpers for the Photos timeline and the storage numbers (no DOM, so the tests run them in Node).
// Days are the phone's LOCAL calendar days.

const MS_DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", "Wed, Nov 18" (this year), "Mar 3, 2025" (other years). */
export function formatDayLabel(ms, nowMs = Date.now()) {
  if (!Number.isFinite(ms) || ms <= 0) return 'Unknown date';
  const diffDays = Math.round((startOfDay(nowMs) - startOfDay(ms)) / MS_DAY);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const d = new Date(ms);
  if (d.getFullYear() === new Date(nowMs).getFullYear()) return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Group items (each with .date in ms) into days, newest day first, newest item first inside a day.
 * Items with no usable date go in one "Unknown date" group at the end.
 */
export function groupByDay(items, nowMs = Date.now()) {
  const groups = new Map();
  const unknown = [];
  for (const it of items || []) {
    if (!Number.isFinite(it.date) || it.date <= 0) { unknown.push(it); continue; }
    const key = dayKey(it.date);
    if (!groups.has(key)) groups.set(key, { key, label: formatDayLabel(it.date, nowMs), start: startOfDay(it.date), items: [] });
    groups.get(key).items.push(it);
  }
  const out = [...groups.values()].sort((a, b) => b.start - a.start);
  for (const g of out) g.items.sort((a, b) => b.date - a.date);
  if (unknown.length) out.push({ key: 'unknown', label: 'Unknown date', start: 0, items: unknown });
  return out;
}

/** Append a new page of items to existing groups (keeps day headers unique while scrolling). */
export function mergeIntoGroups(groups, newItems, nowMs = Date.now()) {
  const all = [];
  for (const g of groups || []) all.push(...g.items);
  all.push(...(newItems || []));
  return groupByDay(all, nowMs);
}

/** 1536 -> "1.5 KB". null/undefined/NaN -> "--" (we never show a made-up number). */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatCount(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '--';
  return n.toLocaleString('en-US');
}

/** 65000 -> "1:05", 3725000 -> "1:02:05". */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Share of a quota used, 0..1, or null when we have no real number yet. */
export function usedFraction(usedBytes, quotaBytes) {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(quotaBytes) || quotaBytes <= 0) return null;
  return Math.min(1, Math.max(0, usedBytes / quotaBytes));
}
