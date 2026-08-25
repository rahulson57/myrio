import { deflateSync } from 'node:zlib';

/**
 * A tiny, dependency-free PNG encoder + 5x7 bitmap font, used only to
 * produce the seed corpus's local placeholder images (SPEC-003 "Volumes":
 * "Generated locally (no network): solid-colour PNGs with the title
 * rendered in, written to `./public/uploads/seed/`"). No image library is
 * installed in this project yet (Media & Uploads, which will own real
 * image processing via `sharp`, is a later, out-of-scope slice) — this
 * writes raw, valid PNG bytes using only `node:zlib` (already a project
 * dependency's transitive need, and part of Node itself).
 */

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Standard PNG/zlib CRC-32 (ISO 3309), table-based.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** 5x7 bitmap font: A-Z, space, apostrophe. Each glyph is 7 rows of a
 * 5-character '.'/'X' string (top to bottom). Unknown characters render as
 * a blank (space) cell. */
const FONT_ROWS = 7;
const FONT_COLS = 5;
const FONT: Record<string, string[]> = {
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
  C: ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'],
  D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  F: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
  G: ['.XXXX', 'X....', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXXX'],
  H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  I: ['.XXX.', '..X..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
  J: ['..XXX', '...X.', '...X.', '...X.', '...X.', 'X..X.', '.XX..'],
  K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
  L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  N: ['X...X', 'XX..X', 'X.X.X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
  Q: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  V: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
  W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'X.X.X', '.X.X.'],
  X: ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
  Y: ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'],
  Z: ['XXXXX', '....X', '...X.', '..X..', '.X...', 'X....', 'XXXXX'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  "'": ['.X...', '.X...', 'X....', '.....', '.....', '.....', '.....'],
};

function glyphPixel(ch: string, row: number, col: number): boolean {
  const rows = FONT[ch] ?? FONT[' ']!;
  return rows[row]![col] === 'X';
}

/**
 * Renders `text` (only characters present in `FONT`; anything else is
 * dropped) as a scaled, centred bitmap onto a solid-colour `width` x
 * `height` canvas, and encodes the result as a PNG (8-bit truecolor, no
 * alpha). Deterministic: identical inputs always produce byte-identical
 * output (no timestamps are written into any PNG chunk).
 */
export function renderLabelPng(
  width: number,
  height: number,
  background: RgbColor,
  text: string,
  foreground: RgbColor,
  scale = 4,
): Buffer {
  const glyphs = text.toUpperCase().split('').filter((c) => c in FONT);
  const textWidthPx = glyphs.length * (FONT_COLS + 1) * scale;
  const textHeightPx = FONT_ROWS * scale;
  const originX = Math.max(0, Math.floor((width - textWidthPx) / 2));
  const originY = Math.max(0, Math.floor((height - textHeightPx) / 2));

  // Row-major RGB pixel buffer.
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 3] = background.r;
    pixels[i * 3 + 1] = background.g;
    pixels[i * 3 + 2] = background.b;
  }

  const setPixel = (x: number, y: number, color: RgbColor): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 3;
    pixels[idx] = color.r;
    pixels[idx + 1] = color.g;
    pixels[idx + 2] = color.b;
  };

  glyphs.forEach((ch, glyphIndex) => {
    for (let row = 0; row < FONT_ROWS; row += 1) {
      for (let col = 0; col < FONT_COLS; col += 1) {
        if (!glyphPixel(ch, row, col)) continue;
        const baseX = originX + glyphIndex * (FONT_COLS + 1) * scale + col * scale;
        const baseY = originY + row * scale;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            setPixel(baseX + sx, baseY + sy, foreground);
          }
        }
      }
    }
  });

  // Build raw scanlines: each row prefixed with filter-type byte 0 (None).
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A small, fixed palette of visually distinct background colours, cycled
 * deterministically by index (not by PRNG — callers pick the index). */
export const SEED_PALETTE: RgbColor[] = [
  { r: 0x1a, g: 0x89, b: 0x17 }, // brand accent green
  { r: 0x2b, g: 0x4c, b: 0x7e },
  { r: 0x8e, g: 0x3b, b: 0x46 },
  { r: 0xc9, g: 0x7a, b: 0x2e },
  { r: 0x4a, g: 0x6c, b: 0x6f },
  { r: 0x5c, g: 0x3a, b: 0x7e },
  { r: 0x2e, g: 0x7d, b: 0x8c },
  { r: 0x7e, g: 0x5c, b: 0x2e },
  { r: 0x3a, g: 0x5c, b: 0x3a },
  { r: 0x6f, g: 0x2e, b: 0x5c },
  { r: 0x2e, g: 0x4a, b: 0x2e },
  { r: 0x8c, g: 0x4a, b: 0x2e },
];

export const PNG_WHITE: RgbColor = { r: 255, g: 255, b: 255 };
