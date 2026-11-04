import { SRGB_TO_LINEAR, encodeSrgb } from './srgb';

/**
 * Antialiased downscaling for the fit preview. Each output pixel is a
 * Gaussian-weighted mean of the source pixels around its centre, the
 * Gaussian measured in output pixels (σ = half of one). A halftone too fine
 * for the output grid averages to the flat tone it reads as from a distance
 * instead of beating against the grid as moiré. Box and tent averages don't
 * manage that: their frequency response has sidelobes, so at some fit scales
 * a dot screen leaks through as ripple (±18% and ±4.5% at a 2.7× reduction);
 * a Gaussian's only falls.
 *
 * Colour is averaged alpha-weighted (premultiplied), so transparent pixels
 * contribute coverage but no colour.
 */

/** σ of the kernel, in output pixels. Wider is smoother but softer. */
const SIGMA = 0.5;
/** Taps beyond 3σ carry under 1% of the weight. */
const REACH = 3 * SIGMA;

/** For each output pixel along one axis: the source pixels it draws on and their normalised weights. */
interface Taps {
  offsets: Int32Array; // output i uses entries offsets[i] .. offsets[i + 1] - 1
  index: Int32Array;
  weight: Float32Array;
  /** Most source pixels any one output pixel uses. */
  maxSpan: number;
}

export function kernelTaps(srcLen: number, outLen: number): Taps {
  const ratio = srcLen / outLen;
  const offsets = new Int32Array(outLen + 1);
  const index: number[] = [];
  const weight: number[] = [];
  let maxSpan = 0;
  for (let i = 0; i < outLen; i++) {
    offsets[i] = index.length;
    const centre = (i + 0.5) * ratio;
    const first = Math.max(0, Math.floor(centre - REACH * ratio));
    const last = Math.min(srcLen - 1, Math.ceil(centre + REACH * ratio));
    let sum = 0;
    for (let x = first; x <= last; x++) {
      const d = (x + 0.5 - centre) / ratio; // in output pixels
      if (Math.abs(d) > REACH) continue;
      const w = Math.exp((-d * d) / (2 * SIGMA * SIGMA));
      index.push(x);
      weight.push(w);
      sum += w;
    }
    // Normalise, which also renormalises taps cut short by the image edge.
    for (let k = offsets[i]; k < index.length; k++) weight[k] /= sum;
    maxSpan = Math.max(maxSpan, index.length - offsets[i]);
  }
  offsets[outLen] = index.length;
  return { offsets, index: Int32Array.from(index), weight: Float32Array.from(weight), maxSpan };
}

const identity = new Float32Array(256).map((_, i) => i / 255);

/**
 * Downscale `src` to exactly `outW` × `outH` (each no larger than the source).
 *
 * @param linearLight - Average colour in linear light, as a screen or the eye
 *   blends neighbouring pixels: right for pixels that are already colour. Off
 *   for data that isn't light, such as ink density.
 */
export function downscale(src: ImageData, outW: number, outH: number, linearLight: boolean): ImageData {
  const { width: srcW, data } = src;
  const decode = linearLight ? SRGB_TO_LINEAR : identity;
  const h = kernelTaps(srcW, outW);
  const v = kernelTaps(src.height, outH);

  // Source rows reduced horizontally (premultiplied r·a, g·a, b·a, a), in a
  // ring just big enough for one output row's taps: neighbouring output rows
  // share most of theirs, and each source row is reduced once.
  const ringSize = v.maxSpan + 1;
  const ring = Array.from({ length: ringSize }, () => new Float32Array(outW * 4));
  const ringRow = new Int32Array(ringSize).fill(-1);
  function reducedRow(y: number): Float32Array {
    const slot = y % ringSize;
    const row = ring[slot];
    if (ringRow[slot] === y) return row;
    const base = y * srcW * 4;
    for (let ox = 0; ox < outW; ox++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = h.offsets[ox]; k < h.offsets[ox + 1]; k++) {
        const i = base + h.index[k] * 4;
        const wa = h.weight[k] * (data[i + 3] / 255);
        r += decode[data[i]] * wa;
        g += decode[data[i + 1]] * wa;
        b += decode[data[i + 2]] * wa;
        a += wa;
      }
      const o = ox * 4;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = a;
    }
    ringRow[slot] = y;
    return row;
  }

  const out = new ImageData(outW, outH);
  const dst = out.data;
  const acc = new Float32Array(outW * 4);
  for (let oy = 0; oy < outH; oy++) {
    acc.fill(0);
    for (let k = v.offsets[oy]; k < v.offsets[oy + 1]; k++) {
      const row = reducedRow(v.index[k]);
      const w = v.weight[k];
      for (let j = 0; j < acc.length; j++) acc[j] += row[j] * w;
    }
    const o = oy * outW * 4;
    for (let j = 0; j < acc.length; j += 4) {
      const a = acc[j + 3];
      if (a > 0) {
        for (let c = 0; c < 3; c++) {
          const value = Math.min(1, acc[j + c] / a);
          dst[o + j + c] = linearLight ? encodeSrgb(value) : value * 255;
        }
      }
      dst[o + j + 3] = a * 255;
    }
  }
  return out;
}
