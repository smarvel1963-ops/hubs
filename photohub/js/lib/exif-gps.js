// exif-gps.js - C:\MarvelApps\photohub\www\js\lib\exif-gps.js
// WHERE A PICKED PHOTO WAS TAKEN, for the web version's Places (0.7.0, Scott 11/22: "Yes, build Places"). Reads the GPS block of a
// JPEG's EXIF from the first part of the file only, right here in the browser - nothing is sent anywhere. Returns [lat, lon] or null.
// (Phones often remove the location when a photo is picked in a browser; the phone app reads it from the original instead.)

const MAX_READ = 256 * 1024;   // EXIF sits at the start of the file

/** [lat, lon] from a JPEG File/Blob, or null (no EXIF, no GPS, a blanked-out 0,0, or not a JPEG). */
export async function gpsFromFile(file) {
  try {
    const buf = await file.slice(0, MAX_READ).arrayBuffer();
    return gpsFromJpeg(new DataView(buf));
  } catch (e) {
    return null;
  }
}

export function gpsFromJpeg(v) {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00) return null;
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) return tiffGps(v, off + 10, len - 8);   // "Exif"
    if (marker === 0xffda) return null;   // image data starts - no EXIF
    off += 2 + len;
  }
  return null;
}

function tiffGps(v, start, size) {
  const end = Math.min(v.byteLength, start + size);
  if (start + 8 > end) return null;
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, le);
  const u32 = (o) => v.getUint32(start + o, le);
  const inside = (o, n) => start + o >= start && start + o + n <= end;
  const ifd0 = u32(4);
  if (!inside(ifd0, 2)) return null;
  let gpsIfd = 0;
  for (let i = 0, n = u16(ifd0); i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (!inside(e, 12)) return null;
    if (u16(e) === 0x8825) gpsIfd = u32(e + 8);
  }
  if (!gpsIfd || !inside(gpsIfd, 2)) return null;
  const tags = {};
  for (let i = 0, n = u16(gpsIfd); i < n; i++) {
    const e = gpsIfd + 2 + i * 12;
    if (!inside(e, 12)) break;
    const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    if ((tag === 1 || tag === 3) && type === 2) tags[tag] = String.fromCharCode(v.getUint8(start + e + 8));   // N/S, E/W
    if ((tag === 2 || tag === 4) && type === 5 && count === 3) {   // 3 rationals: degrees, minutes, seconds
      const at = u32(e + 8);
      if (!inside(at, 24)) continue;
      const r = (k) => { const d = u32(at + k * 8 + 4); return d ? u32(at + k * 8) / d : 0; };
      tags[tag] = r(0) + r(1) / 60 + r(2) / 3600;
    }
  }
  if (tags[2] === undefined || tags[4] === undefined) return null;
  const lat = tags[1] === 'S' ? -tags[2] : tags[2];
  const lon = tags[3] === 'W' ? -tags[4] : tags[4];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return null;   // blanked out, not a real place
  return [lat, lon];
}
