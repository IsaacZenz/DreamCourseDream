/**
 * Organic wall textures in the scenes (owner, 2026-11-26). The painting rules
 * are in walls.ts; this file feeds them the texture pixels and keeps the
 * painted bands in a few shared atlas textures, so all the walls of a course
 * are drawn from one picture (fast, and nearest-neighbour like everything else).
 *
 * Bands that would look exactly the same share one atlas cell. The atlas
 * lives in Phaser's texture manager, so it is kept across scene restarts.
 */
import Phaser from 'phaser';
import { WALL_STYLES, rockKind } from '../content/walls';
import { FACE_H, FACE_W, type FaceFrameName } from './faceShapes';
import type { Placement } from './iso';
import { themedSprite, type Manifest } from './manifest';
import { bandKey, composeBand, pickWallLook, seedNumber, type Pixels, type WallLook } from './walls';

const PAGE = 512;
const PER_ROW = PAGE / FACE_W;
const PER_PAGE = PER_ROW * (PAGE / FACE_H);

interface Page {
  readonly key: string;
  readonly tex: Phaser.Textures.CanvasTexture;
  used: number;
  dirty: boolean;
}

const pages: Page[] = [];
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('walls') === 'debug';
const cells = new Map<string, { texture: string; frame: string }>();
const pixelCache = new Map<string, Pixels>();

/** More pages than this when a new ground is drawn: start the atlas again (the old ground's pictures are gone by then). */
const MAX_PAGES = 3;

/** Forget every painted cell and free the atlas textures. */
function resetAtlas(scene: Phaser.Scene): void {
  for (const page of pages) if (scene.textures.exists(page.key)) scene.textures.remove(page.key);
  pages.length = 0;
  cells.clear();
}

/** The pixels of a loaded sprite's whole image. */
function sheetPixels(scene: Phaser.Scene, id: string): Pixels | null {
  const cached = pixelCache.get(id);
  if (cached) return cached;
  if (!scene.textures.exists(id)) return null;
  const src = scene.textures.get(id).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const px = { width: src.width, height: src.height, data: ctx.getImageData(0, 0, src.width, src.height).data };
  pixelCache.set(id, px);
  return px;
}

/**
 * One wall texture: a "<sheet>#<frame>" key (see WallPainter.resolve), cut
 * out of its sheet at its real height.
 */
function texturePixels(scene: Phaser.Scene, manifest: Manifest, key: string): Pixels | null {
  const cached = pixelCache.get(key);
  if (cached) return cached;
  const [sheet, frame] = key.split('#') as [string, string];
  const entry = manifest.sprites[sheet];
  const whole = sheetPixels(scene, sheet);
  if (!entry || !whole) return null;
  const i = entry.frames.indexOf(frame);
  if (i < 0) return null;
  const w = entry.frameWidth;
  const h = entry.heights?.[i] ?? entry.frameHeight;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(whole.data.subarray((y * whole.width + i * w) * 4, (y * whole.width + i * w + w) * 4), y * w * 4);
  const px = { width: w, height: h, data };
  pixelCache.set(key, px);
  return px;
}

function addCell(scene: Phaser.Scene, key: string, rgba: Uint8ClampedArray): { texture: string; frame: string } {
  let page = pages[pages.length - 1];
  if (!page || page.used >= PER_PAGE || !scene.textures.exists(page.key)) {
    const pkey = `wall-atlas-${pages.length}`;
    if (scene.textures.exists(pkey)) scene.textures.remove(pkey);
    const tex = scene.textures.createCanvas(pkey, PAGE, PAGE)!;
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    page = { key: pkey, tex, used: 0, dirty: true };
    pages.push(page);
  }
  const i = page.used++;
  const x = (i % PER_ROW) * FACE_W;
  const y = Math.floor(i / PER_ROW) * FACE_H;
  const img = page.tex.getContext().createImageData(FACE_W, FACE_H);
  img.data.set(rgba);
  page.tex.getContext().putImageData(img, x, y);
  page.tex.add(String(i), 0, x, y, FACE_W, FACE_H);
  page.dirty = true;
  const cell = { texture: page.key, frame: String(i) };
  cells.set(key, cell);
  return cell;
}

