// cloud-images.js - C:\MarvelApps\photohub\www\js\lib\cloud-images.js
// SHOWS AN ALBUM PHOTO THAT IS ONLY IN THE CLOUD (11/22 album sync: an album made on the phone shows on the web version / a new phone).
// The photo is fetched from the backup service with the person's sign-in. For the grid it is shrunk to a small copy right away (so a
// big album does not hold dozens of full photos in memory); the viewer fetches the full photo. At most 3 downloads at a time.
// Videos get no grid picture from the cloud (that would mean downloading the whole video) - the grid shows the play badge instead.

import * as account from './account.js';
import { cloudBase } from '../backup/cloud-target.js';

const SMALL = 320;
const thumbs = new Map();   // sha256 -> Promise<url> ('' when it could not be shown)
let active = 0;
const waiting = [];

function slot() {
  if (active < 3) { active++; return Promise.resolve(); }
  return new Promise((ok) => waiting.push(ok));
}
function done() { const next = waiting.shift(); if (next) next(); else active--; }

async function download(sha) {
  const tok = await account.token().catch(() => '');
  if (!tok) throw new Error('Sign in to see photos kept in the cloud');
  const r = await globalThis.fetch(`${cloudBase()}/v1/photos/${sha}`, { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error(r.status === 404 ? 'This photo is no longer in the cloud' : `The cloud answered ${r.status}`);
  return r.blob();
}

async function shrink(blob) {
  try {
    const bmp = await createImageBitmap(blob, { resizeWidth: SMALL, resizeQuality: 'medium' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close && bmp.close();
    const small = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
    return small || blob;
  } catch (e) {
    return blob;   // a browser that cannot shrink it shows the full photo
  }
}

/** A small picture for the grid, or '' (videos, or when it can't be fetched). */
export function cloudThumbUrl(item) {
  if (!item || !item.cloud || item.type === 'video') return Promise.resolve('');
  if (!thumbs.has(item.sha256)) {
    thumbs.set(item.sha256, (async () => {
      await slot();
      try { return URL.createObjectURL(await shrink(await download(item.sha256))); }
      catch (e) { thumbs.delete(item.sha256); return ''; }
      finally { done(); }
    })());
  }
  return thumbs.get(item.sha256);
}

/** The full photo / video from the cloud, for the viewer. The caller revokes the URL when the viewer closes. */
export async function cloudFullUrl(item) {
  await slot();
  try { return URL.createObjectURL(await download(item.sha256)); }
  finally { done(); }
}
