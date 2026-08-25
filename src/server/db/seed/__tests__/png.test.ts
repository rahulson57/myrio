import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PNG_WHITE, renderLabelPng, SEED_PALETTE } from '../png';

/** Minimal PNG chunk reader, independent of `renderLabelPng`'s own encoder,
 * so this test can't pass just by mirroring the same bug back at itself. */
function readChunks(buf: Buffer): { type: string; data: Buffer }[] {
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = 8; // past the signature
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length; // length + type + data + crc
  }
  return chunks;
}

describe('renderLabelPng', () => {
  it('produces a valid PNG signature and IHDR/IDAT/IEND chunk sequence', () => {
    const png = renderLabelPng(64, 32, SEED_PALETTE[0]!, 'HI', PNG_WHITE);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);

    const ihdr = chunks[0]!.data;
    expect(ihdr.readUInt32BE(0)).toBe(64); // width
    expect(ihdr.readUInt32BE(4)).toBe(32); // height
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(2); // color type: truecolor
  });

  it('decompresses to exactly (width*3 + 1) * height raw bytes', () => {
    const width = 40;
    const height = 20;
    const png = renderLabelPng(width, height, SEED_PALETTE[1]!, 'AB', PNG_WHITE);
    const chunks = readChunks(png);
    const idat = chunks.find((c) => c.type === 'IDAT')!.data;
    const raw = inflateSync(idat);
    expect(raw.length).toBe((width * 3 + 1) * height);
  });

  it('fills the background with the requested colour outside the text', () => {
    const bg = { r: 10, g: 20, b: 30 };
    const png = renderLabelPng(50, 50, bg, '', PNG_WHITE);
    const idat = readChunks(png).find((c) => c.type === 'IDAT')!.data;
    const raw = inflateSync(idat);
    // Top-left pixel: filter byte (0) then the first RGB triplet.
    expect(raw[1]).toBe(bg.r);
    expect(raw[2]).toBe(bg.g);
    expect(raw[3]).toBe(bg.b);
  });

  it('is deterministic: identical inputs produce byte-identical PNGs', () => {
    const a = renderLabelPng(80, 40, SEED_PALETTE[2]!, 'SAME', PNG_WHITE);
    const b = renderLabelPng(80, 40, SEED_PALETTE[2]!, 'SAME', PNG_WHITE);
    expect(a.equals(b)).toBe(true);
  });

  it('renders some foreground-coloured pixels when given non-empty text', () => {
    const bg = { r: 0, g: 0, b: 0 };
    const fg = { r: 255, g: 255, b: 255 };
    const png = renderLabelPng(100, 40, bg, 'A', fg);
    const idat = readChunks(png).find((c) => c.type === 'IDAT')!.data;
    const raw = inflateSync(idat);
    let foregroundPixels = 0;
    for (let i = 0; i < raw.length; i += 3) {
      if (raw[i] === fg.r && raw[i + 1] === fg.g && raw[i + 2] === fg.b) foregroundPixels += 1;
    }
    expect(foregroundPixels).toBeGreaterThan(0);
  });

  it('unknown characters render as blank cells instead of throwing', () => {
    expect(() => renderLabelPng(60, 30, SEED_PALETTE[3]!, 'a1!?', PNG_WHITE)).not.toThrow();
  });
});