export interface WallPainterOptions {
  /** The course seed (or anything stable for the place): the same seed always gives the same walls. */
  readonly seed: string;
  /** The theme, or null for day. */
  readonly theme: string | null;
  readonly overhang: boolean;
}

/** Paints the face bands of one scene. Make one per drawing of the ground. */
export class WallPainter {
  private readonly seed: number;
  private readonly looks = new Map<string, WallLook | null>();
  private readonly scene: Phaser.Scene;
  private readonly manifest: Manifest;
  private readonly opts: WallPainterOptions;

  constructor(scene: Phaser.Scene, manifest: Manifest, opts: WallPainterOptions) {
    this.scene = scene;
    this.manifest = manifest;
    this.opts = opts;
    this.seed = seedNumber(opts.seed);
    // A long run draws many courses: keep the atlas small by starting again now and then.
    if (pages.length > MAX_PAGES) resetAtlas(scene);
  }

  /** A texture id as "<sheet>#<frame>" for this side and theme, or null if the art is missing. */
  private resolve(id: string | null, side: string): string | null {
    if (!id) return null;
    const sheet = themedSprite(this.manifest, `wall-sheet-${side}`, this.opts.theme);
    return this.manifest.sprites[sheet]?.frames.includes(id) ? `${sheet}#${id}` : null;
  }

  /** The look of one edge, with sprite ids resolved for side and theme (null: this material has no wall style, or its art is missing). */
  private lookFor(p: Placement): WallLook | null {
    const w = p.wall!;
    const k = `${p.tile.x},${p.tile.y},${w.side}`;
    if (this.looks.has(k)) return this.looks.get(k)!;
    const style = WALL_STYLES[w.material];
    let look: WallLook | null = null;
    if (style) {
      const raw = pickWallLook(style, this.seed, p.tile.x, p.tile.y, w.side);
      const soil = this.resolve(raw.soil, w.side);
      if (soil) {
        look = {
          ...raw,
          soil,
          rocks: this.resolve(raw.rocks, w.side),
          detail: this.resolve(raw.detail, w.side),
          overhang: this.opts.overhang ? this.resolve(raw.overhang, w.side) : null,
        };
      }
    }
    this.looks.set(k, look);
    return look;
  }

  /**
   * Testing aid: with ?walls=debug in the address, a tint showing each wall's
   * rock kind (plain white, sparse green, moderate yellow, large red), or null.
   */
  debugTint(p: Placement): number | null {
    if (!DEBUG || p.kind !== 'face' || !p.wall) return null;
    const look = this.lookFor(p);
    if (!look) return null;
    const style = WALL_STYLES[p.wall.material]!;
    const raw = pickWallLook(style, this.seed, p.tile.x, p.tile.y, p.wall.side);
    return { plain: 0xffffff, sparse: 0x60ff60, moderate: 0xffe040, large: 0xff5050 }[rockKind(raw.rocks)];
  }

  /** The texture and frame to draw a face band with, or null to draw its old sprite. */
  frameFor(p: Placement): { texture: string; frame: string } | null {
    if (p.kind !== 'face' || !p.wall) return null;
    const look = this.lookFor(p);
    if (!look) return null;
    const get = (id: string | null) => (id ? texturePixels(this.scene, this.manifest, id) : null);
    const soil = get(look.soil);
    if (!soil) return null;
    const layers = { soil, rocks: get(look.rocks), detail: get(look.detail), overhang: get(look.overhang) };
    const b = { side: p.wall.side, frame: p.frame as FaceFrameName, depth: p.wall.depth, topFrame: p.wall.topFrame };
    const key = bandKey(b, look, { soil: soil.height, rocks: layers.rocks?.height ?? 1, detail: layers.detail?.height ?? 1, overhang: layers.overhang?.height ?? 0 });
    return cells.get(key) ?? addCell(this.scene, key, composeBand(b, look, layers));
  }

  /** Send newly painted cells to the graphics card. Call once after placing all the bands. */
  flush(): void {
    for (const page of pages) {
      if (page.dirty) {
        page.tex.refresh();
        page.dirty = false;
      }
    }
  }
}
