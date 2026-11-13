// Generates the pixel-art app icons (PNG) without dependencies. Run: node scripts/icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const MAP = [
  '................',
  '...y.......y....',
  '...r.......r....',
  '..sss..y..sss...',
  '..sSs..r..sSs...',
  '..sss.sss.sss...',
  '..sSs.sSs.sSs...',
  '..sssssssssss...',
  '..sSsSsSsSsSs...',
  '..ssssskssssS...',
  '..sSssk.kssSs...',
  '..sssskkkssss...',
  '.ggggggggggggg..',
  'ggGggggGgggggGg.',
  'gggggGggggGgggg.',
  '................',
];
const COL = { y: [236, 201, 75], r: [176, 42, 40], s: [145, 140, 133], S: [184, 179, 170], k: [42, 29, 20], g: [93, 154, 59], G: [127, 184, 79] };
const BG = [43, 33, 24];
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, pad) {
  const raw = Buffer.alloc(size * (size * 3 + 1)), cell = (size - pad * 2) / 16;
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; for (let x = 0; x < size; x++) {
    const mx = Math.floor((x - pad) / cell), my = Math.floor((y - pad) / cell), ch = MAP[my]?.[mx];
    const c = ch && ch !== '.' ? COL[ch] : BG; raw.set(c, y * (size * 3 + 1) + 1 + x * 3);
  } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [name, size, pad] of [['icon-192.png', 192, 16], ['icon-512.png', 512, 48], ['maskable-512.png', 512, 96], ['apple-touch-icon.png', 180, 14], ['favicon-32.png', 32, 0]])
  writeFileSync(`public/icons/${name}`, png(size, pad));
console.log('icons written');
