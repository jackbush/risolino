import { describe, it, expect, beforeAll } from 'vitest';
import { downscale, kernelTaps } from './downscale';

beforeAll(() => {
  // jsdom doesn't provide ImageData
  if (typeof globalThis.ImageData === 'undefined') {
    (globalThis as Record<string, unknown>).ImageData = class ImageData {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    };
  }
});

/** A grey image whose value at (x, y) is `fn(x, y)`, fully opaque. */
function grey(w: number, h: number, fn: (x: number, y: number) => number): ImageData {
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = fn(x, y);
      img.data[i + 3] = 255;
    }
  }
  return img;
}

const reds = (img: ImageData) => Array.from({ length: img.width * img.height }, (_, i) => img.data[i * 4]);

describe('kernelTaps', () => {
  it('weights each output pixel to 1, near and at the edges', () => {
    const t = kernelTaps(100, 37);
    for (let i = 0; i < 37; i++) {
      let sum = 0;
      for (let k = t.offsets[i]; k < t.offsets[i + 1]; k++) sum += t.weight[k];
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('reaches 1.5 output pixels (3σ) either side of the centre', () => {
    // 4× reduction: output 5 is centred on source 22, so ±6 source pixels
    const t = kernelTaps(40, 10);
    const used = [...t.index.subarray(t.offsets[5], t.offsets[6])];
    expect(Math.min(...used)).toBe(16);
    expect(Math.max(...used)).toBe(27);
  });
});

describe('downscale', () => {
  it('leaves a flat image flat', () => {
    const out = downscale(grey(50, 30, () => 90), 17, 11, false);
    expect(new Set(reds(out))).toEqual(new Set([90]));
  });

  it('averages density as plain numbers when not light', () => {
    // Columns alternate black/white: half coverage
    const out = downscale(grey(40, 4, (x) => (x % 2 ? 255 : 0)), 10, 1, false);
    for (const v of reds(out).slice(1, -1)) expect(Math.abs(v - 127.5)).toBeLessThan(1);
  });

  it('averages colour in linear light, as a screen blends it', () => {
    // Half black, half white reads as 50% light: sRGB ~188, not 128
    const out = downscale(grey(40, 4, (x) => (x % 2 ? 255 : 0)), 10, 1, true);
    for (const v of reds(out).slice(1, -1)) expect(Math.abs(v - 188)).toBeLessThanOrEqual(1);
  });

  it('turns stripes too fine for the output into flat tone at awkward ratios', () => {
    // 1px stripes at reductions where a box average ripples ±18% (2.7×) and
    // a tent ±4.5%.
    for (const outW of [450, 370, 253, 141]) {
      const out = reds(downscale(grey(1000, 8, (x) => (x % 2 ? 255 : 0)), outW, 2, false));
      const inner = out.slice(4, outW - 4); // edges see a clipped kernel
      expect(Math.max(...inner) - Math.min(...inner)).toBeLessThanOrEqual(0.01 * 255);
    }
  });

  it('keeps a dot screen the output can still resolve', () => {
    // 8px period at 3× is 2.7 output px: above Nyquist, so it should show
    const out = reds(downscale(grey(3000, 8, (x) => (x % 8 < 4 ? 0 : 255)), 1000, 2, false));
    const inner = out.slice(4, 996);
    expect(Math.max(...inner) - Math.min(...inner)).toBeGreaterThan(0.5 * 255);
  });

  it('weights colour by alpha, so clear pixels add coverage but no colour', () => {
    const img = new ImageData(2, 1);
    img.data.set([255, 0, 0, 0, 0, 0, 255, 255]); // clear red, opaque blue
    const out = downscale(img, 1, 1, false);
    expect(Array.from(out.data)).toEqual([0, 0, 255, 128]);
  });
});
