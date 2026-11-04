import { describe, it, expect } from 'vitest';
import {
  ksFromReflectance,
  reflectanceFromKS,
  ksFromHex,
  orderWeight,
  kmMixPixels,
  kmMixCoverage,
  KMLayer,
} from './kubelkaMunk';
import { hexToRgb } from './compositor';
import { decodeSrgb } from './srgb';

// ------- K/S ↔ reflectance -------

describe('ksFromReflectance / reflectanceFromKS', () => {
  it('are inverses across the reflectance range', () => {
    for (let r = 0.01; r <= 1; r += 0.01) {
      expect(reflectanceFromKS(ksFromReflectance(r))).toBeCloseTo(r, 6);
    }
  });

  it('white has zero K/S', () => {
    expect(ksFromReflectance(1)).toBe(0);
    expect(reflectanceFromKS(0)).toBe(1);
  });

  it('black clamps but round-trips within one 8-bit step', () => {
    const ks = ksFromReflectance(0);
    expect(ks).toBeGreaterThan(50); // strongly absorbing
    expect(reflectanceFromKS(ks) * 255).toBeLessThan(1.5);
  });
});

// ------- ksFromHex -------

describe('ksFromHex', () => {
  it('round-trips an ink hex through K/S and back within tolerance', () => {
    // The plan's acceptance check: a single ink at full density on white
    // paper should reproduce approximately the ink's own hex.
    for (const hex of ['#0078BF', '#FFE800', '#FF48B0', '#000000', '#FFFFFF', '#765BA7']) {
      const [r, g, b] = hexToRgb(hex);
      const ks = ksFromHex(hex);
      expect(reflectanceFromKS(ks[0]) * 255).toBeCloseTo(Math.max(r, 1), 0);
      expect(reflectanceFromKS(ks[1]) * 255).toBeCloseTo(Math.max(g, 1), 0);
      expect(reflectanceFromKS(ks[2]) * 255).toBeCloseTo(Math.max(b, 1), 0);
    }
  });

  it('memoizes per hex', () => {
    expect(ksFromHex('#0078BF')).toBe(ksFromHex('#0078BF'));
  });
});

// ------- orderWeight -------

describe('orderWeight', () => {
  it('is 1 everywhere at zero bias', () => {
    expect(orderWeight(0, 3, 0)).toBe(1);
    expect(orderWeight(2, 3, 0)).toBe(1);
  });

  it('weights bottom layers more, top layer exactly 1', () => {
    expect(orderWeight(0, 3, 0.5)).toBeCloseTo(1.5);
    expect(orderWeight(1, 3, 0.5)).toBeCloseTo(1.25);
    expect(orderWeight(2, 3, 0.5)).toBe(1);
  });

  it('leaves a single layer unweighted', () => {
    expect(orderWeight(0, 1, 0.8)).toBe(1);
  });
});

// ------- kmMixPixels -------

function densityPixels(count: number, gray: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = gray;
    data[i * 4 + 1] = gray;
    data[i * 4 + 2] = gray;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function mixOne(layers: KMLayer[], paperHex = '#FFFFFF'): [number, number, number] {
  const out = new Uint8ClampedArray(4);
  kmMixPixels(layers, ksFromHex(paperHex), out);
  return [out[0], out[1], out[2]];
}

describe('kmMixPixels', () => {
  it('no ink → paper color survives exactly (white) or within a step (tinted)', () => {
    expect(mixOne([{ data: densityPixels(1, 255), ks: ksFromHex('#0078BF'), weight: 1 }])).toEqual(
      [255, 255, 255],
    );
    const [r, g, b] = mixOne([], '#F2ECD9');
    const [pr, pg, pb] = hexToRgb('#F2ECD9');
    expect(Math.abs(r - pr)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - pg)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - pb)).toBeLessThanOrEqual(1);
  });

  it('single ink at full density on white paper reproduces the ink hex', () => {
    for (const hex of ['#0078BF', '#FFE800', '#FF48B0']) {
      const [r, g, b] = mixOne([{ data: densityPixels(1, 0), ks: ksFromHex(hex), weight: 1 }]);
      const [ir, ig, ib] = hexToRgb(hex);
      expect(Math.abs(r - Math.max(ir, 1))).toBeLessThanOrEqual(1);
      expect(Math.abs(g - Math.max(ig, 1))).toBeLessThanOrEqual(1);
      expect(Math.abs(b - Math.max(ib, 1))).toBeLessThanOrEqual(1);
    }
  });

  it('blue + yellow mixes to green (the key difference from multiply)', () => {
    const [r, g, b] = mixOne([
      { data: densityPixels(1, 0), ks: ksFromHex('#0078BF'), weight: 1 },
      { data: densityPixels(1, 0), ks: ksFromHex('#FFE800'), weight: 1 },
    ]);
    expect(g).toBeGreaterThan(r + 50);
    expect(g).toBeGreaterThan(b + 50);
  });

  it('partial density lightens toward paper', () => {
    const full = mixOne([{ data: densityPixels(1, 0), ks: ksFromHex('#0078BF'), weight: 1 }]);
    const half = mixOne([{ data: densityPixels(1, 128), ks: ksFromHex('#0078BF'), weight: 1 }]);
    expect(half[0]).toBeGreaterThan(full[0]);
    expect(half[1]).toBeGreaterThan(full[1]);
    expect(half[2]).toBeGreaterThan(full[2]);
  });

  it('higher weight darkens the result', () => {
    const plain = mixOne([{ data: densityPixels(1, 128), ks: ksFromHex('#0078BF'), weight: 1 }]);
    const biased = mixOne([{ data: densityPixels(1, 128), ks: ksFromHex('#0078BF'), weight: 1.3 }]);
    expect(biased[0]).toBeLessThanOrEqual(plain[0]);
    expect(biased[1]).toBeLessThan(plain[1]);
    expect(biased[2]).toBeLessThan(plain[2]);
  });

  it('output alpha is opaque', () => {
    const out = new Uint8ClampedArray(8);
    kmMixPixels(
      [{ data: densityPixels(2, 100), ks: ksFromHex('#0078BF'), weight: 1 }],
      ksFromHex('#FFFFFF'),
      out,
    );
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(255);
  });
});

