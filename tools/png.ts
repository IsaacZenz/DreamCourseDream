/**
 * A tiny RGBA image buffer, PNG writer and PNG reader, so the placeholder art
 * script needs no extra packages. Uses Node's built-in zlib.
 */
import { deflateSync, inflateSync } from 'node:zlib';

export type RGBA = readonly [number, number, number, number];

export class Image {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data.set(c, i);
  }

  get(x: number, y: number): RGBA {
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  /** Copy another image in at (dx, dy). */
  blit(src: Image, dx: number, dy: number): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const c = src.get(x, y);
        if (c[3] > 0) this.set(dx + x, dy + y, c);
      }
    }
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

export function encodePng(img: Image): Uint8Array {
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, img.width);
  hv.setUint32(4, img.height);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = new Uint8Array((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0; // no filter
    raw.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), y * (img.width * 4 + 1) + 1);
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}

/**
 * Read a PNG (8 bits per channel: RGBA, RGB, grey, grey with alpha, or a
 * palette with optional transparency; not interlaced). Enough for art saved
 * by any normal pixel editor. Throws a readable error for anything else.
 */
export function decodePng(bytes: Uint8Array, name = 'PNG'): Image {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (sig.some((b, i) => bytes[i] !== b)) throw new Error(`${name} is not a PNG file.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (o < bytes.length) {
    const len = view.getUint32(o);
    const kind = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const body = bytes.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      const h = new DataView(body.buffer, body.byteOffset, body.byteLength);
      width = h.getUint32(0);
      height = h.getUint32(4);
      depth = body[8]!;
      type = body[9]!;
      interlace = body[12]!;
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (depth !== 8 || channels === undefined || interlace !== 0) throw new Error(`${name}: only 8-bit, non-interlaced PNGs can be read (bit depth ${depth}, colour type ${type}, interlace ${interlace}).`);
  const total = idat.reduce((n, c) => n + c.length, 0);
  const packed = new Uint8Array(total);
  let p = 0;
  for (const c of idat) {
    packed.set(c, p);
    p += c.length;
  }
  const raw = inflateSync(packed);
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels]! : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels]! : 0;
      let v = src[x]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[y * stride + x] = v & 255;
    }
  }
  const img = new Image(width, height);
  for (let i = 0; i < width * height; i++) {
    const s = rows.subarray(i * channels, i * channels + channels);
    let px: RGBA;
    if (type === 6) px = [s[0]!, s[1]!, s[2]!, s[3]!];
    else if (type === 2) px = [s[0]!, s[1]!, s[2]!, 255];
    else if (type === 0) px = [s[0]!, s[0]!, s[0]!, 255];
    else if (type === 4) px = [s[0]!, s[0]!, s[0]!, s[1]!];
    else {
      if (!palette) throw new Error(`${name}: palette PNG without a palette.`);
      const k = s[0]!;
      px = [palette[k * 3]!, palette[k * 3 + 1]!, palette[k * 3 + 2]!, trns && k < trns.length ? trns[k]! : 255];
    }
    img.data.set(px, i * 4);
  }
  return img;
}
