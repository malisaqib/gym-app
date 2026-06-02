// Generates PWA app icons (PNG) with no dependencies — a white dumbbell on an
// emerald background. Run with: node scripts/gen-icons.mjs
// Output goes to /public. Re-run if you change the design/colors.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [16, 185, 129, 255]; // emerald-500
const FG = [255, 255, 255, 255]; // white

// --- minimal PNG encoder (8-bit RGBA) --------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- draw the dumbbell icon -------------------------------------------------
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const inRect = (x, y, x0, x1, y0, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Kept within the central ~60% so it survives maskable cropping.
      const isHandle = inRect(u, v, 0.3, 0.7, 0.46, 0.54);
      const leftWeight = inRect(u, v, 0.24, 0.32, 0.36, 0.64);
      const rightWeight = inRect(u, v, 0.68, 0.76, 0.36, 0.64);
      const leftInner = inRect(u, v, 0.32, 0.36, 0.41, 0.59);
      const rightInner = inRect(u, v, 0.64, 0.68, 0.41, 0.59);
      const fg = isHandle || leftWeight || rightWeight || leftInner || rightInner;
      const [r, g, b, a] = fg ? FG : BG;
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }
  return px;
}

mkdirSync("public", { recursive: true });
for (const size of [192, 512, 180]) {
  const buf = encodePng(size, drawIcon(size));
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(`public/${name}`, buf);
  console.log(`wrote public/${name} (${buf.length} bytes)`);
}