describe('kmMixCoverage', () => {
  const paperKS = ksFromHex('#FFFDF5');
  const red = { ks: ksFromHex('#E45D50'), weight: 1, dotDensity: 1 };
  const blue = { ks: ksFromHex('#3255A4'), weight: 1, dotDensity: 1 };

  /** One pixel per entry; each layer's density (0–1) for that pixel. */
  function strip(densities: number[]): Uint8ClampedArray {
    const d = new Uint8ClampedArray(densities.length * 4);
    densities.forEach((v, p) => d.fill(Math.round(255 - v * 255), p * 4, p * 4 + 4));
    return d;
  }
  const lin = (v: number) => decodeSrgb(v / 255);

  it('matches plain KM mixing where dots are solid or absent', () => {
    const a = strip([0, 1, 0, 1]);
    const b = strip([0, 0, 1, 1]);
    const plain = new Uint8ClampedArray(16);
    const coverage = new Uint8ClampedArray(16);
    kmMixPixels([{ ...red, data: a }, { ...blue, data: b }], paperKS, plain);
    kmMixCoverage([{ ...red, data: a }, { ...blue, data: b }], paperKS, coverage);
    for (let i = 0; i < 16; i++) expect(Math.abs(coverage[i] - plain[i])).toBeLessThanOrEqual(1);
  });

  it('averages half-covered paper with the ink in linear light, not half-strength ink', () => {
    const solid = new Uint8ClampedArray(8);
    kmMixPixels([{ ...red, data: strip([0, 1]) }], paperKS, solid);
    const half = new Uint8ClampedArray(4);
    kmMixCoverage([{ ...red, data: strip([0.5]) }], paperKS, half);
    for (let c = 0; c < 3; c++) {
      expect(lin(half[c])).toBeCloseTo((lin(solid[c]) + lin(solid[4 + c])) / 2, 2);
    }
    // KM of half-strength ink is darker than the dots it stands for
    const muddy = new Uint8ClampedArray(4);
    kmMixPixels([{ ...red, data: strip([0.5]) }], paperKS, muddy);
    expect(muddy[1]).toBeLessThan(half[1]);
  });

  it('splits two half-covering layers into a quarter each of paper, red, blue and overprint', () => {
    const solid = new Uint8ClampedArray(16);
    kmMixPixels([{ ...red, data: strip([0, 1, 0, 1]) }, { ...blue, data: strip([0, 0, 1, 1]) }], paperKS, solid);
    const mixed = new Uint8ClampedArray(4);
    kmMixCoverage([{ ...red, data: strip([0.5]) }, { ...blue, data: strip([0.5]) }], paperKS, mixed);
    for (let c = 0; c < 3; c++) {
      const expected = [0, 4, 8, 12].reduce((s, o) => s + lin(solid[o + c]), 0) / 4;
      expect(lin(mixed[c])).toBeCloseTo(expected, 2);
    }
  });

  it('reads density as coverage of dots that are only as dense as the layer opacity', () => {
    // At 50% opacity a solid dot has density 0.5; density 0.25 is half coverage
    const faint = { ...red, dotDensity: 0.5 };
    const solid = new Uint8ClampedArray(8);
    kmMixPixels([{ ...red, data: strip([0, 0.5]) }], paperKS, solid);
    const half = new Uint8ClampedArray(4);
    kmMixCoverage([{ ...faint, data: strip([0.25]) }], paperKS, half);
    for (let c = 0; c < 3; c++) {
      expect(lin(half[c])).toBeCloseTo((lin(solid[c]) + lin(solid[4 + c])) / 2, 2);
    }
  });
});
