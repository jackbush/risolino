import { hexToRgb } from './compositor';
import { decodeSrgb, encodeSrgb } from './srgb';

/**
 * Kubelka-Munk spectral mixing, approximated per RGB channel (a 3-channel
 * approximation, not truly spectral — see README, "Kubelka-Munk" section).
 *
 * Each ink gets a K/S (absorption/scattering) ratio per channel, derived
 * from its hex color by the standard KM inversion. Overprints accumulate
 * K/S additively (weighted by ink density), and the sum converts back to
 * reflectance. Unlike multiply blending, this makes e.g. blue + yellow
 * produce a convincing green instead of muddy darkness.
 */

// Reflectance floor: KS(0) is infinite, so clamp near 1/255. Round-tripping
// pure black through ksFromReflectance → reflectanceFromKS then stays black
// to within one 8-bit step.
const MIN_REFLECTANCE = 0.004;

/** Standard KM inversion: K/S = (1 - R)² / (2R), with R clamped to (0, 1]. */
export function ksFromReflectance(reflectance: number): number {
  const r = Math.min(1, Math.max(MIN_REFLECTANCE, reflectance));
  return ((1 - r) * (1 - r)) / (2 * r);
}

/** Inverse of ksFromReflectance: R = 1 + K/S − sqrt((K/S)² + 2·K/S). */
export function reflectanceFromKS(ks: number): number {
  return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
}

const ksByHex = new Map<string, readonly [number, number, number]>();

/**
 * Per-channel K/S ratios for a hex color. Derived (and memoized) at use time
 * rather than stored in the ink palette, so user-picked custom colors work.
 */
export function ksFromHex(hex: string): readonly [number, number, number] {
  let ks = ksByHex.get(hex);
  if (!ks) {
    const [r, g, b] = hexToRgb(hex);
    ks = [ksFromReflectance(r / 255), ksFromReflectance(g / 255), ksFromReflectance(b / 255)];
    ksByHex.set(hex, ks);
  }
  return ks;
}

/**
 * Order-dependent weighting: bottom layers soak further into the paper and
 * contribute slightly more K/S. `position` is the layer's index among visible
 * layers (0 = bottom). At bias b the bottom layer is weighted 1 + b and the
 * top layer exactly 1; a single layer is unweighted.
 */
export function orderWeight(position: number, count: number, bias: number): number {
  if (count <= 1 || bias <= 0) return 1;
  return 1 + bias * (1 - position / (count - 1));
}

export interface KMLayer {
  /** RGBA density pixels (grayscale, black = full ink), aligned to the output. */
  data: Uint8ClampedArray;
  /** Per-channel K/S of the layer's ink. */
  ks: readonly [number, number, number];
  /** Order weight (see orderWeight). */
  weight: number;
}

/**
 * Mix a strip of pixels: accumulate density-weighted K/S per channel over the
 * paper's own K/S, then convert back to reflectance. All layer buffers and
 * `out` must cover the same pixels. Writes opaque RGBA into `out`.
 */
export function kmMixPixels(
  layers: KMLayer[],
  paperKS: readonly [number, number, number],
  out: Uint8ClampedArray,
): void {
  // Bare-paper pixels (no ink from any layer) all resolve to the same color —
  // compute it once and skip the three per-channel conversions for them.
  // Margins, safe areas, and light artwork make this the common case.
  const paperR = Math.round(reflectanceFromKS(paperKS[0]) * 255);
  const paperG = Math.round(reflectanceFromKS(paperKS[1]) * 255);
  const paperB = Math.round(reflectanceFromKS(paperKS[2]) * 255);

  const count = out.length / 4;
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    let ksR = paperKS[0];
    let ksG = paperKS[1];
    let ksB = paperKS[2];
    let inked = false;

    for (const layer of layers) {
      const density = (255 - layer.data[i]) / 255;
      if (density > 0) {
        inked = true;
        const dw = density * layer.weight;
        ksR += dw * layer.ks[0];
        ksG += dw * layer.ks[1];
        ksB += dw * layer.ks[2];
      }
    }

    if (inked) {
      out[i] = Math.round(reflectanceFromKS(ksR) * 255);
      out[i + 1] = Math.round(reflectanceFromKS(ksG) * 255);
      out[i + 2] = Math.round(reflectanceFromKS(ksB) * 255);
    } else {
      out[i] = paperR;
      out[i + 1] = paperG;
      out[i + 2] = paperB;
    }
    out[i + 3] = 255;
  }
}

export interface KMCoverageLayer extends KMLayer {
  /** Density of one of the layer's dots: its opacity, as halftone dots are solid. */
  dotDensity: number;
}

/**
 * Mix a strip of *shrunk halftone* pixels the way the eye sees the print.
 * At full size every dot is solid, so each spot on the paper is bare, one
 * ink, or an overprint, each with its own KM colour; the eye averages those
 * colours. Shrinking first averages each layer's dots into partial density,
 * and KM-mixing that (kmMixPixels) gives half-strength ink everywhere: far
 * darker and muddier than half the paper under full-strength dots, with the
 * stronger ink swallowing the others.
 *
 * So read each layer's density as the fraction of the pixel its dots cover,
 * and average, in linear light, the KM colour of every combination of inks
 * weighted by how much of the pixel it would cover (Neugebauer mixing). The
 * layers' dots are taken to fall independently of each other, true of grain
 * and of dot screens at different angles. Same pixels and output as
 * kmMixPixels.
 */
export function kmMixCoverage(
  layers: KMCoverageLayer[],
  paperKS: readonly [number, number, number],
  out: Uint8ClampedArray,
): void {
  // Linear colour of every overprint combination: bit i of the index set
  // means layer i's ink is there, at full dot density.
  const combos = 1 << layers.length;
  const comboColour = new Float64Array(combos * 3);
  for (let mask = 0; mask < combos; mask++) {
    for (let c = 0; c < 3; c++) {
      let ks = paperKS[c];
      layers.forEach((layer, i) => {
        if (mask & (1 << i)) ks += layer.dotDensity * layer.weight * layer.ks[c];
      });
      comboColour[mask * 3 + c] = decodeSrgb(reflectanceFromKS(ks));
    }
  }
  const paper = [0, 1, 2].map((c) => encodeSrgb(comboColour[c]));

  // How much of the pixel each combination covers, built up layer by layer:
  // each inked layer splits every combination so far into with and without it.
  const share = new Float64Array(combos);
  const which = new Int32Array(combos);

  const count = out.length / 4;
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    let n = 1;
    share[0] = 1;
    which[0] = 0;
    for (let l = 0; l < layers.length; l++) {
      const layer = layers[l];
      if (layer.dotDensity <= 0) continue;
      const coverage = Math.min(1, (255 - layer.data[i]) / 255 / layer.dotDensity);
      if (coverage <= 0) continue;
      const bit = 1 << l;
      for (let k = 0; k < n; k++) {
        share[n + k] = share[k] * coverage;
        which[n + k] = which[k] | bit;
        share[k] *= 1 - coverage;
      }
      n *= 2;
    }

    if (n === 1) {
      out[i] = paper[0];
      out[i + 1] = paper[1];
      out[i + 2] = paper[2];
    } else {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < n; k++) {
        const o = which[k] * 3;
        r += share[k] * comboColour[o];
        g += share[k] * comboColour[o + 1];
        b += share[k] * comboColour[o + 2];
      }
      out[i] = encodeSrgb(r);
      out[i + 1] = encodeSrgb(g);
      out[i + 2] = encodeSrgb(b);
    }
    out[i + 3] = 255;
  }
}
