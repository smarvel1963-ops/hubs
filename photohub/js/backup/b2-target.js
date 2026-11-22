// b2-target.js - C:\MarvelApps\photohub\www\js\backup\b2-target.js
// Backblaze B2 StorageTarget - STUB. No Backblaze account exists yet (Scott makes it; Claude never types a card).
// Every method throws NotSetUpError("Backblaze B2 is not set up yet"), so the engine reports
// "cloud not set up" and uploads nothing.
//
// Plan for the real one (Phase 1, next step):
//  - The phone never holds B2 keys. It asks our Cloudflare Worker for a short-lived B2 upload URL + token.
//  - Upload sends X-Bz-Content-Sha1 so B2 itself checks the bytes it received (rejects a mismatch),
//    and stores our SHA-256 as file info.
//  - head() reads back what B2 holds (content length + SHA-1 + our SHA-256 info) - never an echo of put().
//  - Large videos: B2 large-file API in parts, each part with its own SHA-1.
//  - Still no delete() - see storage-target.js.

import { NotSetUpError } from './storage-target.js';

export const B2_NOT_SET_UP = 'Backblaze B2 is not set up yet';

function notSetUp() {
  return new NotSetUpError(B2_NOT_SET_UP);
}

export class B2Target {
  constructor() {
    this.name = 'Backblaze B2';
  }
  async ready() { throw notSetUp(); }
  async put() { throw notSetUp(); }
  async head() { throw notSetUp(); }
  async list() { throw notSetUp(); }
}
