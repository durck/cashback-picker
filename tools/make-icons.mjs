// Generates the PWA icons (PNG) without dependencies: a few shapes rendered
// with 4×4 supersampling and encoded by a minimal PNG writer.
// Usage: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT_DIR = new URL('../icons/', import.meta.url);
const SAMPLES = 4;
const MASKABLE_SCALE = 0.78; // keeps the drawing inside the 80 % safe zone

// Coordinates are in 0..1 of the icon size; later shapes paint over earlier ones.
const SHAPES = [
  { kind: 'rect', x0: 0.19, y0: 0.27, x1: 0.81, y1: 0.67, r: 0.06, color: [255, 255, 255] },
  { kind: 'rect', x0: 0.19, y0: 0.35, x1: 0.81, y1: 0.43, r: 0, color: [19, 78, 74] },
  { kind: 'rect', x0: 0.25, y0: 0.50, x1: 0.36, y1: 0.58, r: 0.015, color: [251, 191, 36] },
  { kind: 'circle', cx: 0.72, cy: 0.68, r: 0.15, color: [251, 191, 36] },
  { kind: 'circle', cx: 0.72, cy: 0.68, r: 0.105, color: [245, 158, 11] },
];
const BACKGROUND = [15, 118, 110];

function insideRect(s, x, y) {
  const qx = Math.max(s.x0 + s.r, Math.min(x, s.x1 - s.r));
  const qy = Math.max(s.y0 + s.r, Math.min(y, s.y1 - s.r));
  const inBox = x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1;
  return inBox && (x - qx) ** 2 + (y - qy) ** 2 <= s.r ** 2 + 1e-12;
}

const inside = (s, x, y) => (s.kind === 'circle'
  ? (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r ** 2
  : insideRect(s, x, y));

function colorAt(x, y, scale) {
  const ux = 0.5 + (x - 0.5) / scale;
  const uy = 0.5 + (y - 0.5) / scale;
  let color = BACKGROUND;
  for (const shape of SHAPES) if (inside(shape, ux, uy)) color = shape.color;
  return color;
}

function render(size, scale) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const color = colorAt((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, scale);
          sum[0] += color[0]; sum[1] += color[1]; sum[2] += color[2];
        }
      }
      const offset = (py * size + px) * 4;
      sum.forEach((channel, i) => { pixels[offset + i] = Math.round(channel / SAMPLES ** 2); });
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'maskable-512.png', size: 512, scale: MASKABLE_SCALE },
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, scale } of ICONS) {
  writeFileSync(new URL(file, OUT_DIR), encodePng(size, render(size, scale)));
  process.stdout.write(`icons/${file} ${size}×${size}\n`);
}
